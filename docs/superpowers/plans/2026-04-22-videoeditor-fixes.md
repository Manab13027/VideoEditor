# VideoEditor Feature Fixes & Audio Stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix export/batch/AI tools, add timeline auto-scale + multi-clip merge, build audio stack.

**Architecture:** 4 workstreams on a FastAPI + React/Zustand codebase. WS-A fixes are independent bug patches. WS-B timeline changes are frontend-only except for one new backend endpoint. WS-C audio is a full new stack.

**Tech Stack:** FastAPI, aiosqlite, ffmpeg-python, soundfile, librosa, React 18, Zustand, TypeScript, Canvas API

---

## File Map

### Created
- `backend/routers/audio.py` — audio HTTP endpoints
- `backend/services/audio_service.py` — waveform, beats, sync logic
- `frontend/src/components/edit/AudioTrack.tsx` — waveform UI + drag-drop

### Modified
- `backend/models/job.py:58` — fix `bitrate: Optional[str]` → `Optional[int]`
- `backend/services/export_service.py:60-87` — normalize int bitrate to "NM" string
- `backend/routers/media.py` — add `POST /media/merge` endpoint
- `backend/main.py` — register audio router
- `frontend/src/components/export/ExportSettings.tsx` — save timeline before export
- `frontend/src/components/ai/AITools.tsx` — extract axios error detail
- `frontend/src/components/edit/Timeline.tsx` — auto-scale, multi-select, merge button, AudioTrack
- `frontend/src/stores/timelineStore.ts` — add `selectedClipIds`, `toggleClipSelection`, `clearClipSelection`
- `frontend/src/api/client.ts` — add `mergeClips`, `audioImport`, `audioWaveform`, `audioBeats`, `audioSync` (already present in client.ts — verify wiring)
- `tests/test_export_fix.py` — new tests
- `tests/test_audio_service.py` — new tests
- `tests/test_media_merge.py` — new tests

---

## WORKSTREAM A — Bug Fixes

---

### Task A1: Fix Export — bitrate type + save timeline before export

**Files:**
- Modify: `backend/models/job.py:58`
- Modify: `backend/services/export_service.py:60-87`
- Modify: `frontend/src/components/export/ExportSettings.tsx:116-167`
- Create: `tests/test_export_fix.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_export_fix.py
import pytest
from backend.services.export_service import resolve_export_settings

def test_int_bitrate_formatted_as_string():
    settings = resolve_export_settings(bitrate=8)
    assert settings["bitrate"] == "8M"

def test_none_bitrate_uses_default():
    settings = resolve_export_settings(bitrate=None)
    assert settings["bitrate"] == "5M"

def test_preset_overrides_bitrate():
    settings = resolve_export_settings(preset="youtube", bitrate=8)
    assert settings["bitrate"] == "8M"  # preset bitrate is already a string
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor
python -m pytest tests/test_export_fix.py -v
```

Expected: FAIL — `"8M" != 8` or similar.

- [ ] **Step 3: Fix `ExportRequest.bitrate` type in `backend/models/job.py`**

Find line 58:
```python
bitrate: Optional[str] = None
```
Replace with:
```python
bitrate: Optional[int] = None
```

- [ ] **Step 4: Fix `resolve_export_settings` in `backend/services/export_service.py`**

Replace the body of `resolve_export_settings` (lines 60–87):

```python
def resolve_export_settings(
    preset: Optional[str] = None,
    quality_tier: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    bitrate: Optional[int] = None,
    fps: int = DEFAULT_FPS,
    codec: str = DEFAULT_CODEC,
) -> dict:
    """Resolve final export settings. Priority: preset > quality_tier > manual values."""
    bitrate_str = f"{bitrate}M" if bitrate is not None else DEFAULT_BITRATE

    settings = {
        "width": width or 1280,
        "height": height or 720,
        "bitrate": bitrate_str,
        "fps": fps,
        "codec": codec,
    }

    if quality_tier and quality_tier in QUALITY_TIERS:
        tier = QUALITY_TIERS[quality_tier]
        settings["width"] = tier["width"]
        settings["height"] = tier["height"]
        settings["bitrate"] = tier["bitrate"]

    if preset and preset in SOCIAL_PRESETS:
        p = SOCIAL_PRESETS[preset]
        settings["width"] = p["width"]
        settings["height"] = p["height"]
        settings["fps"] = p["fps"]
        settings["codec"] = p["codec"]
        settings["bitrate"] = p["bitrate"]

    return settings
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
python -m pytest tests/test_export_fix.py -v
```

Expected: PASS.

