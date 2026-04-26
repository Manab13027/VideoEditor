# ClipForge — Architecture & Code Review Reference

> Generated: 2026-04-26. Update this file whenever a new router, store, or pipeline stage is added.

---

## 1. Architecture Overview

### Runtime topology

```
Browser (Vite / React)
  ├── Zustand stores  ──────────────────────────────┐
  │     projectStore  (project, mediaFiles, tabs)   │
  │     timelineStore (clips, overlays, mode)       │
  │     audioStore    (tracks, muteOriginal, EQ)    │
  └── api/client.ts (axios, baseURL localhost:8000) │
            │                                        │
            ▼                                        │
FastAPI (backend/main.py)                           │
  Routers                                           │
  ├── /api/projects  — project CRUD                 │
  ├── /api/media     — upload, proxy, thumbnail     │
  ├── /api/audio     — import, waveform, beats, sync│
  ├── /api/export    — start/status/download        │
  ├── /api/batch     — multi-file operations        │
  ├── /api/ai        — captions, bg-remove, reframe │
  ├── /api/social    — hashtags, multi-export       │
  ├── /api/drive     — Google Drive OAuth+upload    │
  └── /ws/progress/{job_id} — WebSocket job updates │
            │
            ▼
  Services layer
  ├── ffmpeg_service.py  — all ffmpeg operations
  ├── export_service.py  — orchestrates full export pipeline
  └── audio_service.py   — waveform, beats, sync
            │
            ▼
  SQLite (aiosqlite, WAL mode)
  ├── projects    (id, name, timeline_json, timestamps)
  ├── media_files (id, project_id, stored_path, media_type, ...)
  └── jobs        (id, job_type, config_json, status, progress, ...)
```

### Key design decisions
- Timeline is stored as a **single JSON blob** (`timeline_json`) in the `projects` table. There is no normalised clips/tracks table.
- Export jobs are tracked **in-memory** (`_active_exports` dict in `export.py`) and persisted to `jobs` table only on completion/failure. Server restart loses in-flight jobs.
- Audio tracks live in `audioStore` (frontend) and are serialised into `timeline_json` when `saveTimeline()` is called. They do not have a dedicated DB table.
- `media_files.project_id` is nullable — all uploaded media (including audio) is global, not scoped to a project. The `project_id` FK is never set by any current router.

---

## 2. Critical Data Flows

### 2a. Media upload flow

```
FileDropZone / MediaBrowser
  → POST /api/media/upload (multipart)
  → media.py: probe → INSERT media_files → return MediaFileInfo
  → projectStore.addMediaFile(file)   [frontend cache]
```

`MediaFileInfo.id` is an **integer** from SQLite autoincrement. The frontend `MediaFile` interface types it as `string`. This works because JSON serialisation treats integers transparently, but any strict equality check (`===`) against an integer will fail.

### 2b. Audio import flow

```
(drag audio or FileDropZone)
  → POST /api/audio/import (multipart)
  → audio.py: write file → extract_waveform → INSERT media_files (media_type='audio')
  → returns { media_id: string, waveform, duration }
  → audioStore.addTrack({ id: generated, mediaId: returned media_id, ... })
```

`media_id` returned here is `str(cur.lastrowid)` — a string-ified integer. This becomes `AudioTrack.mediaId` in the store, which is what gets saved to `timeline_json`.

### 2c. Timeline save flow

```
ExportSettings.handleExport()  (or any manual save)
  → saveTimeline({ mode, clips, overlays, audioTracks, muteOriginal })
  → projectStore.saveTimeline(timeline)
  → PUT /api/projects/{id}  body: { timeline: Timeline }
  → projects.py: TimelineData.model_validate(payload.timeline)
  → model_dump_json() → UPDATE projects SET timeline_json
```

`TimelineData.model_dump_json()` uses **Pydantic's alias-aware serialisation**. Because `AudioTrackData.mediaId` has no `alias` configured, it serialises as `"mediaId"` (camelCase). This matches what `export_service.py` reads via `at.get("mediaId")`.

### 2d. Export pipeline (the critical path)

