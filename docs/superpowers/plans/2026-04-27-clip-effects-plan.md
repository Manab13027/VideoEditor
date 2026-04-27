# Clip Effects — Group A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add crop-to-new-file, audio fade in/out controls, and 20-transition library to ClipForge.

**Architecture:** Three independent features share this plan. Crop spawns a new media record on the backend and rewires the clip's `media_id`. Audio fades add `fade_in`/`fade_out` fields to `AudioTrack`, rendered in the timeline label column and properties panel, applied via ffmpeg `afade` filters during export. Transitions extend the existing `transition_in` / `transition_dur` clip fields with a full 20-type picker UI and an ffmpeg `xfade` filter-complex pipeline that replaces the plain concat demuxer when any clip has a non-none transition.

**Tech Stack:** React 18 + TypeScript (frontend), FastAPI + aiosqlite (backend), ffmpeg-python + subprocess ffmpeg (media processing), Zustand (state), Pydantic v2 (models).

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/types/index.ts` | Expand `TransitionType` to 21 values; add `fade_in`/`fade_out` to `AudioTrack` |
| `backend/models/project.py` | Add `fade_in: float` / `fade_out: float` to `AudioTrackData` |
| `backend/routers/media.py` | Add `POST /api/media/{id}/crop-new` endpoint |
| `frontend/src/api/client.ts` | Add `cropToNewFile()` API call |
| `frontend/src/components/edit/PropertiesPanel.tsx` | Change crop button behaviour; add transition section; add audio properties section |
| `frontend/src/components/edit/TransitionPicker.tsx` | **Create** — reusable 5-col grid transition picker |
| `frontend/src/components/edit/Timeline.tsx` | Add fade sliders to audio label column; add T badge between clips |
| `backend/services/ffmpeg_service.py` | Update `mix_audio_tracks()` for afade; add `apply_transitions_concat()` |
| `backend/services/export_service.py` | Use `apply_transitions_concat()` when any clip has a transition |
| `tests/test_transitions.py` | **Create** — backend unit tests for transition pipeline |

---

## Task 1: Expand Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Replace TransitionType and add fade fields**

Open `frontend/src/types/index.ts`. Replace the existing `TransitionType` line and `AudioTrack` interface with:

```typescript
// was: "none" | "fade" | "crossfade" | "wipe_left" | "wipe_right" | "zoom_in" | "glitch"
export type TransitionType =
  | "none"
  | "fade"
  | "crossfade"
  | "wipe_left"
  | "wipe_right"
  | "wipe_up"
  | "wipe_down"
  | "slide_left"
  | "slide_right"
  | "zoom_in"
  | "zoom_out"
  | "blur"
  | "flash"
  | "glitch"
  | "pixelate"
  | "film_burn"
  | "radial"
  | "circle"
  | "reveal"
  | "fade_black"
  | "fade_white";
```

In the same file, add `fade_in` and `fade_out` to `AudioTrack`:

```typescript
export interface AudioTrack {
  id: string;
  type: AudioTrackType;
  mediaId: string;
  name: string;
  volume: number;       // 0.0 – 1.0
  offset: number;       // seconds from composition start
  muted: boolean;
  waveform: number[];
  duration?: number | null;
  fade_in?: number;     // seconds, 0 = no fade (NEW)
  fade_out?: number;    // seconds, 0 = no fade (NEW)
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): expand TransitionType to 21 values; add fade_in/fade_out to AudioTrack"
```

---

## Task 2: Update Backend AudioTrackData Model

**Files:**
- Modify: `backend/models/project.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_audio_fade_model.py`:

```python
"""Test AudioTrackData fade fields are persisted in TimelineData."""
from backend.models.project import AudioTrackData, TimelineData


def test_audio_track_data_has_fade_fields():
    t = AudioTrackData(id="t1", mediaId="1", name="test.mp3")
    assert t.fade_in == 0.0
    assert t.fade_out == 0.0


def test_audio_track_data_accepts_fade_values():
    t = AudioTrackData(id="t1", mediaId="1", name="test.mp3", fade_in=1.5, fade_out=2.0)
    assert t.fade_in == 1.5
    assert t.fade_out == 2.0


def test_timeline_data_serialises_fade_fields():
    tl = TimelineData(audioTracks=[
        AudioTrackData(id="t1", mediaId="1", name="x.mp3", fade_in=0.5, fade_out=1.0)
    ])
    j = tl.model_dump()
    assert j["audioTracks"][0]["fade_in"] == 0.5
    assert j["audioTracks"][0]["fade_out"] == 1.0
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor
.venv/bin/pytest tests/test_audio_fade_model.py -v
```

Expected: `AttributeError: 'AudioTrackData' object has no attribute 'fade_in'`

- [ ] **Step 3: Add fade fields to AudioTrackData**

In `backend/models/project.py`, update `AudioTrackData`:

```python
class AudioTrackData(BaseModel):
    """Represents one audio track in the timeline (music, voiceover, etc.)."""
    id: str
    type: str = "music"
    mediaId: str
    name: str = ""
    volume: float = 1.0
    offset: float = 0.0
    muted: bool = False
    duration: Optional[float] = None
    waveform: List[float] = Field(default_factory=list)
    fade_in: float = 0.0   # seconds; 0 = no fade
    fade_out: float = 0.0  # seconds; 0 = no fade