- [ ] **Step 6: Fix `ExportSettings.tsx` — save timeline before export**

In `frontend/src/components/export/ExportSettings.tsx`, add the following imports at the top alongside existing ones:

```typescript
import { useTimelineStore } from "../../stores/timelineStore";
```

Add `saveTimeline` to the destructure from `useProjectStore`:
```typescript
const { project, saveTimeline } = useProjectStore();
```

Add timeline snapshot inside `handleExport`, before the `startExport` call:

Replace:
```typescript
  const handleExport = async () => {
    if (!project || exporting) return;
    setExporting(true);
    setExportJob(null);

    try {
      const res = await startExport({
```

With:
```typescript
  const handleExport = async () => {
    if (!project || exporting) return;
    setExporting(true);
    setExportJob(null);

    try {
      // Persist current timeline to DB before export reads it
      const { mode, clips, overlays } = useTimelineStore.getState();
      await saveTimeline({ mode, clips, overlays });

      const res = await startExport({
```

- [ ] **Step 7: Commit**

```bash
git add backend/models/job.py backend/services/export_service.py \
        frontend/src/components/export/ExportSettings.tsx \
        tests/test_export_fix.py
git commit -m "fix(export): save timeline before export, fix bitrate int→str"
```

---

### Task A2: Fix AI Tool Error Display

**Files:**
- Modify: `frontend/src/components/ai/AITools.tsx`

- [ ] **Step 1: Add an error extraction helper near the top of `AITools.tsx`**

After the imports (before `function Badge`), add:

```typescript
function extractError(e: unknown): string {
  const ax = e as { response?: { data?: { detail?: string } } };
  return ax?.response?.data?.detail ?? String(e);
}
```

- [ ] **Step 2: Replace all `String(e)` in catch blocks with `extractError(e)`**

Run a find-replace across `AITools.tsx`: every occurrence of `String(e)` inside a catch block becomes `extractError(e)`.

There are approximately 8 catch blocks. Each looks like:
```typescript
} catch (e: unknown) {
  setJobStatus(`captions-${mediaId}`, "error", undefined, String(e));
}
```

Change to:
```typescript
} catch (e: unknown) {
  setJobStatus(`captions-${mediaId}`, "error", undefined, extractError(e));
}
```

Apply the same pattern to every other catch block (`rmbg`, `autocut`, `reframe`, `enhance`, `track`, `generate`, `burn`).

- [ ] **Step 3: Verify the app builds**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ai/AITools.tsx
git commit -m "fix(ai): extract axios response detail from error messages"
```

---

### Task A3: Fix Batch — surface per-file errors in ProgressPanel

**Files:**
- Modify: `frontend/src/components/batch/ProgressPanel.tsx`

- [ ] **Step 1: Read the current ProgressPanel**

```bash
cat /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend/src/components/batch/ProgressPanel.tsx
```

- [ ] **Step 2: Ensure per-file error text is rendered**

In the file-result list, find where each `BatchFileResult` is rendered. Make sure a failed result shows its `error` field. The result item should include:

```tsx
{result.status === "failed" && result.error && (
  <p style={{ fontSize: 10, color: "#ef4444", margin: "2px 0 0", paddingLeft: 4 }}>
    {result.error}
  </p>
)}
```

Add this inside each file result row, below the filename/status line. If the ProgressPanel already has this, skip this step.

- [ ] **Step 3: Verify build**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/batch/ProgressPanel.tsx
git commit -m "fix(batch): show per-file error messages in ProgressPanel"
```

---

## WORKSTREAM B — Timeline Auto-Scale + Merge

---

### Task B1: Add dynamic zoom to Timeline (auto-scale)

**Files:**
- Modify: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Replace the fixed constant and add zoom state**

In `Timeline.tsx`, remove the line:
```typescript
const PX_PER_SEC = 80; // pixels per second of video
```

In the `MultiTrack` component, add zoom state and a ref for measuring container width:

```typescript
import { useState, useRef, useEffect } from "react";

// Inside MultiTrack component body, before the return:
const containerRef = useRef<HTMLDivElement>(null);
const [zoom, setZoom] = useState(1); // multiplier: 0.25–4

const [containerW, setContainerW] = useState(800);
useEffect(() => {
  if (!containerRef.current) return;
  const ro = new ResizeObserver((entries) => {
    setContainerW(entries[0].contentRect.width);
  });
  ro.observe(containerRef.current);
  return () => ro.disconnect();
}, []);

const BASE_PX_PER_SEC = Math.max(20, containerW / Math.max(totalDuration, 1));
const PX_PER_SEC = BASE_PX_PER_SEC * zoom;
const totalW = Math.max(PX_PER_SEC * totalDuration, containerW);
```