```
ExportSettings.handleExport()
  1. await saveTimeline(...)          ← MUST complete before step 2
  2. await startExport({ project_id, preset/quality, ... })
     → POST /api/export
     → export.py: resolve_export_settings()
     → asyncio.create_task(_run_export(...))   ← background

_run_export → build_export(project_id, output_path, settings)

build_export steps (all synchronous inside the async function):
  a. SELECT timeline_json FROM projects WHERE id = ?
  b. For each clip (sorted by clip.order):
       SELECT stored_path FROM media_files WHERE id = clip["media_id"]
       image  → image_to_video(stored_path, tmp_path, duration)
       video  → trim_video() or convert_format()
  c. concat_media(processed_clips, concat_path)       ← concat demuxer
  d. resize_video(concat_path, output_path, w, h)     ← letterbox pad
  e. READ timeline["audioTracks"], timeline["muteOriginal"]
  f. For each non-muted audio track:
       SELECT stored_path FROM media_files WHERE id = at["mediaId"]
       build enriched_tracks list
  g. mix_audio_tracks(output_path, mixed_tmp, enriched_tracks, mute_original)
  h. os.replace(mixed_tmp, output_path)               ← atomic swap
```

Order matters: step (d) produces the base video that (g) reads. Steps (a–d) use one DB connection; step (f) opens a **second** connection (`db2`). This is correct but unusual — a single connection would suffice.

### 2e. Audio mixing (ffmpeg filter_complex)

`mix_audio_tracks` builds a raw ffmpeg command string:

```
ffmpeg -y -i <base_video> -i <track1_audio> [-i <track2_audio> ...]
  -filter_complex "
    [1:a]atrim=0:{dur},asetpts=PTS-STARTPTS,adelay={ms}|{ms},volume={v}[a0];
    [2:a]...[a1];
    [0:a][a0][a1]amix=inputs=3:normalize=0[aout]
  "
  -map 0:v -map [aout] -c:v copy -c:a aac <output>
```

When `mute_original=True`, `[0:a]` is excluded from the amix inputs. When no active tracks and `mute_original=True`, the video audio stream is stripped with `-an`.

---

## 3. Key Contracts / Interfaces

### 3a. `TimelineData` (Pydantic — `backend/models/project.py`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `mode` | `str` | `"storyboard"` | `"storyboard"` or `"multitrack"` |
| `clips` | `list[ClipData]` | `[]` | sorted by `order` at export time |
| `overlays` | `list[OverlayData]` | `[]` | not used in export pipeline yet |
| `audioTracks` | `List[AudioTrackData]` | `[]` | **new** — must stay or audio is silently dropped |
| `muteOriginal` | `bool` | `False` | **new** — must stay or original audio is never muted |

**Contract:** If `audioTracks` or `muteOriginal` are removed from `TimelineData`, Pydantic will silently drop them during `model_validate`, the DB will not store them, and export will produce a video with no custom audio mixing. This has already happened once in this project.

### 3b. `AudioTrackData` (Pydantic — `backend/models/project.py`)

| Field | Type | Notes |
|---|---|---|
| `id` | `str` | frontend-generated, e.g. `"track-<timestamp>-<rand>"` |
| `type` | `str` | `"music"` \| `"voiceover"` \| `"original"` |
| `mediaId` | `str` | **camelCase** — matches frontend convention and `at.get("mediaId")` in export_service |
| `name` | `str` | display name only |
| `volume` | `float` | 0.0–1.0; passed to ffmpeg `volume=` filter |
| `offset` | `float` | seconds; converted to ms for `adelay` filter |
| `muted` | `bool` | muted tracks are skipped entirely in export |
| `duration` | `Optional[float]` | seconds to trim audio to; `None` means full file |
| `waveform` | `List[float]` | stored in DB but not used by ffmpeg |

**Contract:** `mediaId` MUST stay camelCase. `export_service.py` line 187 does `at.get("mediaId")` — a rename to `media_id` would silently return `None`, causing a DB lookup with `id = None` that returns no row, and the track is silently skipped from mixing.

### 3c. `ClipData` (Pydantic — `backend/models/project.py`)