```

- [ ] **Step 4: Run test — expect PASS**

```bash
.venv/bin/pytest tests/test_audio_fade_model.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/models/project.py tests/test_audio_fade_model.py
git commit -m "feat(models): add fade_in/fade_out to AudioTrackData"
```

---

## Task 3: Crop-to-New-File Backend Endpoint

**Files:**
- Modify: `backend/routers/media.py`

- [ ] **Step 1: Write failing test**

Add to `tests/test_media_router.py` (create the file if it doesn't exist):

```python
"""Tests for media router crop-new endpoint."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_crop_new_returns_404_for_missing_media():
    response = client.post("/api/media/99999/crop-new", json={"x": 0, "y": 0, "w": 100, "h": 100})
    assert response.status_code == 404
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
.venv/bin/pytest tests/test_media_router.py::test_crop_new_returns_404_for_missing_media -v
```

Expected: 404 on the endpoint itself (route not found → 422 or 404).

- [ ] **Step 3: Add the crop-new endpoint to media.py**

In `backend/routers/media.py`, after the existing `apply_crop_to_file` endpoint, add:

```python
@router.post("/{media_id}/crop-new", response_model=MediaFileInfo)
async def crop_to_new_file(media_id: int, body: CropRequest) -> MediaFileInfo:
    """Crop a media file and save the result as a NEW file.

    The original file is untouched. Returns the new MediaFileInfo.
    The caller is responsible for updating their clip's media_id to the new ID.
    """
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media file {media_id} not found")

    stored_path = row["stored_path"]
    original_filename = row["filename"]
    media_type = row["media_type"]

    # Build new filename: insert _cropped before extension
    stem = Path(stored_path).stem
    ext = Path(stored_path).suffix
    new_filename = f"{stem}_cropped{ext}"
    new_path = str(settings.upload_dir / new_filename)

    # Avoid collisions — append counter if file exists
    counter = 1
    while Path(new_path).exists():
        new_filename = f"{stem}_cropped_{counter}{ext}"
        new_path = str(settings.upload_dir / new_filename)
        counter += 1

    try:
        crop_video(stored_path, new_path, body.x, body.y, body.w, body.h)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Crop failed: {exc}") from exc

    # Probe new file for updated dimensions
    width, height, duration_seconds = body.w, body.h, row["duration_seconds"]
    if media_type == "video":
        try:
            probe = probe_file(new_path)
            width = probe.width
            height = probe.height
            duration_seconds = probe.duration_seconds
        except Exception:
            pass

    file_size = Path(new_path).stat().st_size
    display_name = f"{Path(original_filename).stem}_cropped{Path(original_filename).suffix}"

    db2: aiosqlite.Connection = await get_db()
    try:
        cursor = await db2.execute(
            """
            INSERT INTO media_files
                (filename, original_path, stored_path, media_type, format,
                 file_size_bytes, width, height, duration_seconds, project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                display_name,
                display_name,
                new_path,
                media_type,
                ext.lstrip("."),
                file_size,
                width,
                height,
                duration_seconds,
                row["project_id"],
            ),
        )
        await db2.commit()
        new_id = cursor.lastrowid
        async with db2.execute("SELECT * FROM media_files WHERE id = ?", (new_id,)) as cur:
            new_row = await cur.fetchone()
    finally:
        await db2.close()

    return _row_to_media_info(new_row)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
.venv/bin/pytest tests/test_media_router.py::test_crop_new_returns_404_for_missing_media -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media.py tests/test_media_router.py
git commit -m "feat(media): add POST /api/media/{id}/crop-new endpoint"
```

---

## Task 4: Crop-to-New-File Frontend

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/edit/PropertiesPanel.tsx`

- [ ] **Step 1: Add API call in client.ts**

In `frontend/src/api/client.ts`, after the existing `applyCrop` line, add:

```typescript
export const cropToNewFile = (
  id: string,
  crop: { x: number; y: number; w: number; h: number }
): Promise<{ data: MediaFile }> => api.post(`/media/${id}/crop-new`, crop);
```

- [ ] **Step 2: Update PropertiesPanel crop button**

In `frontend/src/components/edit/PropertiesPanel.tsx`:

**Add import at top:**
```typescript
import { cropToNewFile } from "../../api/client";
```

**Update the store destructure** to also get `updateClip` and `addMediaFile`:
```typescript
const { selectedClipId, clips, updateClip } = useTimelineStore();
const { mediaFiles, addMediaFile } = useProjectStore();
```

**Replace `handleSaveApply`** with:
```typescript
const handleSaveApply = async () => {
  if (!media || applying) return;
  setApplying(true);
  setApplyMsg(null);
  try {
    const res = await cropToNewFile(String(media.id), crop);
    const newMedia = res.data;
    // Add new file to media browser
    addMediaFile(newMedia);
    // Rewire this clip to point at the new cropped file
    updateClip(clip.id, { media_id: newMedia.id, crop: null });
    setApplyMsg(`Saved as ${newMedia.filename}`);
  } catch {
    setApplyMsg("Save failed.");
  } finally {
    setApplying(false);
  }
};
```

**Update button label:**
```tsx
<button
  onClick={handleSaveApply}
  disabled={applying}
  className="btn btn-primary"
  style={{ marginTop: 8, width: "100%", fontSize: 12, padding: "5px 0" }}
>
  {applying ? "Saving…" : "Save as New File"}
</button>
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/edit/PropertiesPanel.tsx
git commit -m "feat(crop): save crop as new file, rewire clip media_id"
```

---

## Task 5: Audio Fades in ffmpeg mix_audio_tracks

**Files:**
- Modify: `backend/services/ffmpeg_service.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_audio_fades.py`:

```python
"""Unit tests for audio fade filter generation in mix_audio_tracks."""
import pytest
from unittest.mock import patch, call
import subprocess


def _run_mix(video_path, output_path, tracks, mute_original=False):
    """Helper to call mix_audio_tracks and capture the ffmpeg command."""
    from backend.services.ffmpeg_service import mix_audio_tracks
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        with patch("ffmpeg.probe") as mock_probe:
            mock_probe.return_value = {"streams": [{"codec_type": "audio"}]}
            mix_audio_tracks(video_path, output_path, tracks, mute_original)
    return mock_run.call_args[0][0]  # the cmd list


def test_fade_in_adds_afade_in_filter(tmp_path):
    cmd = _run_mix(
        "video.mp4", str(tmp_path / "out.mp4"),
        [{"stored_path": "a.mp3", "volume": 1.0, "offset": 0, "duration": 10.0,
          "muted": False, "fade_in": 1.5, "fade_out": 0.0}]
    )
    filter_str = " ".join(cmd)
    assert "afade=t=in:st=0:d=1.5" in filter_str


def test_fade_out_adds_afade_out_filter(tmp_path):
    cmd = _run_mix(
        "video.mp4", str(tmp_path / "out.mp4"),
        [{"stored_path": "a.mp3", "volume": 1.0, "offset": 0, "duration": 10.0,
          "muted": False, "fade_in": 0.0, "fade_out": 2.0}]
    )
    filter_str = " ".join(cmd)
    assert "afade=t=out:st=8.0:d=2.0" in filter_str  # st = 10.0 - 2.0


def test_no_fade_when_both_zero(tmp_path):
    cmd = _run_mix(
        "video.mp4", str(tmp_path / "out.mp4"),
        [{"stored_path": "a.mp3", "volume": 1.0, "offset": 0, "duration": 5.0,
          "muted": False, "fade_in": 0.0, "fade_out": 0.0}]
    )
    filter_str = " ".join(cmd)
    assert "afade" not in filter_str
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
.venv/bin/pytest tests/test_audio_fades.py -v
```

Expected: 3 FAILED (afade not in filter string).

- [ ] **Step 3: Update mix_audio_tracks to apply afade**

In `backend/services/ffmpeg_service.py`, find the `mix_audio_tracks` function. Inside the `for i, track in enumerate(active):` loop, locate where `parts` is built and update it to add afade filters:

```python
    for i, track in enumerate(active):
        cmd.extend(["-i", track["stored_path"]])
        idx = i + 1  # video is input 0
        label_out = f"[a{i}]"
        parts = []

        duration = track.get("duration")
        if duration:
            parts.append(f"atrim=0:{duration}")
            parts.append("asetpts=PTS-STARTPTS")

        # Fade in
        fade_in = track.get("fade_in", 0.0) or 0.0
        if fade_in > 0:
            parts.append(f"afade=t=in:st=0:d={fade_in}")

        # Fade out — starts at (duration - fade_out) seconds
        fade_out = track.get("fade_out", 0.0) or 0.0
        if fade_out > 0 and duration and duration > fade_out:
            fade_out_start = round(duration - fade_out, 6)
            parts.append(f"afade=t=out:st={fade_out_start}:d={fade_out}")

        offset_ms = int(track.get("offset", 0) * 1000)
        if offset_ms > 0:
            parts.append(f"adelay={offset_ms}|{offset_ms}")

        volume = track.get("volume", 1.0)
        if volume != 1.0:
            parts.append(f"volume={volume}")

        if not parts:
            parts.append("anull")  # was "acopy" — fixed: anull is the correct no-op audio filter

        filter_chain = ",".join(parts)
        filter_parts.append(f"[{idx}:a]{filter_chain}{label_out}")
        audio_labels.append(label_out)
```