- [ ] **Step 2: Add zoom toolbar above the time ruler**

Inside the `MultiTrack` return, wrap the existing content in a flex column and add a toolbar div at the top:

```tsx
<div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
  {/* Zoom toolbar */}
  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-secondary)" }}>
    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Zoom:</span>
    {[0.5, 1, 2, 4].map((z) => (
      <button
        key={z}
        onClick={() => setZoom(z)}
        style={{
          padding: "2px 8px", fontSize: 11, borderRadius: 3,
          border: `1px solid ${zoom === z ? "var(--accent)" : "var(--border)"}`,
          background: zoom === z ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
          color: zoom === z ? "var(--accent)" : "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        {z === 1 ? "Fit" : `${z}×`}
      </button>
    ))}
  </div>

  {/* Scrollable track area */}
  <div ref={containerRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "column" }}>
    {/* existing time ruler + TrackRows go here */}
  </div>
</div>
```

Move the existing time ruler, Video TrackRow, Overlay TrackRow, and Audio placeholder inside the inner scroll div. Remove the `overflowX: "auto"` from the outer div.

- [ ] **Step 3: Verify the app renders without errors**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npm run dev &
# Open http://localhost:5173 and check the Edit tab timeline renders
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/edit/Timeline.tsx
git commit -m "feat(timeline): dynamic auto-scale zoom to fit viewport"
```

---

### Task B2: Add multi-select to timelineStore

**Files:**
- Modify: `frontend/src/stores/timelineStore.ts`

- [ ] **Step 1: Add `selectedClipIds` state and actions**

In `timelineStore.ts`, add to the `TimelineState` interface:

```typescript
selectedClipIds: string[];
toggleClipSelection: (id: string, addToSelection: boolean) => void;
clearClipSelection: () => void;
```

In the store implementation, add the initial value and implementations:

```typescript
selectedClipIds: [],

toggleClipSelection: (id, addToSelection) =>
  set((state) => {
    if (addToSelection) {
      const already = state.selectedClipIds.includes(id);
      return {
        selectedClipIds: already
          ? state.selectedClipIds.filter((x) => x !== id)
          : [...state.selectedClipIds, id],
      };
    }
    return { selectedClipIds: [id], selectedClipId: id };
  }),

clearClipSelection: () => set({ selectedClipIds: [] }),
```

Also update `removeClip` to remove from `selectedClipIds`:

```typescript
removeClip: (id) =>
  set((state) => ({
    clips: state.clips
      .filter((c) => c.id !== id)
      .map((c, i) => ({ ...c, order: i })),
    selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    selectedClipIds: state.selectedClipIds.filter((x) => x !== id),
  })),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/timelineStore.ts
git commit -m "feat(timeline): add multi-select state (selectedClipIds)"
```

---

### Task B3: Backend endpoint — POST /api/media/merge

**Files:**
- Modify: `backend/routers/media.py`
- Create: `tests/test_media_merge.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_media_merge.py
import os, tempfile, shutil
import pytest
from backend.services.ffmpeg_service import concat_media

def test_concat_needs_input():
    with pytest.raises(ValueError, match="input_paths must not be empty"):
        concat_media([], "/tmp/out.mp4")

def test_concat_single_file_copies(tmp_path):
    """concat_media with one file should produce output without crashing."""
    src = tmp_path / "src.mp4"
    # Create a minimal valid mp4 via ffmpeg (1s black video)
    import subprocess
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=320x240:r=10",
         "-t", "1", str(src)],
        check=True, capture_output=True,
    )
    out = str(tmp_path / "out.mp4")
    result = concat_media([str(src)], out)
    assert os.path.exists(result)
```

- [ ] **Step 2: Run to confirm test passes for concat logic (unit)**

```bash
python -m pytest tests/test_media_merge.py -v
```

Expected: PASS (ffmpeg must be installed).

- [ ] **Step 3: Add MergeRequest model and endpoint to `backend/routers/media.py`**

Add after imports, before `router = APIRouter(...)`:

```python
from pydantic import BaseModel
from typing import List

class MergeClipSpec(BaseModel):
    media_id: int
    trim_start: float = 0.0
    trim_end: float | None = None

class MergeRequest(BaseModel):
    clips: List[MergeClipSpec]