| Field | Notes |
|---|---|
| `media_id` | **integer** in DB, stored as integer in JSON, `export_service` does `clip["media_id"]` — no `.get()` fallback, will `KeyError` if missing |
| `order` | sort key for concat ordering — must be set correctly |
| `type` | `"video"` or `"image"` — determines processing branch |
| `trim_start` / `trim_end` | used by `trim_video`; `trim_end=None` means no trim |

### 3d. Frontend `AudioTrack` interface (`frontend/src/types/index.ts`)

```typescript
interface AudioTrack {
  id: string;
  type: AudioTrackType;      // "original" | "music" | "voiceover"
  mediaId: string;           // matches AudioTrackData.mediaId
  name: string;
  volume: number;
  offset: number;
  muted: boolean;
  waveform: number[];
  duration?: number | null;
}
```

The `Timeline` interface in `types/index.ts` declares `audioTracks?: AudioTrack[]` and `muteOriginal?: boolean` as **optional**. If they are omitted from the object passed to `saveTimeline()`, the backend's `TimelineData` fills in defaults (empty list / false). This is safe but the `?` optionality means TypeScript won't warn if a caller forgets to pass them.

### 3e. `mediaId` flow — end-to-end

```
audio/import response  → media_id: str(int)  e.g. "42"
audioStore.addTrack    → AudioTrack.mediaId = "42"
saveTimeline()         → Timeline.audioTracks[n].mediaId = "42"
PUT /api/projects      → TimelineData validates → AudioTrackData.mediaId = "42"
model_dump_json()      → { "mediaId": "42" }   stored in DB
build_export reads     → at.get("mediaId") = "42"
DB query               → WHERE id = "42"    (SQLite coerces str→int, works)
```

SQLite's implicit type coercion saves this from breaking, but it is fragile: if `media_id` is ever stored as a true integer in JSON (`42` not `"42"`), `at.get("mediaId")` still returns the integer and the query still works. However any Python strict comparison would fail.

---

## 4. Known Fragile Points

### CRITICAL

**F1 — `mediaId` field name is the single point of failure for audio mixing**
- Location: `backend/models/project.py:33` and `backend/services/export_service.py:187`
- If `AudioTrackData.mediaId` is renamed to `media_id` (snake_case, to match `ClipData`), `at.get("mediaId")` returns `None`, the DB query silently returns nothing, and all audio tracks are silently dropped from the export.
- Pydantic does not error on unknown keys during `model_validate` by default.
- No test covers this code path end-to-end.

**F2 — `saveTimeline` must be called and awaited before `startExport`**
- Location: `frontend/src/components/export/ExportSettings.tsx:127`
- `handleExport` calls `await saveTimeline(...)` then `await startExport(...)`. If this order is ever changed, or if `saveTimeline` is made non-blocking, export will read stale timeline data from DB.
- There is no backend guard — `build_export` trusts that the timeline in DB is current.

**F3 — In-memory job store lost on restart**
- Location: `backend/routers/export.py:_active_exports`
- If the FastAPI process restarts while an export is in-flight, the job is lost from `_active_exports`. The status endpoint falls back to DB, which will show the old `"processing"` status forever (the UPDATE only runs on success/failure). The frontend will poll indefinitely.

**F4 — Audio tracks missing from `Timeline` type in frontend**
- Location: `frontend/src/types/index.ts:83-89`
- `Timeline.audioTracks` and `Timeline.muteOriginal` are both `?` (optional). TypeScript will not warn if a caller passes a `Timeline` object without them. The backend fills defaults, so functionally this is safe — but it means a future refactor could accidentally drop them and pass TypeScript checks.

### IMPORTANT

**F5 — Single-connection pattern broken for audio mixing**
- `build_export` closes `db` before opening `db2` for the audio lookup. This is correct (no concurrent writes), but it means if the audio DB lookup fails, the base video file at `output_path` is already written. The `os.replace` atomic swap protects against a corrupt mixed file, but a failure during audio lookup leaves a valid (unmixed) video at `output_path` that is then not returned — the job is marked failed.