Note: also change the fallback from `"acopy"` to `"anull"` — this fixes the F6 bug from the architecture review.

- [ ] **Step 4: Run tests — expect PASS**

```bash
.venv/bin/pytest tests/test_audio_fades.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/ffmpeg_service.py tests/test_audio_fades.py
git commit -m "feat(audio): apply afade in/out in mix_audio_tracks; fix anull no-op filter"
```

---

## Task 6: Audio Fade Sliders in Timeline Label Column

**Files:**
- Modify: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Add fade slider helper inside MultiTrack component**

In `frontend/src/components/edit/Timeline.tsx`, inside the `MultiTrack` function, add this helper just before the `return` statement:

```tsx
// Renders a compact labelled slider for fade_in / fade_out
const FadeSlider = ({
  trackId, field, value, icon,
}: {
  trackId: string; field: "fade_in" | "fade_out"; value: number; icon: string;
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
    <span style={{ fontSize: 9, color: "var(--text-secondary)", width: 14, flexShrink: 0 }}>{icon}</span>
    <input
      type="range" min={0} max={5} step={0.1}
      value={value}
      onChange={(e) => updateTrack(trackId, { [field]: Number(e.target.value) })}
      style={{ flex: 1, height: 3, accentColor: field === "fade_in" ? "#533483" : "#e94560", cursor: "pointer" }}
    />
    <span style={{ fontSize: 9, color: "var(--text-primary)", width: 24, textAlign: "right", flexShrink: 0 }}>
      {value.toFixed(1)}s
    </span>
  </div>
);
```

- [ ] **Step 2: Add FadeSlider to each audio track's label row**

Find the audio track label rendering block (the `audioTracks.map((t) => ...)` in the left label column). Replace the inner div with:

```tsx
audioTracks.map((t) => (
  <div key={t.id} style={{
    height: audioRowH, borderBottom: "1px solid var(--border)",
    display: "flex", flexDirection: "column", justifyContent: "center",
    padding: "4px 8px", gap: 2,
  }}>
    {/* Track name + mute */}
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
      <button onClick={() => updateTrack(t.id, { muted: !t.muted })}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>
        {t.muted ? "🔇" : "🔊"}
      </button>
      <span style={{
        fontSize: 9, color: t.muted ? "#f87171" : "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
      }}>{t.name}</span>
    </div>
    {/* Fade sliders */}
    <FadeSlider trackId={t.id} field="fade_in"  value={t.fade_in  ?? 0} icon="▶︎" />
    <FadeSlider trackId={t.id} field="fade_out" value={t.fade_out ?? 0} icon="⏹" />
  </div>
))
```

Because the label rows now need more vertical space, bump `audioRowH`:

```tsx
// was: const audioRowH = AUDIO_H + ROW_PAD * 2;  → 44px
const audioRowH = 72;  // enough for name + 2 sliders
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/edit/Timeline.tsx
git commit -m "feat(timeline): add fade_in/fade_out sliders to audio track label column"
```

---

## Task 7: Audio Properties in PropertiesPanel

**Files:**
- Modify: `frontend/src/components/edit/PropertiesPanel.tsx`

- [ ] **Step 1: Import audioStore and wire selectedAudioId**

The `selectedAudioId` and `updateTrack` already live in `Timeline.tsx`'s `MultiTrack`. We need to lift them to a shared place or pass them via a context. The simplest approach: store `selectedAudioId` in `audioStore`.

In `frontend/src/stores/audioStore.ts`, add:

```typescript
// Add to AudioState interface:
selectedTrackId: string | null;
setSelectedTrackId: (id: string | null) => void;

// Add to create():
selectedTrackId: null,
setSelectedTrackId: (id) => set({ selectedTrackId: id }),

// Add to reset():
selectedTrackId: null,
```

- [ ] **Step 2: Use selectedTrackId in Timeline.tsx**

In `frontend/src/components/edit/Timeline.tsx`, replace the local `const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);` with:

```tsx
const { tracks: audioTracks, addTrack, removeTrack, updateTrack, muteOriginal, setMuteOriginal,
        selectedTrackId: selectedAudioId, setSelectedTrackId: setSelectedAudioId } = useAudioStore();
```