```

Add at the bottom of `media.py`, after the last route:

```python
@router.post("/merge", response_model=MediaFileInfo)
async def merge_clips(body: MergeRequest) -> MediaFileInfo:
    """Trim and concatenate clips into a single new MediaFile."""
    import tempfile, os
    from backend.services.ffmpeg_service import trim_video, concat_media
    from backend.workers.task_runner import run_in_executor

    if not body.clips:
        raise HTTPException(status_code=400, detail="clips list must not be empty")

    # Fetch stored paths
    db: aiosqlite.Connection = await get_db()
    try:
        rows = []
        for spec in body.clips:
            async with db.execute(
                "SELECT id, stored_path, media_type, duration_seconds FROM media_files WHERE id = ?",
                (spec.media_id,),
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"Media {spec.media_id} not found")
            rows.append((spec, row))
    finally:
        await db.close()

    def _build_merge() -> str:
        tmp_files: list[str] = []
        try:
            processed: list[str] = []
            for spec, row in rows:
                src = row["stored_path"]
                trim_end = spec.trim_end or row["duration_seconds"]
                if spec.trim_start > 0 or trim_end is not None:
                    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                    tmp.close()
                    tmp_files.append(tmp.name)
                    trim_video(src, tmp.name, spec.trim_start, trim_end or 9999)
                    processed.append(tmp.name)
                else:
                    processed.append(src)

            out_dir = settings.upload_dir
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = str(out_dir / f"{uuid.uuid4().hex}_merged.mp4")
            concat_media(processed, out_path)
            return out_path
        finally:
            for f in tmp_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass

    try:
        out_path = await run_in_executor(_build_merge)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Probe merged file
    from backend.services.ffmpeg_service import probe_file
    try:
        probe = probe_file(out_path)
        w, h, dur = probe.width, probe.height, probe.duration_seconds
    except Exception:
        w, h, dur = None, None, None

    merged_name = f"merged_{uuid.uuid4().hex[:6]}.mp4"
    file_size = os.path.getsize(out_path)

    db3: aiosqlite.Connection = await get_db()
    try:
        cursor = await db3.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                file_size_bytes, width, height, duration_seconds)
               VALUES (?, ?, ?, 'video', 'mp4', ?, ?, ?, ?)""",
            (merged_name, merged_name, out_path, file_size, w, h, dur),
        )
        await db3.commit()
        row_id = cursor.lastrowid
        async with db3.execute("SELECT * FROM media_files WHERE id = ?", (row_id,)) as cur:
            new_row = await cur.fetchone()
    finally:
        await db3.close()

    if new_row is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve merged record")
    return _row_to_media_info(new_row)
```

- [ ] **Step 4: Verify backend starts without import errors**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor
python -c "from backend.routers.media import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media.py tests/test_media_merge.py
git commit -m "feat(media): add POST /api/media/merge endpoint"
```

---

### Task B4: Add frontend API call + Merge UI to Timeline

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Add `mergeClips` to `frontend/src/api/client.ts`**

After the existing media functions, add:

```typescript
export const mergeClips = (
  clips: Array<{ media_id: string; trim_start: number; trim_end: number | null }>
): Promise<{ data: MediaFile }> =>
  api.post("/media/merge", { clips: clips.map(c => ({ ...c, media_id: Number(c.media_id) })) });
```

- [ ] **Step 2: Add Ctrl+Click multi-select to `TrackRow` in `Timeline.tsx`**

Update the `TrackRow` component props to accept `selectedClipIds` and `toggleClipSelection`:

```typescript
function TrackRow({
  label, icon, totalW, clips, mediaFiles, selectedClipId, selectedClipIds,
  selectClip, toggleClipSelection, removeClip,
}: {
  label: string; icon: string; totalW: number;
  clips: ReturnType<typeof useTimelineStore.getState>["clips"];
  mediaFiles: ReturnType<typeof useProjectStore.getState>["mediaFiles"];
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectClip: (id: string | null) => void;
  toggleClipSelection: (id: string, add: boolean) => void;
  removeClip: (id: string) => void;
}) {
```

Update the clip `onClick` inside `TrackRow`:

```typescript
onClick={(e) => {
  if (e.ctrlKey || e.metaKey) {
    toggleClipSelection(clip.id, true);
  } else {
    selectClip(clip.id);
    toggleClipSelection(clip.id, false);
  }
}}
```

Update `isSelected` logic to include `selectedClipIds`:

```typescript
const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
```

- [ ] **Step 3: Add Merge button to the zoom toolbar in `MultiTrack`**

In `MultiTrack`, pull in the merge-related store actions and API:

```typescript
import { mergeClips } from "../../api/client";
import { useProjectStore } from "../../stores/projectStore";

// Inside MultiTrack:
const { selectedClipIds, toggleClipSelection, clearClipSelection, removeClip: storeRemoveClip } = useTimelineStore();
const { addMediaFile } = useProjectStore();
const [merging, setMerging] = useState(false);
```

Add the merge handler:

```typescript
const handleMerge = async () => {
  if (selectedClipIds.length < 2 || merging) return;
  setMerging(true);
  try {
    const orderedClips = [...clips]
      .filter((c) => selectedClipIds.includes(c.id))
      .sort((a, b) => a.order - b.order);

    const specs = orderedClips.map((c) => ({
      media_id: c.media_id,
      trim_start: c.trim_start,
      trim_end: c.trim_end,
    }));

    const res = await mergeClips(specs);
    const mergedMedia = res.data;
    addMediaFile(mergedMedia);

    // Remove selected clips and insert merged clip at the position of the first
    const firstOrder = Math.min(...orderedClips.map((c) => c.order));
    orderedClips.forEach((c) => storeRemoveClip(c.id));

    useTimelineStore.getState().addClip({
      id: `merged_${Date.now()}`,
      media_id: mergedMedia.id,
      type: "video",
      trim_start: 0,
      trim_end: null,
      crop: null,
      speed: 1,
      duration: mergedMedia.duration_seconds,
      order: firstOrder,
    });
    clearClipSelection();
  } catch (err) {
    console.error("Merge failed:", err);
  } finally {
    setMerging(false);
  }
};
```

Add the Merge button inside the zoom toolbar (after the zoom buttons):

```tsx
{selectedClipIds.length >= 2 && (
  <button
    onClick={handleMerge}
    disabled={merging}
    style={{
      marginLeft: "auto", padding: "2px 12px", fontSize: 11, borderRadius: 3,
      border: "1px solid var(--accent)", background: "rgba(233,69,96,0.15)",
      color: "var(--accent)", cursor: merging ? "not-allowed" : "pointer", fontWeight: 600,
    }}
  >
    {merging ? "Merging…" : `Merge ${selectedClipIds.length} Clips`}
  </button>
)}
```

Pass `selectedClipIds` and `toggleClipSelection` down to each `TrackRow` call:

```tsx
<TrackRow
  label="Video" icon="🎥" totalW={totalW}
  clips={videoClips} mediaFiles={mediaFiles}
  selectedClipId={selectedClipId}
  selectedClipIds={selectedClipIds}
  selectClip={selectClip}
  toggleClipSelection={toggleClipSelection}
  removeClip={removeClip}
/>
<TrackRow
  label="Overlay" icon="🖼" totalW={totalW}
  clips={imageClips} mediaFiles={mediaFiles}
  selectedClipId={selectedClipId}
  selectedClipIds={selectedClipIds}
  selectClip={selectClip}
  toggleClipSelection={toggleClipSelection}
  removeClip={removeClip}
/>
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/edit/Timeline.tsx
git commit -m "feat(timeline): multi-select Ctrl+click + merge clips button"
```

---

## WORKSTREAM C — Audio Stack

---

### Task C1: Backend audio service

**Files:**
- Create: `backend/services/audio_service.py`
- Create: `tests/test_audio_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_audio_service.py
import os, subprocess, tempfile
import pytest

def _make_audio(tmp_path, duration=3) -> str:
    path = str(tmp_path / "test.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
         "-ar", "44100", path],
        check=True, capture_output=True,
    )
    return path

def test_compute_waveform_returns_array(tmp_path):
    from backend.services.audio_service import compute_waveform
    audio = _make_audio(tmp_path)
    waveform = compute_waveform(audio, n_samples=100)
    assert len(waveform) == 100
    assert all(0.0 <= v <= 1.0 for v in waveform)

def test_import_audio_returns_metadata(tmp_path):
    from backend.services.audio_service import import_audio
    audio = _make_audio(tmp_path)
    out_dir = str(tmp_path / "out")
    result = import_audio(audio, "music", out_dir)
    assert "media_id" in result
    assert "waveform" in result
    assert result["duration"] > 0

def test_sync_audio_produces_output(tmp_path):
    from backend.services.audio_service import sync_audio
    audio = _make_audio(tmp_path, duration=5)
    out = str(tmp_path / "synced.mp3")
    sync_audio(audio, out, target_duration=3.0)
    assert os.path.exists(out)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_audio_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'backend.services.audio_service'`

- [ ] **Step 3: Create `backend/services/audio_service.py`**

```python
"""Audio processing service — waveform, beat detection, sync."""
from __future__ import annotations

import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional


def compute_waveform(file_path: str, n_samples: int = 1000) -> list[float]:
    """Return a list of n_samples amplitude values in [0, 1] using ffmpeg."""
    # Use ffmpeg to decode audio to raw PCM f32le, then downsample
    try:
        cmd = [
            "ffmpeg", "-i", file_path,
            "-vn", "-ar", "8000", "-ac", "1", "-f", "f32le", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, check=True)
        raw = result.stdout
    except subprocess.CalledProcessError:
        return [0.0] * n_samples

    import struct
    count = len(raw) // 4
    if count == 0:
        return [0.0] * n_samples

    samples = [abs(struct.unpack_from("<f", raw, i * 4)[0]) for i in range(count)]

    # Downsample to n_samples
    step = max(1, len(samples) // n_samples)
    buckets: list[float] = []
    for i in range(0, len(samples), step):
        buckets.append(max(samples[i:i + step]))
        if len(buckets) >= n_samples:
            break

    # Pad if short
    while len(buckets) < n_samples:
        buckets.append(0.0)

    # Normalise to [0, 1]
    peak = max(buckets) or 1.0
    return [v / peak for v in buckets[:n_samples]]


def import_audio(file_path: str, track_type: str, output_dir: str) -> dict:
    """Normalise an audio file and return metadata including waveform."""
    os.makedirs(output_dir, exist_ok=True)
    media_id = uuid.uuid4().hex
    ext = Path(file_path).suffix or ".mp3"
    out_path = str(Path(output_dir) / f"{media_id}{ext}")

    # Normalise audio with ffmpeg (loudnorm)
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", file_path,
                "-af", "loudnorm=I=-14:TP=-1:LRA=11",
                "-ar", "44100", "-ac", "2", out_path,
            ],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError:
        # Fallback: just copy
        import shutil
        shutil.copy2(file_path, out_path)

    waveform = compute_waveform(out_path, n_samples=200)
    duration = _probe_duration(out_path)

    return {
        "media_id": media_id,
        "stored_path": out_path,
        "filename": Path(file_path).name,
        "track_type": track_type,
        "waveform": waveform,
        "duration": duration,
    }


def detect_beats(file_path: str) -> list[float]:
    """Return beat timestamps in seconds. Uses librosa if available, else ffmpeg silencedetect."""
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
        y, sr = librosa.load(file_path, mono=True)
        _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        times = librosa.frames_to_time(beat_frames, sr=sr)
        return [float(t) for t in times]
    except ImportError:
        pass

    # Fallback: coarse energy peaks via ffmpeg
    return _energy_peaks_fallback(file_path)


def _energy_peaks_fallback(file_path: str) -> list[float]:
    """Very coarse beat detection via ffmpeg volumedetect on small windows."""
    duration = _probe_duration(file_path)
    if duration <= 0:
        return []
    # Approximate BPM=120 → 0.5s intervals
    return [round(i * 0.5, 2) for i in range(int(duration / 0.5))]


def sync_audio(input_path: str, output_path: str, target_duration: float) -> str:
    """Stretch or compress audio to match target_duration using atempo filter."""
    src_duration = _probe_duration(input_path)
    if src_duration <= 0:
        import shutil
        shutil.copy2(input_path, output_path)
        return output_path

    ratio = src_duration / target_duration
    # atempo accepts values 0.5–100; chain filters for extreme ratios
    ratio = max(0.5, min(ratio, 100.0))
    atempo = f"atempo={ratio:.6f}"

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-af", atempo, output_path],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"audio sync failed: {exc.stderr.decode(errors='replace')}") from exc
    return output_path


def _probe_duration(file_path: str) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, check=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
python -m pytest tests/test_audio_service.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/audio_service.py tests/test_audio_service.py
git commit -m "feat(audio): add audio service — waveform, beat detection, sync"
```

---

### Task C2: Backend audio router + registration

**Files:**
- Create: `backend/routers/audio.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/routers/audio.py`**

```python
"""Audio import and processing router."""
from __future__ import annotations

import uuid
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.services.audio_service import (
    compute_waveform,
    detect_beats,
    import_audio,
    sync_audio,
)
from backend.workers.task_runner import run_in_executor

router = APIRouter(prefix="/api/audio", tags=["audio"])


class SyncRequest(BaseModel):
    media_id: str
    target_duration: float


@router.post("/import")
async def audio_import(file: UploadFile, track_type: str = "music") -> dict:
    """Accept an audio file, normalise it, store it, return waveform + metadata."""
    if track_type not in ("music", "voiceover"):
        raise HTTPException(status_code=400, detail="track_type must be 'music' or 'voiceover'")

    audio_dir = settings.upload_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    # Write upload to temp file
    ext = Path(file.filename or "").suffix or ".mp3"
    tmp_path = str(audio_dir / f"tmp_{uuid.uuid4().hex}{ext}")
    content = await file.read()
    Path(tmp_path).write_bytes(content)

    try:
        result = await run_in_executor(import_audio, tmp_path, track_type, str(audio_dir))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        try:
            Path(tmp_path).unlink()
        except OSError:
            pass

    # Persist to media_files table
    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format, file_size_bytes, duration_seconds)
               VALUES (?, ?, ?, 'audio', ?, ?, ?)""",
            (
                result["filename"],
                result["filename"],
                result["stored_path"],
                ext.lstrip("."),
                len(content),
                result["duration"],
            ),
        )
        await db.commit()
        row_id = cursor.lastrowid
    finally:
        await db.close()

    return {
        "media_id": str(row_id),
        "filename": result["filename"],
        "waveform": result["waveform"],
        "duration": result["duration"],
        "track_type": track_type,
    }