**F6 — `acopy` filter used when no transforms are applied to an audio track**
- Location: `backend/services/ffmpeg_service.py:411`
- `acopy` is not a real ffmpeg audio filter; it is a codec copy specifier used as a filter name here. On some ffmpeg builds this may work, on others it silently passes through or errors. The correct filter for a no-op is `anull`.

**F7 — `resize_video` re-encodes audio unnecessarily**
- `resize_video` re-encodes to libx264+aac even when only resolution changes. Then `mix_audio_tracks` does a second encode (`-c:a aac`). The audio is encoded **twice** before final output, degrading quality (generation loss).

**F8 — Export progress is never updated between 0% and 100%**
- `_active_exports[job_id]["progress"]` is set to `0.0` at start and `1.0` at completion. The ffmpeg calls in `build_export` are blocking synchronous calls with no progress hooks. The frontend polls every 1 second and will show 0% until export completes.

**F9 — `probe_file` rejects audio-only files**
- Location: `backend/services/ffmpeg_service.py:28`
- `probe_file` raises `ValueError` if no video stream is found. Audio files uploaded through `/api/media/upload` (not `/api/audio/import`) would fail probe and be rejected with a 500 (probe is wrapped in a bare `except` in `media.py` so it actually silently stores `None` for width/height/duration).

**F10 — No validation that `ClipData.media_id` exists in `media_files` before export starts**
- If a media file is deleted from disk or DB after being added to the timeline, `build_export` raises `ValueError(f"Media file {media_id} not found")` mid-export after some clips may already be processed. Temp files from completed clips are cleaned up, but the partial state is not reported clearly.

### SUGGESTIONS

**F11 — `get_db()` opens a new connection on every call**
- There is no connection pool. Each router handler opens and closes its own connection. Under load this creates contention on the SQLite WAL. Consider a single shared connection with `check_same_thread=False` or an async connection pool.

**F12 — `audioStore` EQ and noiseReduction settings are never persisted**
- `audioStore` holds `eq` and `noiseReduction` state but `saveTimeline()` does not include them (they are not in the `Timeline` type). These settings are lost on page reload.

**F13 — `Timeline.audioTracks` uses frontend `AudioTrack[]` type which has `duration?: number | null`**
- Backend `AudioTrackData.duration` is `Optional[float]`. The frontend type allows both `undefined` and `null`. When serialised to JSON, `undefined` fields are omitted (Pydantic fills default `None`); `null` fields are sent as JSON `null`. Both round-trip correctly, but the dual-nullability is confusing.

---

## 5. Pre-Merge Checklists

### Before merging any change to `backend/models/project.py`

- [ ] `AudioTrackData.mediaId` field name is unchanged (camelCase). If you rename it, update `export_service.py:187` and all frontend serialisation in the same PR.
- [ ] `TimelineData` still declares `audioTracks: List[AudioTrackData]` and `muteOriginal: bool` with their defaults. Removing either drops the feature silently.
- [ ] `ClipData.media_id` stays as-is — `export_service.py:117` uses `clip["media_id"]` (no `.get()`).
- [ ] Run `TimelineData.model_validate({"clips": [], "audioTracks": [{"id": "x", "mediaId": "1", "type": "music"}], "muteOriginal": True})` and confirm no validation error.

### Before merging any change to `backend/services/export_service.py`

- [ ] `saveTimeline()` is still called (and awaited) before `startExport()` in the frontend — or add a backend check that timeline is not stale.
- [ ] `resize_video` is still called before `mix_audio_tracks` (steps d → g). Reversing the order would mix audio into the pre-resize file, then resize would re-encode audio again.
- [ ] `os.replace(mixed_tmp.name, output_path)` is still inside the `try/except` that deletes `mixed_tmp.name` on failure.
- [ ] `db2` is opened after `db` is closed (not before). Concurrent open connections to SQLite WAL is safe but watch for nesting.
- [ ] Enriched tracks list correctly skips `at.get("muted") == True` tracks.

### Before merging any change to `backend/services/ffmpeg_service.py`