Remove the now-redundant `useState` line for `selectedAudioId`.

- [ ] **Step 3: Add AudioProperties section to PropertiesPanel**

In `frontend/src/components/edit/PropertiesPanel.tsx`, add at the top:

```typescript
import { useAudioStore } from "../../stores/audioStore";
```

Inside `PropertiesPanel`, add after the existing clip properties and before the closing `</div>`:

```tsx
// Audio track properties — shown when an audio track is selected
function AudioProperties() {
  const { tracks, selectedTrackId, updateTrack } = useAudioStore();
  const track = tracks.find((t) => t.id === selectedTrackId) ?? null;

  if (!track) return null;

  const dur = track.duration ?? 30;

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <Section>
        <Label>🎵 Audio Track</Label>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
      </Section>

      {/* Volume */}
      <Section>
        <Label>Volume</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={1} step={0.01}
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {Math.round(track.volume * 100)}%
          </span>
        </div>
      </Section>

      {/* Fade In */}
      <Section>
        <Label>▶︎ Fade In</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={5} step={0.1}
            value={track.fade_in ?? 0}
            onChange={(e) => updateTrack(track.id, { fade_in: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#533483" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {(track.fade_in ?? 0).toFixed(1)}s
          </span>
        </div>
        {/* Curve preview */}
        <svg width="100%" height="20" viewBox="0 0 200 20" preserveAspectRatio="none"
          style={{ marginTop: 4, display: "block" }}>
          <path d="M0,20 Q80,20 100,0 L200,0" fill="none" stroke="#533483" strokeWidth="1.5" />
          <path d="M0,20 Q80,20 100,0 L200,0 L200,20 Z" fill="rgba(83,52,131,0.2)" />
        </svg>
      </Section>

      {/* Fade Out */}
      <Section>
        <Label>⏹ Fade Out</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={5} step={0.1}
            value={track.fade_out ?? 0}
            onChange={(e) => updateTrack(track.id, { fade_out: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {(track.fade_out ?? 0).toFixed(1)}s
          </span>
        </div>
        <svg width="100%" height="20" viewBox="0 0 200 20" preserveAspectRatio="none"
          style={{ marginTop: 4, display: "block" }}>
          <path d="M0,0 L100,0 Q120,0 200,20" fill="none" stroke="#e94560" strokeWidth="1.5" />
          <path d="M0,0 L100,0 Q120,0 200,20 L0,20 Z" fill="rgba(233,69,96,0.1)" />
        </svg>
      </Section>

      {/* Offset */}
      <Section>
        <Label>⏱ Offset</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={60} step={0.1}
            value={track.offset}
            onChange={(e) => updateTrack(track.id, { offset: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#3fb950" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 40, textAlign: "right" }}>
            {track.offset.toFixed(1)}s
          </span>
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Wire AudioProperties into the PropertiesPanel render**

In `PropertiesPanel`'s render, at the very top:

```tsx
export function PropertiesPanel() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles, addMediaFile } = useProjectStore();
  const { selectedTrackId } = useAudioStore();
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  // Show audio properties if an audio track is selected
  if (selectedTrackId) return <AudioProperties />;

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  // ... rest of existing code unchanged
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/audioStore.ts frontend/src/components/edit/Timeline.tsx frontend/src/components/edit/PropertiesPanel.tsx
git commit -m "feat(audio): audio properties panel with volume, fade in/out, offset sliders"
```

---

## Task 8: TransitionPicker Component

**Files:**
- Create: `frontend/src/components/edit/TransitionPicker.tsx`

- [ ] **Step 1: Create TransitionPicker**

Create `frontend/src/components/edit/TransitionPicker.tsx`:

```tsx
import type { TransitionType } from "../../types";

interface TransitionDef {
  type: TransitionType;
  label: string;
  icon: string;
}

export const TRANSITIONS: TransitionDef[] = [
  { type: "none",       label: "None",       icon: "⛔" },
  { type: "fade",       label: "Fade",       icon: "🌫️" },
  { type: "crossfade",  label: "Crossfade",  icon: "🔄" },
  { type: "wipe_left",  label: "Wipe ←",     icon: "⬅️" },
  { type: "wipe_right", label: "Wipe →",     icon: "➡️" },
  { type: "wipe_up",    label: "Wipe ↑",     icon: "⬆️" },
  { type: "wipe_down",  label: "Wipe ↓",     icon: "⬇️" },
  { type: "slide_left", label: "Slide ←",    icon: "🔀" },
  { type: "slide_right",label: "Slide →",    icon: "↔️" },
  { type: "zoom_in",    label: "Zoom In",    icon: "🔍" },
  { type: "zoom_out",   label: "Zoom Out",   icon: "🔎" },
  { type: "blur",       label: "Blur",       icon: "💨" },
  { type: "flash",      label: "Flash",      icon: "⚡" },
  { type: "glitch",     label: "Glitch",     icon: "📺" },
  { type: "pixelate",   label: "Pixelate",   icon: "🟦" },
  { type: "film_burn",  label: "Film Burn",  icon: "🎞️" },
  { type: "radial",     label: "Radial",     icon: "🌀" },
  { type: "circle",     label: "Circle",     icon: "⭕" },
  { type: "reveal",     label: "Reveal",     icon: "🃏" },
  { type: "fade_black", label: "Fade Black", icon: "⬛" },
  { type: "fade_white", label: "Fade White", icon: "⬜" },
];