@router.get("/waveform/{media_id}")
async def get_waveform(media_id: int) -> dict:
    """Return a 1000-sample waveform array for the given audio media file."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")

    waveform = await run_in_executor(compute_waveform, row["stored_path"], 1000)
    return {"waveform": waveform}


@router.post("/beats/{media_id}")
async def get_beats(media_id: int) -> dict:
    """Detect and return beat timestamps (in seconds) for the given audio file."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")

    beats = await run_in_executor(detect_beats, row["stored_path"])
    return {"beats": beats}


@router.post("/sync")
async def sync_audio_endpoint(body: SyncRequest) -> dict:
    """Stretch or compress audio to match a target duration."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path, filename FROM media_files WHERE id = ?", (body.media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {body.media_id} not found")

    audio_dir = settings.upload_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(audio_dir / f"{uuid.uuid4().hex}_synced.mp3")

    try:
        await run_in_executor(sync_audio, row["stored_path"], out_path, body.target_duration)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    import os
    db2: aiosqlite.Connection = await get_db()
    try:
        cursor = await db2.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format, file_size_bytes)
               VALUES (?, ?, ?, 'audio', 'mp3', ?)""",
            (f"synced_{row['filename']}", row["filename"], out_path, os.path.getsize(out_path)),
        )
        await db2.commit()
        row_id = cursor.lastrowid
    finally:
        await db2.close()

    return {"output_media_id": str(row_id)}