- [ ] `mix_audio_tracks`: `acopy` no-op filter (line 411) — verify the target ffmpeg build accepts it, or replace with `anull`.
- [ ] `mix_audio_tracks`: When `mute_original=True` and no active tracks, the strip-audio branch runs a separate subprocess. If you refactor the main command path, ensure this branch is not accidentally removed.
- [ ] `concat_media`: uses `subprocess.run` (not `ffmpeg-python`) because the concat **demuxer** requires it. Do not convert this to `ffmpeg.input(..., f='concat')` — that uses the concat **filter** which requires matching stream parameters.
- [ ] Any new ffmpeg function should use `capture_stdout=True, capture_stderr=True` and raise `ValueError` on non-zero return. Never swallow ffmpeg stderr silently.

### Before merging any change to `frontend/src/types/index.ts`

- [ ] `AudioTrack.mediaId` stays camelCase and `string` typed.
- [ ] `Timeline.audioTracks` and `Timeline.muteOriginal` remain present (even as optional). Removing them causes `saveTimeline()` to not send them → backend drops them from DB → export produces unmixed output.
- [ ] `MediaFile.id` is typed as `string` but comes from DB as integer. Confirm no strict `===` number comparison is added.

### Before merging any change to `frontend/src/components/export/ExportSettings.tsx`

- [ ] `handleExport` must `await saveTimeline(...)` before calling `startExport(...)`. Never make this fire-and-forget.
- [ ] `saveTimeline` is called with `{ mode, clips, overlays, audioTracks, muteOriginal }` — all five fields. Adding a new timeline field (e.g. `transitions`) requires adding it here too.
- [ ] Poll interval (currently 1000ms) cleanup: both `clearInterval` paths (`useEffect` on status change and the `onUnmount` cleanup) must remain so polling doesn't leak.

### Before merging any change to `frontend/src/stores/audioStore.ts`

- [ ] `addTrack` / `updateTrack` / `removeTrack` do not mutate `muteOriginal`. Each is independent state.
- [ ] `reset()` is called when a new project is loaded, otherwise audio tracks from the previous session will persist in memory and be saved into the new project on next `saveTimeline()`.

### Before merging any change to `backend/routers/export.py`

- [ ] `_active_exports` is a module-level dict — it is shared across all requests but is not thread-safe if workers are added. Currently safe because FastAPI's default async event loop is single-threaded.
- [ ] The `_run_export` background task updates `_active_exports` and then writes to DB. If the background task panics before the DB write, the job status in DB stays `"processing"` forever. Add a `finally` block or a heartbeat mechanism before adding more steps.
- [ ] `output_path = f"{output_dir}/{job_id}.{request.container}"` — `request.container` is user-supplied. While `job_id` is a UUID (safe), ensure `request.container` is validated to an allowlist before use in a path. Currently `CONTAINERS = ["mp4", "mov", "mkv", "webm", "avi"]` is defined in the frontend only — the backend accepts any string.

---

## 6. File Map (quick reference)

| Purpose | File |
|---|---|
| Pydantic models for DB round-trip | `backend/models/project.py` |
| SQLite schema | `backend/database.py` |
| Export orchestration | `backend/services/export_service.py` |
| All ffmpeg operations | `backend/services/ffmpeg_service.py` |
| Audio waveform / beats / sync | `backend/services/audio_service.py` |
| Export HTTP router | `backend/routers/export.py` |
| Media upload/proxy/thumbnail | `backend/routers/media.py` |
| Audio import/waveform/beats | `backend/routers/audio.py` |
| Project CRUD | `backend/routers/projects.py` |
| Frontend type contracts | `frontend/src/types/index.ts` |
| Audio state (tracks, EQ, NR) | `frontend/src/stores/audioStore.ts` |
| Clip/overlay state | `frontend/src/stores/timelineStore.ts` |
| Project/media/tab state | `frontend/src/stores/projectStore.ts` |
| Save + export trigger | `frontend/src/components/export/ExportSettings.tsx` |
| Multi-track canvas | `frontend/src/components/edit/Timeline.tsx` |
| HTTP client functions | `frontend/src/api/client.ts` |
