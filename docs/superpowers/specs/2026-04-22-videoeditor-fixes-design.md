# VideoEditor Fixes & Audio Stack — Design Spec

> **Date:** 2026-04-22

## Goal
Fix broken batch/export/AI features, add timeline auto-scale and multi-clip merge, and build the complete audio stack (backend + frontend).

## Architecture — 4 Parallel Workstreams

### WS-A: Bug Fixes (Batch, Export, AI)
- **Export**: Frontend timeline state is never persisted to DB before export → `build_export` sees empty `timeline_json`. Fix: call `saveTimeline` before `startExport`. Also: `ExportRequest.bitrate` is `Optional[str]` but frontend sends `int` → Pydantic 422 error. Fix: change field to `Optional[int]` and format as `"{n}M"` in service.
- **AI**: `catch (e) → String(e)` yields "AxiosError: …" not the real detail. Fix: extract `e?.response?.data?.detail`.
- **Batch**: Structurally correct; output_dir `/tmp/batch_output` creation is guarded. Improvements: surface per-file errors and poll interval tweak.

### WS-B: Timeline Auto-Scale + Merge
- Replace fixed `PX_PER_SEC = 80` with `ResizeObserver` on the track container to derive `pxPerSec = containerWidth / totalDuration`, then multiply by a zoom factor (0.25×–4×).
- Add `selectedClipIds: string[]` + `toggleClipSelection` to `timelineStore`. Ctrl+Click adds clips to selection.
- Merge button appears when 2+ clips selected → `POST /api/media/merge` → ffmpeg trim + concat → new `MediaFile` → replaces selected clips in timeline.

### WS-C: Audio Stack
- **Backend**: `backend/routers/audio.py` (4 endpoints) + `backend/services/audio_service.py` (soundfile + librosa + ffmpeg).
- **Frontend**: `frontend/src/components/edit/AudioTrack.tsx` replaces the placeholder row in `Timeline.tsx`. Supports drag-drop, canvas waveform, volume slider, beat markers.

## Component Boundaries

| Unit | Responsibility |
|---|---|
| `audio_service.py` | I/O and processing: waveform extraction, beat detection, audio sync |
| `audio.py` router | HTTP boundary: validate input, call service, return JSON |
| `AudioTrack.tsx` | UI: drag-drop, waveform canvas, volume, beat markers |
| `timelineStore` additions | multi-select state only — no server calls |
| `media.py /merge` endpoint | Concat selected clips into one MediaFile via ffmpeg |

## Data Flow — Export Fix
1. User clicks Export → `ExportSettings.handleExport()`
2. Snapshot `timelineStore.clips` + `mode` + `overlays`
3. `await saveTimeline(snapshot)` → `PUT /api/projects/{id}` → persists `timeline_json`
4. `await startExport({ project_id, ... })` → backend reads `timeline_json` → builds video

## Data Flow — Merge
1. User Ctrl+Clicks clips → `selectedClipIds` in store
2. Clicks "Merge N Clips" → frontend collects `[{media_id, trim_start, trim_end}]` in order
3. `POST /api/media/merge` → backend trims each → concat → saves new MediaFile
4. Frontend removes selected clips, inserts new clip with merged `media_id`

## Data Flow — Audio Import
1. User drops audio file onto AudioTrack → `POST /audio/import`
2. Backend: store file, extract waveform array, return `{media_id, filename, waveform, duration}`
3. Frontend: `audioStore.addTrack(...)` + render waveform bars on canvas

## Tech Stack
- Backend: FastAPI, aiosqlite, ffmpeg-python, soundfile, librosa (optional — fallback if absent)
- Frontend: React, Zustand, TypeScript, Canvas API for waveform