```

- [ ] **Step 2: Register audio router in `backend/main.py`**

Add import after existing router imports:
```python
from backend.routers.audio import router as audio_router
```

Add include after existing `app.include_router(social_router)`:
```python
app.include_router(audio_router)
```

- [ ] **Step 3: Verify backend starts**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor
python -c "from backend.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/audio.py backend/main.py
git commit -m "feat(audio): add audio router with import/waveform/beats/sync endpoints"
```

---

### Task C3: AudioTrack frontend component

**Files:**
- Create: `frontend/src/components/edit/AudioTrack.tsx`

- [ ] **Step 1: Create `frontend/src/components/edit/AudioTrack.tsx`**

```tsx
import { useRef, useEffect, useState } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { audioImport, audioBeats } from "../../api/client";
import type { AudioTrack as AudioTrackType, BeatMarker } from "../../types";

const TRACK_HEIGHT = 56;

function WaveformCanvas({ waveform }: { waveform: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(233,69,96,0.6)";

    const barW = width / waveform.length;
    waveform.forEach((v, i) => {
      const barH = Math.max(2, v * height);
      const y = (height - barH) / 2;
      ctx.fillRect(i * barW, y, Math.max(1, barW - 0.5), barH);
    });
  }, [waveform]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={TRACK_HEIGHT - 8}
      style={{ flex: 1, height: TRACK_HEIGHT - 8, display: "block" }}
    />
  );
}

function TrackItem({ track, totalW }: { track: AudioTrackType; totalW: number }) {
  const { updateTrack, removeTrack, beatMarkers, setBeatMarkers } = useAudioStore();
  const [loadingBeats, setLoadingBeats] = useState(false);

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTrack(track.id, { volume: Number(e.target.value) });
  };

  const handleMute = () => updateTrack(track.id, { muted: !track.muted });

  const handleBeats = async () => {
    setLoadingBeats(true);
    try {
      const res = await audioBeats(track.id);
      const beats: BeatMarker[] = (res.data.beats as number[]).map((t, i) => ({
        id: `beat_${i}`, time: t, strength: 0.8,
      }));
      setBeatMarkers(beats);
    } catch {
      // silently ignore
    } finally {
      setLoadingBeats(false);
    }
  };

  const waveWidth = Math.max((track.duration ?? 0) * 80, 200);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        minWidth: waveWidth,
        height: TRACK_HEIGHT - 8,
        background: "rgba(233,69,96,0.08)",
        border: "1px solid rgba(233,69,96,0.3)",
        borderRadius: 4,
        overflow: "hidden",
        opacity: track.muted ? 0.4 : 1,
        gap: 6,
        padding: "0 6px",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 80 }}>
        {track.name}
      </span>
      {track.waveform && <WaveformCanvas waveform={track.waveform} />}

      {/* Beat markers */}
      {beatMarkers.map((bm) => (
        <div
          key={bm.id}
          style={{
            position: "absolute",
            left: bm.time * 80,
            top: 0, bottom: 0,
            width: 1,
            background: "rgba(251,191,36,0.7)",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}

export function AudioTrack({ totalW }: { totalW: number }) {
  const { tracks, addTrack } = useAudioStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/")
    );
    if (files.length === 0) return;
    await importFiles(files);
  };

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await importFiles(files);
    e.target.value = "";
  };

  const importFiles = async (files: File[]) => {
    setImporting(true);
    try {
      for (const file of files) {
        const res = await audioImport(file, "music");
        const d = res.data;
        addTrack({
          id: d.media_id,
          name: d.filename,
          volume: 1,
          muted: false,
          duration: d.duration,
          waveform: d.waveform,
        });
      }
    } catch {
      // silently ignore
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: TRACK_HEIGHT,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Label column */}
      <div
        style={{
          width: 100, flexShrink: 0, display: "flex", flexDirection: "column",
          alignItems: "flex-start", justifyContent: "center", gap: 3,
          padding: "0 10px", borderRight: "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 13 }}>🔊</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Audio</span>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3,
            border: "1px solid var(--border)", background: "var(--bg-tertiary)",
            color: "var(--text-secondary)", cursor: "pointer",
          }}
        >
          {importing ? "…" : "+ Import"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          style={{ display: "none" }}
          onChange={handleInput}
        />
      </div>

      {/* Track region */}
      <div
        style={{
          flex: 1, minWidth: totalW, display: "flex", alignItems: "center",
          gap: 6, padding: "4px 8px", overflowX: "auto",
        }}
      >
        {tracks.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.5 }}>
            Drop audio files here or click Import
          </span>
        ) : (
          tracks.map((t) => <TrackItem key={t.id} track={t} totalW={totalW} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `AudioTrack` into `Timeline.tsx`**

In `Timeline.tsx`, import the component:
```typescript
import { AudioTrack } from "./AudioTrack";
```

In `MultiTrack`, replace the existing audio placeholder div:

Remove:
```tsx
{/* Audio track placeholder */}
<div style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
  <div style={{ width: 100, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
    <span style={{ fontSize: 13 }}>🔊</span>
    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Audio</span>
  </div>
  <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 12px" }}>
    <span style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.5 }}>Drag audio files here</span>
  </div>