interface TransitionPickerProps {
  value: TransitionType;
  duration: number;   // seconds
  onChange: (type: TransitionType, duration: number) => void;
}

export function TransitionPicker({ value, duration, onChange }: TransitionPickerProps) {
  return (
    <div>
      {/* Duration slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary)", width: 52, flexShrink: 0 }}>Duration</span>
        <input
          type="range" min={0.2} max={2} step={0.1}
          value={duration}
          onChange={(e) => onChange(value, Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 10, color: "var(--text-primary)", width: 28, textAlign: "right", flexShrink: 0 }}>
          {duration.toFixed(1)}s
        </span>
      </div>

      {/* 5-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
        {TRANSITIONS.map((t) => {
          const active = t.type === value;
          return (
            <button
              key={t.type}
              onClick={() => onChange(t.type, duration)}
              title={t.label}
              style={{
                border: `${active ? 2 : 1}px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "5px 2px",
                background: active ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
                cursor: "pointer",
                textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 8, color: active ? "var(--accent)" : "var(--text-secondary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/edit/TransitionPicker.tsx
git commit -m "feat(ui): TransitionPicker component — 21 transitions, duration slider"
```

---

## Task 9: Wire TransitionPicker into PropertiesPanel + T Badge in Timeline

**Files:**
- Modify: `frontend/src/components/edit/PropertiesPanel.tsx`
- Modify: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Add Transition section to PropertiesPanel**

In `frontend/src/components/edit/PropertiesPanel.tsx`, add import:

```typescript
import { TransitionPicker } from "./TransitionPicker";
```

Inside `PropertiesPanel`, after the Duration/Speed section and before the closing `</div>`, add:

```tsx
{/* TRANSITION */}
<Section>
  <Label>Transition In</Label>
  <TransitionPicker
    value={clip.transition_in ?? "none"}
    duration={clip.transition_dur ?? 0.5}
    onChange={(type, dur) => updateClip(clip.id, { transition_in: type, transition_dur: dur })}
  />
</Section>
```

- [ ] **Step 2: Add T badge between clips in Timeline**

In `frontend/src/components/edit/Timeline.tsx`, inside the video+image row where clips are rendered, after each clip block (but before the next) add a transition badge. Find the `{sorted.map((clip, i) => { ... })}` block and after the closing `</div>` of each clip key block, add:

```tsx
{/* T badge — shown between this clip and the next */}
{i < sorted.length - 1 && (
  <div
    onClick={() => selectClip(sorted[i + 1].id)}
    title={`Transition into next clip: ${sorted[i + 1].transition_in ?? "none"}`}
    style={{
      position: "absolute",
      left: (clipStarts[i] + clipDurs[i]) * PPS - 10,
      top: ROW_PAD + VIDEO_H / 2 - 9,
      width: 18, height: 18,
      borderRadius: "50%",
      background: (sorted[i + 1].transition_in && sorted[i + 1].transition_in !== "none")
        ? "var(--accent)" : "var(--bg-tertiary)",
      border: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 8, fontWeight: 700,
      color: (sorted[i + 1].transition_in && sorted[i + 1].transition_in !== "none")
        ? "#fff" : "var(--text-secondary)",
      cursor: "pointer", zIndex: 5,
      userSelect: "none",
    }}
  >
    T
  </div>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/edit/PropertiesPanel.tsx frontend/src/components/edit/Timeline.tsx
git commit -m "feat(transitions): picker in PropertiesPanel + T badge between clips in timeline"
```

---

## Task 10: apply_transitions_concat Backend Function

**Files:**
- Modify: `backend/services/ffmpeg_service.py`
- Create: `tests/test_transitions.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_transitions.py`:

```python
"""Tests for apply_transitions_concat."""
import subprocess
import pytest
from unittest.mock import patch


def _run_transitions(clip_paths, clip_durations, transitions, output_path):
    from backend.services.ffmpeg_service import apply_transitions_concat
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        apply_transitions_concat(clip_paths, clip_durations, transitions, output_path)
    return mock_run.call_args[0][0]


def test_single_clip_no_transition_uses_copy(tmp_path):
    cmd = _run_transitions(
        ["a.mp4"], [5.0], [("none", 0.5)], str(tmp_path / "out.mp4")
    )
    # With one clip and no transition, should just do a simple re-encode copy
    assert "a.mp4" in cmd


def test_two_clips_with_transition_uses_xfade(tmp_path):
    cmd = _run_transitions(
        ["a.mp4", "b.mp4"], [5.0, 4.0],
        [("none", 0.5), ("fade", 0.5)],
        str(tmp_path / "out.mp4")
    )
    cmd_str = " ".join(cmd)
    assert "xfade" in cmd_str
    assert "dissolve" in cmd_str  # "fade" maps to "dissolve"


def test_xfade_offset_calculated_correctly(tmp_path):
    # clip0=5s, clip1 has fade transition 0.5s → xfade offset = 5.0 - 0.5 = 4.5
    cmd = _run_transitions(
        ["a.mp4", "b.mp4"], [5.0, 3.0],
        [("none", 0.5), ("fade", 0.5)],
        str(tmp_path / "out.mp4")
    )
    cmd_str = " ".join(cmd)
    assert "offset=4.5" in cmd_str


def test_three_clips_cumulative_offsets(tmp_path):
    # clip0=5s fade0.5, clip1=4s fade0.5, clip2
    # xfade1 offset = 5.0 - 0.5 = 4.5
    # xfade2 offset = 4.5 + 4.0 - 0.5 = 8.0
    cmd = _run_transitions(
        ["a.mp4", "b.mp4", "c.mp4"], [5.0, 4.0, 3.0],
        [("none", 0.5), ("fade", 0.5), ("wipe_left", 0.5)],
        str(tmp_path / "out.mp4")
    )
    cmd_str = " ".join(cmd)
    assert "offset=4.5" in cmd_str
    assert "offset=8.0" in cmd_str
    assert "wipeleft" in cmd_str
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
.venv/bin/pytest tests/test_transitions.py -v
```

Expected: ImportError or AttributeError — function not defined yet.

- [ ] **Step 3: Add apply_transitions_concat to ffmpeg_service.py**

Add at the bottom of `backend/services/ffmpeg_service.py`:

```python
# Maps our TransitionType names → ffmpeg xfade transition names
_XFADE_MAP: dict[str, str] = {
    "fade":       "dissolve",
    "crossfade":  "fadeblack",
    "wipe_left":  "wipeleft",
    "wipe_right": "wiperight",
    "wipe_up":    "wipeup",
    "wipe_down":  "wipedown",
    "slide_left": "slideleft",
    "slide_right":"slideright",
    "zoom_in":    "zoomin",
    "zoom_out":   "smoothdown",
    "blur":       "hblur",
    "flash":      "fadewhite",
    "glitch":     "pixelize",
    "pixelate":   "pixelize",
    "film_burn":  "fadegrays",
    "radial":     "radial",
    "circle":     "circlecrop",
    "reveal":     "revealleft",
    "fade_black": "fadeblack",
    "fade_white": "fadewhite",
}


def apply_transitions_concat(
    clip_paths: List[str],
    clip_durations: List[float],
    transitions: List[tuple],   # list of (transition_type: str, duration: float) per clip; index 0 ignored
    output_path: str,
) -> str:
    """Concatenate clips with xfade transitions between them.

    transitions[i] = (type, dur) applied BEFORE clip i.
    transitions[0] is always ignored (no transition before first clip).
    Falls back to simple concat when all transitions are 'none'.

    Returns output_path on success. Raises ValueError on failure.
    """
    if not clip_paths:
        raise ValueError("clip_paths must not be empty")
    if len(clip_paths) != len(clip_durations) or len(clip_paths) != len(transitions):
        raise ValueError("clip_paths, clip_durations, and transitions must have equal length")

    n = len(clip_paths)

    # Check if any non-none transition is present
    has_transitions = any(
        t[0] not in ("none", None) for t in transitions[1:]
    )

    if n == 1 or not has_transitions:
        # No transitions — use simple concat demuxer
        return concat_media(clip_paths, output_path)

    # Build ffmpeg command with xfade filter_complex
    cmd = ["ffmpeg", "-y"]
    for p in clip_paths:
        cmd.extend(["-i", p])

    video_filters: list[str] = []
    audio_filters: list[str] = []

    # Label each input video/audio stream
    prev_v = "[0:v]"
    prev_a = "[0:a]"
    cumulative_offset: float = clip_durations[0]

    for i in range(1, n):
        t_type, t_dur = transitions[i]
        xfade_name = _XFADE_MAP.get(t_type, "dissolve")
        offset = round(cumulative_offset - t_dur, 6)

        out_v = f"[v{i}]"
        out_a = f"[a{i}]"

        video_filters.append(
            f"{prev_v}[{i}:v]xfade=transition={xfade_name}:duration={t_dur}:offset={offset}{out_v}"
        )
        audio_filters.append(
            f"{prev_a}[{i}:a]acrossfade=d={t_dur}{out_a}"
        )

        prev_v = out_v
        prev_a = out_a
        cumulative_offset = offset + clip_durations[i]

    filter_complex = ";".join(video_filters + audio_filters)

    cmd += [
        "-filter_complex", filter_complex,
        "-map", prev_v,
        "-map", prev_a,
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "aac",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValueError(f"Failed to apply transitions: {result.stderr}")

    return output_path
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
.venv/bin/pytest tests/test_transitions.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/ffmpeg_service.py tests/test_transitions.py
git commit -m "feat(ffmpeg): add apply_transitions_concat with xfade filter-complex pipeline"
```

---

## Task 11: Wire Transitions into Export Pipeline

**Files:**
- Modify: `backend/services/export_service.py`

- [ ] **Step 1: Update import at top of export_service.py**

In `backend/services/export_service.py`, update the import from `ffmpeg_service`:

```python
from backend.services.ffmpeg_service import (
    concat_media,
    apply_transitions_concat,
    image_to_video,
    mix_audio_tracks,
    resize_video,
    trim_video,
)
```

- [ ] **Step 2: Replace concat_media call with apply_transitions_concat**

In `build_export`, find the "Concatenate all clips" section. Replace it:

```python
        # Concatenate all clips (with transitions if any clip has one)
        transitions = [
            (c.get("transition_in") or "none", float(c.get("transition_dur") or 0.5))
            for c in clips
        ]
        has_any_transition = any(t[0] not in ("none", None) for t in transitions[1:])

        if len(processed_clips) == 1:
            concat_path = processed_clips[0]
            tmp_files = [f for f in tmp_files if f != concat_path]
            owns_concat = False
        else:
            concat_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            concat_tmp.close()
            concat_path = concat_tmp.name
            owns_concat = True

            # Compute clip durations for xfade offset calculation
            clip_dur_map = {c["id"]: clipDurs_map.get(c["id"], 5.0) for c in clips}

            if has_any_transition:
                clip_durations = [clip_dur_map.get(c["id"], 5.0) for c in clips]
                apply_transitions_concat(processed_clips, clip_durations, transitions, concat_path)
            else:
                concat_media(processed_clips, concat_path)
```

Also, before the "Fetch media file paths" loop, build `clipDurs_map` so durations are available:

```python
        # Pre-compute clip durations for transition offsets
        clipDurs_map: dict = {}
        for clip in clips:
            trim_start = clip.get("trim_start", 0.0)
            trim_end = clip.get("trim_end")
            clip_duration = clip.get("duration")
            clip_type = clip.get("type", "video")
            if clip_type == "image":
                clipDurs_map[clip["id"]] = float(clip_duration or 3.0)
            elif trim_end is not None and trim_end > trim_start:
                clipDurs_map[clip["id"]] = float(trim_end - trim_start)
            else:
                clipDurs_map[clip["id"]] = 5.0  # fallback; actual duration from probe
```

- [ ] **Step 2: TypeScript check is not applicable — run backend tests**

```bash
.venv/bin/pytest tests/test_transitions.py tests/test_audio_fades.py tests/test_audio_fade_model.py -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/services/export_service.py
git commit -m "feat(export): use apply_transitions_concat when clips have transitions"
```

---

## Task 12: Smoke Test End-to-End

- [ ] **Step 1: Start dev servers**

Terminal 1 (backend):
```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Terminal 2 (frontend):
```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npm run dev
```

- [ ] **Step 2: Test crop-to-new-file**

1. Open http://localhost:5173, create or open a project
2. Drop a video file into the timeline
3. Click the clip → PropertiesPanel opens
4. Set W=400, H=300, click **Save as New File**
5. Expected: new file appears in media browser with `_cropped` in name; clip now references it

- [ ] **Step 3: Test audio fades**

1. Drop an audio file into Multi-track → audio lane
2. In label column: drag ▶︎ slider to 1.0s, drag ⏹ slider to 1.5s
3. Click the audio block → PropertiesPanel shows audio properties
4. Adjust fade_in/fade_out via sliders there too
5. Click Export → download the video and verify audio fades in/out

- [ ] **Step 4: Test transitions**

1. Add two or more video/image clips
2. Click the second clip → PropertiesPanel → Transition In → pick "Zoom In"
3. Check that T badge between clips turns red
4. Export → verify zoom-in transition in output video

- [ ] **Step 5: Run full test suite**

```bash
.venv/bin/pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(clipforge): crop-to-new-file, audio fades, 21-transition library — Group A complete"
```