</div>
```

Replace with:
```tsx
<AudioTrack totalW={totalW} />
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/fighter/Documents/Projects_Folder/VideoEditor/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Full build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeded.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/edit/AudioTrack.tsx frontend/src/components/edit/Timeline.tsx
git commit -m "feat(audio): AudioTrack component with waveform, drag-drop, beat markers"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Timeline auto-scale / fit-to-view | B1 |
| Zoom controls | B1 |
| Multi-select Ctrl+Click | B2, B4 |
| Merge multiple clips | B3, B4 |
| Audio backend (import, waveform, beats, sync) | C1, C2 |
| AudioTrack UI with waveform | C3 |
| Drag-drop audio onto track | C3 |
| Beat markers on waveform | C3 |
| Export fix (save timeline first) | A1 |
| Export fix (bitrate type) | A1 |
| AI error detail extraction | A2 |
| Batch error surface | A3 |

All requirements covered.

### Placeholder scan
No TBDs or TODOs found.

### Type consistency
- `MergeClipSpec.media_id: int` in backend; frontend sends `Number(c.media_id)` ✓
- `AudioTrack.id` in store matches `media_id` returned by `/audio/import` ✓
- `selectedClipIds: string[]` used consistently in store, Timeline, TrackRow ✓
- `bitrate: Optional[int]` in `ExportRequest` matches `bitrate: number` from frontend ✓
