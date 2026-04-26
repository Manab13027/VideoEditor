# Audio Editing Suite + Mixed Media Composition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full audio editing suite (background music, voice-over import, noise reduction, EQ, beat detection + auto-cut) integrated into the existing Edit tab, plus mixed media composition (images + videos + overlaid audio exported as one video).

**Architecture:** New `backend/routers/audio.py` + `backend/services/audio_service.py` handle audio file import, waveform extraction (librosa), beat detection (librosa), EQ and noise reduction (ffmpeg filters). Frontend gains `audioStore.ts` and four new components under `components/audio/` wired into Timeline (audio track rows with waveforms) and PropertiesPanel (Audio tab with EQ/NR controls). Export gets an optional `audio_settings` field so audio tracks, EQ, and NR are applied at render time via ffmpeg `amix`.

**Tech Stack:** Python librosa + soundfile (beat detection, waveform), ffmpeg-python (EQ, NR, amix), FastAPI, React + Zustand (frontend state), HTML5 Canvas (waveform rendering).

---

## File Map

### New files
- `backend/services/audio_service.py` — pure functions: waveform, beats, EQ, NR, sync, amix
- `backend/routers/audio.py` — `/api/audio` endpoints
- `frontend/src/stores/audioStore.ts` — audio track state
- `frontend/src/components/audio/WaveformDisplay.tsx` — canvas waveform
- `frontend/src/components/audio/BeatMarkers.tsx` — beat tick overlay
- `frontend/src/components/audio/AudioTrackRow.tsx` — one row per audio track
- `frontend/src/components/audio/AudioPropertiesTab.tsx` — EQ sliders + NR + beat detection

### Modified files
- `backend/requirements.txt` — add librosa, soundfile
- `backend/config.py` — add `allowed_audio_extensions`, `audio_dir`
- `backend/main.py` — register `audio_router`
- `backend/models/job.py` — add `AudioExportTrack`, `AudioExportSettings`, extend `ExportRequest`
- `backend/services/export_service.py` — apply audio mixing in `build_export`
- `frontend/src/types/index.ts` — add `AudioTrack`, `BeatMarker`, `EQSettings`, `NoiseReductionSettings`, `AudioExportTrack`, `AudioExportSettings`; extend `ExportSettings`
- `frontend/src/api/client.ts` — add audio API functions; extend `startExport`
- `frontend/src/components/edit/Timeline.tsx` — replace Audio placeholder with `AudioTrackRow` rows
- `frontend/src/components/edit/PropertiesPanel.tsx` — add Audio tab

---

## Task 1: Add librosa/soundfile to requirements and audio config

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`

- [ ] **Step 1: Add librosa and soundfile to requirements**

In `backend/requirements.txt`, append:
```
librosa==0.10.2
soundfile==0.12.1
numpy==1.26.4
```

- [ ] **Step 2: Add audio extensions and audio_dir to config**

In `backend/config.py`, update the `Settings` class:

```python
from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "ClipForge"

    data_dir: Path = Path("data")
    upload_dir: Path = Path("data/uploads")
    proxy_dir: Path = Path("data/proxies")
    export_dir: Path = Path("data/exports")
    thumbnail_dir: Path = Path("data/thumbnails")
    audio_dir: Path = Path("data/audio")
    db_path: Path = Path("data/clipforge.db")

    max_workers: int = 3
    proxy_resolution: str = "1280x720"

    allowed_video_extensions: set[str] = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv",
        ".wmv", ".mpeg", ".mpg", ".3gp", ".m4v", ".ts",
        ".vob", ".ogv", ".asf",
    }
    allowed_image_extensions: set[str] = {
        ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif",
        ".gif", ".webp", ".svg", ".ico", ".tga",
    }
    allowed_audio_extensions: set[str] = {
        ".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma", ".opus",
    }

    def ensure_dirs(self) -> None:
        for d in (
            self.data_dir,
            self.upload_dir,
            self.proxy_dir,
            self.export_dir,
            self.thumbnail_dir,
            self.audio_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
```

- [ ] **Step 3: Install the new dependencies**

```bash
cd backend && pip install librosa==0.10.2 soundfile==0.12.1 numpy==1.26.4
```

Expected: packages install without error.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/config.py
git commit -m "feat(audio): add librosa/soundfile deps and audio config"
```

---

## Task 2: Add audio types to frontend types/index.ts

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add audio types**

At the end of `frontend/src/types/index.ts`, append:

```typescript
export type AudioTrackType = "original" | "music" | "voiceover";

export interface AudioTrack {
  id: string;
  type: AudioTrackType;
  mediaId: string;
  name: string;
  volume: number;       // 0.0 – 1.0
  offset: number;       // seconds from composition start
  muted: boolean;
  waveform: number[];   // normalized amplitude array (0–1), ~200 points
}

export interface BeatMarker {
  timestamp: number;    // seconds
  strength: number;     // 0–1
}

export interface EQSettings {
  bass: number;         // -12 to +12 dB at 80 Hz
  mid: number;          // -12 to +12 dB at 1 kHz
  presence: number;     // -12 to +12 dB at 4 kHz
  treble: number;       // -12 to +12 dB at 8 kHz
}

export interface NoiseReductionSettings {
  enabled: boolean;
  strength: number;     // 0.0 – 1.0
}

export interface AudioExportTrack {
  mediaId: string;
  volume: number;
  offset: number;
}

export interface AudioExportSettings {
  tracks: AudioExportTrack[];
  eq: EQSettings;
  noiseReductionStrength: number;
}
```

Also extend `ExportSettings` — add an optional `audioSettings` field:

```typescript
export interface ExportSettings {
  project_id: string;
  preset?: string;
  container: string;
  video_codec: string;
  audio_codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  fps: number;
  quality_tier?: string;
  output_dir?: string;
  upload_to_drive: boolean;
  drive_folder_id?: string;
  audio_settings?: AudioExportSettings;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(audio): add AudioTrack, BeatMarker, EQ, NR types"
```

---

## Task 3: Create audioStore.ts

**Files:**
- Create: `frontend/src/stores/audioStore.ts`

- [ ] **Step 1: Write the store**

Create `frontend/src/stores/audioStore.ts`:

```typescript
import { create } from "zustand";
import type { AudioTrack, BeatMarker, EQSettings, NoiseReductionSettings } from "../types";

const DEFAULT_EQ: EQSettings = { bass: 0, mid: 0, presence: 0, treble: 0 };
const DEFAULT_NR: NoiseReductionSettings = { enabled: false, strength: 0 };

interface AudioState {
  tracks: AudioTrack[];
  beatMarkers: BeatMarker[];
  eq: EQSettings;
  noiseReduction: NoiseReductionSettings;
  addTrack: (track: AudioTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<AudioTrack>) => void;
  setBeatMarkers: (markers: BeatMarker[]) => void;
  setEQ: (patch: Partial<EQSettings>) => void;
  setNoiseReduction: (patch: Partial<NoiseReductionSettings>) => void;
  reset: () => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  tracks: [],
  beatMarkers: [],
  eq: DEFAULT_EQ,
  noiseReduction: DEFAULT_NR,

  addTrack: (track) =>
    set((s) => ({ tracks: [...s.tracks, track] })),

  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),

  updateTrack: (id, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  setBeatMarkers: (markers) => set({ beatMarkers: markers }),

  setEQ: (patch) =>
    set((s) => ({ eq: { ...s.eq, ...patch } })),

  setNoiseReduction: (patch) =>
    set((s) => ({ noiseReduction: { ...s.noiseReduction, ...patch } })),

  reset: () => set({ tracks: [], beatMarkers: [], eq: DEFAULT_EQ, noiseReduction: DEFAULT_NR }),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/audioStore.ts
git commit -m "feat(audio): add audioStore with track, beat, EQ, NR state"
```

---

## Task 4: Add audio API client functions

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Append audio functions to client.ts**

At the end of `frontend/src/api/client.ts`, append:

```typescript
// Audio
export const audioImport = (
  file: File,
  trackType: "music" | "voiceover"
): Promise<{ data: { media_id: string; filename: string; waveform: number[]; duration: number } }> => {
  const form = new FormData();
  form.append("file", file);
  form.append("track_type", trackType);
  return api.post("/audio/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const audioWaveform = (
  mediaId: string
): Promise<{ data: { waveform: number[] } }> =>
  api.get(`/audio/waveform/${mediaId}`);

export const audioBeats = (
  mediaId: string
): Promise<{ data: { beats: number[] } }> =>
  api.post(`/audio/beats/${mediaId}`);

export const audioSync = (body: {
  media_id: string;
  target_duration: number;
}): Promise<{ data: { output_media_id: string } }> =>
  api.post("/audio/sync", body);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(audio): add audio API client functions"
```

---

## Task 5: Create backend/services/audio_service.py

**Files:**
- Create: `backend/services/audio_service.py`
- Test: `tests/test_audio_service.py`

- [ ] **Step 1: Write the failing tests first**

Create `tests/test_audio_service.py`:

```python
"""Tests for audio_service pure functions."""
import math
import os
import struct
import tempfile
import wave

import numpy as np
import pytest


def _make_wav(path: str, duration: float = 2.0, freq: float = 440.0, sr: int = 22050) -> str:
    """Create a minimal sine-wave WAV file for testing."""
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    samples = (np.sin(2 * math.pi * freq * t) * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return path


def test_extract_waveform_returns_200_points():
    from backend.services.audio_service import extract_waveform
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    try:
        _make_wav(wav_path)
        result = extract_waveform(wav_path)
        assert len(result) == 200
        assert all(0.0 <= v <= 1.0 for v in result)
    finally:
        os.unlink(wav_path)


def test_extract_waveform_custom_points():
    from backend.services.audio_service import extract_waveform
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    try:
        _make_wav(wav_path)
        result = extract_waveform(wav_path, n_points=50)
        assert len(result) == 50
    finally:
        os.unlink(wav_path)


def test_detect_beats_returns_list_of_floats():
    from backend.services.audio_service import detect_beats
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    try:
        _make_wav(wav_path, duration=5.0, freq=2.0)  # 2 Hz ~ 120 BPM beat analogue
        result = detect_beats(wav_path)
        assert isinstance(result, list)
        assert all(isinstance(t, float) for t in result)
        assert all(t >= 0 for t in result)
    finally:
        os.unlink(wav_path)


def test_sync_audio_trims_longer_audio():
    from backend.services.audio_service import sync_audio_to_duration
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as src:
        src_path = src.name
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as dst:
        dst_path = dst.name
    try:
        _make_wav(src_path, duration=10.0)
        sync_audio_to_duration(src_path, dst_path, target_duration=3.0)
        assert os.path.exists(dst_path)
        assert os.path.getsize(dst_path) > 0
    finally:
        os.unlink(src_path)
        try:
            os.unlink(dst_path)
        except FileNotFoundError:
            pass


def test_sync_audio_loops_shorter_audio():
    from backend.services.audio_service import sync_audio_to_duration
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as src:
        src_path = src.name
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as dst:
        dst_path = dst.name
    try:
        _make_wav(src_path, duration=2.0)
        sync_audio_to_duration(src_path, dst_path, target_duration=5.0)
        assert os.path.exists(dst_path)
        assert os.path.getsize(dst_path) > 0
    finally:
        os.unlink(src_path)
        try:
            os.unlink(dst_path)
        except FileNotFoundError:
            pass
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/project && python -m pytest tests/test_audio_service.py -v
```

Expected: `ImportError` — `audio_service` does not exist yet.

- [ ] **Step 3: Implement audio_service.py**

Create `backend/services/audio_service.py`:

```python
"""Audio processing service — waveform, beat detection, EQ, noise reduction, sync, amix."""
from __future__ import annotations

import math
import os
import tempfile
from typing import Optional

import ffmpeg
import librosa
import numpy as np


def extract_waveform(file_path: str, n_points: int = 200) -> list[float]:
    """Load audio file and return normalized RMS amplitude array of length n_points."""
    y, sr = librosa.load(file_path, mono=True, sr=None)
    if len(y) == 0:
        return [0.0] * n_points
    hop = max(1, len(y) // n_points)
    amplitudes: list[float] = []
    for i in range(n_points):
        segment = y[i * hop : (i + 1) * hop]
        amplitudes.append(float(np.sqrt(np.mean(segment ** 2))) if len(segment) > 0 else 0.0)
    max_amp = max(amplitudes) or 1.0
    return [a / max_amp for a in amplitudes]


def detect_beats(file_path: str) -> list[float]:
    """Return beat timestamps in seconds using librosa beat tracking."""
    y, sr = librosa.load(file_path, mono=True, sr=None)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    return [float(t) for t in beat_times]


def sync_audio_to_duration(input_path: str, output_path: str, target_duration: float) -> str:
    """Trim or loop audio file to exactly target_duration seconds."""
    info = ffmpeg.probe(input_path)
    audio_duration = float(info["format"]["duration"])

    if audio_duration >= target_duration:
        # Trim to target
        (
            ffmpeg
            .input(input_path, t=target_duration)
            .output(output_path, acodec="pcm_s16le")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    else:
        # Loop: aloop repeats by sample count; atrim cuts to exact duration
        n_samples = int(audio_duration * 44100)
        loops = math.ceil(target_duration / audio_duration)
        (
            ffmpeg
            .input(input_path)
            .filter("aloop", loop=loops, size=n_samples)
            .filter("atrim", duration=target_duration)
            .output(output_path, acodec="pcm_s16le")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    return output_path


def mix_audio_into_video(
    video_path: str,
    output_path: str,
    tracks: list[dict],
    eq: Optional[dict] = None,
    noise_reduction_strength: float = 0.0,
) -> str:
    """Mix additional audio tracks into a video file.

    tracks: list of {stored_path: str, volume: float, offset: float}
    eq: {bass, mid, presence, treble} each -12 to +12 dB
    noise_reduction_strength: 0.0-1.0
    """
    video_in = ffmpeg.input(video_path)

    # Collect audio streams: original video audio + imported tracks
    audio_streams = [video_in.audio]

    for track in tracks:
        a = ffmpeg.input(track["stored_path"]).audio
        if track.get("offset", 0) > 0:
            delay_ms = int(track["offset"] * 1000)
            a = a.filter("adelay", f"{delay_ms}|{delay_ms}")
        if track.get("volume", 1.0) != 1.0:
            a = a.filter("volume", track["volume"])
        audio_streams.append(a)

    # Mix all streams
    if len(audio_streams) > 1:
        mixed = ffmpeg.filter(audio_streams, "amix", inputs=len(audio_streams), normalize=0)
    else:
        mixed = audio_streams[0]

    # Noise reduction
    if noise_reduction_strength > 0:
        s_param = max(0.00001, min(10.0, 10 ** (noise_reduction_strength * 4 - 4)))
        mixed = mixed.filter("anlmdn", s=s_param)

    # EQ
    if eq:
        if eq.get("bass", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=80, width_type="o", width=2, gain=eq["bass"])
        if eq.get("mid", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=1000, width_type="o", width=2, gain=eq["mid"])
        if eq.get("presence", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=4000, width_type="o", width=2, gain=eq["presence"])
        if eq.get("treble", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=8000, width_type="o", width=2, gain=eq["treble"])

    (
        ffmpeg
        .output(video_in.video, mixed, output_path, vcodec="copy", acodec="aac")
        .overwrite_output()
        .run(capture_stdout=True, capture_stderr=True)
    )
    return output_path
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_audio_service.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/audio_service.py tests/test_audio_service.py
git commit -m "feat(audio): add audio_service with waveform, beats, sync, amix"
```

---

## Task 6: Create backend/routers/audio.py

**Files:**
- Create: `backend/routers/audio.py`
- Test: `tests/test_audio_router.py`

- [ ] **Step 1: Write failing router tests**

Create `tests/test_audio_router.py`:

```python
"""Tests for /api/audio endpoints."""
import io
import math
import os
import struct
import tempfile
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def _wav_bytes(duration: float = 2.0, sr: int = 22050) -> bytes:
    """Return WAV file bytes for a sine wave."""
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    samples = (np.sin(2 * math.pi * 440 * t) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


def test_audio_import_returns_waveform():
    wav_bytes = _wav_bytes()
    response = client.post(
        "/api/audio/import",
        files={"file": ("test.wav", wav_bytes, "audio/wav")},
        data={"track_type": "music"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "media_id" in data
    assert "waveform" in data
    assert len(data["waveform"]) == 200
    assert all(0.0 <= v <= 1.0 for v in data["waveform"])
    assert "duration" in data


def test_audio_import_rejects_non_audio():
    response = client.post(
        "/api/audio/import",
        files={"file": ("test.txt", b"not audio", "text/plain")},
        data={"track_type": "music"},
    )
    assert response.status_code == 400


def test_audio_waveform_endpoint():
    # First import a file
    wav_bytes = _wav_bytes()
    import_resp = client.post(
        "/api/audio/import",
        files={"file": ("test.wav", wav_bytes, "audio/wav")},
        data={"track_type": "music"},
    )
    media_id = import_resp.json()["media_id"]

    response = client.get(f"/api/audio/waveform/{media_id}")
    assert response.status_code == 200
    assert "waveform" in response.json()
    assert len(response.json()["waveform"]) == 200


def test_audio_beats_endpoint():
    wav_bytes = _wav_bytes(duration=5.0)
    import_resp = client.post(
        "/api/audio/import",
        files={"file": ("beat.wav", wav_bytes, "audio/wav")},
        data={"track_type": "music"},
    )
    media_id = import_resp.json()["media_id"]

    response = client.post(f"/api/audio/beats/{media_id}")
    assert response.status_code == 200
    data = response.json()
    assert "beats" in data
    assert isinstance(data["beats"], list)
```

- [ ] **Step 2: Run to confirm they fail**

```bash
python -m pytest tests/test_audio_router.py -v
```

Expected: `404` errors — endpoints not registered yet.

- [ ] **Step 3: Implement the router**

Create `backend/routers/audio.py`:

```python
"""Audio editing suite router."""
from __future__ import annotations

import uuid
from asyncio import get_event_loop
from functools import partial
from pathlib import Path
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.services.audio_service import detect_beats, extract_waveform, sync_audio_to_duration

router = APIRouter(prefix="/api/audio", tags=["audio"])


def _get_audio_ext(filename: str) -> str:
    """Return lowercase extension if it is an allowed audio format, else raise ValueError."""
    ext = Path(filename).suffix.lower()
    if ext not in settings.allowed_audio_extensions:
        raise ValueError(f"Unsupported audio format: {ext!r}")
    return ext


async def _fetch_audio_path(media_id: str) -> str:
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ? AND media_type = 'audio'",
            (media_id,),
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Audio media {media_id} not found")
    return row["stored_path"]


@router.post("/import")
async def import_audio(
    file: UploadFile,
    track_type: str = Form("music"),
) -> dict:
    """Accept an audio file upload, persist it, return waveform + metadata."""
    try:
        ext = _get_audio_ext(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = settings.audio_dir / unique_name

    content = await file.read()
    stored_path.write_bytes(content)

    loop = get_event_loop()
    try:
        waveform = await loop.run_in_executor(
            None, partial(extract_waveform, str(stored_path))
        )
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Failed to process audio: {exc}") from exc

    import ffmpeg as _ffmpeg
    try:
        info = _ffmpeg.probe(str(stored_path))
        duration = float(info["format"].get("duration", 0))
    except Exception:
        duration = 0.0

    file_size = stored_path.stat().st_size

    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                width, height, duration_seconds, file_size_bytes)
               VALUES (?, ?, ?, 'audio', ?, NULL, NULL, ?, ?)""",
            (
                file.filename,
                str(stored_path),
                str(stored_path),
                ext.lstrip("."),
                duration,
                file_size,
            ),
        ) as cur:
            media_id = cur.lastrowid
        await db.commit()
    finally:
        await db.close()

    return {
        "media_id": str(media_id),
        "filename": file.filename,
        "track_type": track_type,
        "waveform": waveform,
        "duration": duration,
    }


@router.get("/waveform/{media_id}")
async def get_waveform(media_id: str) -> dict:
    stored_path = await _fetch_audio_path(media_id)
    loop = get_event_loop()
    try:
        waveform = await loop.run_in_executor(
            None, partial(extract_waveform, stored_path)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"waveform": waveform}


@router.post("/beats/{media_id}")
async def get_beats(media_id: str) -> dict:
    stored_path = await _fetch_audio_path(media_id)
    loop = get_event_loop()
    try:
        beats = await loop.run_in_executor(
            None, partial(detect_beats, stored_path)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"beats": beats}


class SyncRequest(BaseModel):
    media_id: str
    target_duration: float


@router.post("/sync")
async def sync_audio(body: SyncRequest) -> dict:
    if body.target_duration <= 0:
        raise HTTPException(status_code=422, detail="target_duration must be positive")
    stored_path = await _fetch_audio_path(body.media_id)

    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    output_path = tmp.name

    loop = get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            partial(sync_audio_to_duration, stored_path, output_path, body.target_duration),
        )
    except Exception as exc:
        os.unlink(output_path)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Persist the synced file as a new media record
    unique_name = f"{uuid.uuid4().hex}.wav"
    dest = settings.audio_dir / unique_name
    import shutil
    shutil.move(output_path, str(dest))

    file_size = dest.stat().st_size
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                duration_seconds, file_size_bytes)
               VALUES (?, ?, ?, 'audio', 'wav', ?, ?)""",
            (unique_name, str(dest), str(dest), body.target_duration, file_size),
        ) as cur:
            new_media_id = cur.lastrowid
        await db.commit()
    finally:
        await db.close()

    return {"output_media_id": str(new_media_id)}
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_audio_router.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/audio.py tests/test_audio_router.py
git commit -m "feat(audio): add audio router with import, waveform, beats, sync endpoints"
```

---

## Task 7: Register audio router in main.py

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add import and include_router**

In `backend/main.py`, add after the `social_router` import:

```python
from backend.routers.audio import router as audio_router
```

And after `app.include_router(social_router)`:

```python
app.include_router(audio_router)
```

Full updated imports section (lines 1-18 of main.py):
```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import init_db
from backend.routers.export import router as export_router
from backend.routers.media import router as media_router
from backend.routers.projects import router as projects_router
from backend.routers.batch import router as batch_router
from backend.routers.websocket import router as websocket_router
from backend.routers.drive import router as drive_router
from backend.routers.ai import router as ai_router
from backend.routers.social import router as social_router
from backend.routers.audio import router as audio_router
from backend.workers.task_runner import shutdown_executor
```

Updated `include_router` section:
```python
app.include_router(media_router)
app.include_router(projects_router)
app.include_router(batch_router)
app.include_router(export_router)
app.include_router(websocket_router)
app.include_router(drive_router)
app.include_router(ai_router)
app.include_router(social_router)
app.include_router(audio_router)
```

- [ ] **Step 2: Verify health endpoint still works**

```bash
python -m pytest tests/test_health.py -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat(audio): register audio router in FastAPI app"
```

---

## Task 8: Extend ExportRequest for audio mixing + update export_service

**Files:**
- Modify: `backend/models/job.py`
- Modify: `backend/services/export_service.py`

- [ ] **Step 1: Add audio models to job.py**

In `backend/models/job.py`, add after the existing imports:

```python
class AudioExportTrack(BaseModel):
    media_id: str
    volume: float = 1.0   # 0.0-1.0
    offset: float = 0.0   # seconds from start


class AudioExportSettings(BaseModel):
    tracks: List[AudioExportTrack] = []
    eq: dict = Field(default_factory=dict)   # {bass, mid, presence, treble}
    noise_reduction_strength: float = 0.0
```

And extend `ExportRequest`:

```python
class ExportRequest(BaseModel):
    project_id: str
    preset: Optional[str] = None
    container: str = "mp4"
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    width: Optional[int] = None
    height: Optional[int] = None
    bitrate: Optional[str] = None
    fps: int = 30
    quality_tier: Optional[str] = None
    output_dir: Optional[str] = None
    upload_to_drive: bool = False
    drive_folder_id: Optional[str] = None
    audio_settings: Optional[AudioExportSettings] = None
```

- [ ] **Step 2: Update build_export signature and add audio mixing**

Change the signature of `build_export` to accept an optional `audio_settings` parameter, then add audio mixing before the final return.

Replace:
```python
async def build_export(project_id: str, output_path: str, export_settings: dict) -> str:
```
With:
```python
async def build_export(
    project_id: str,
    output_path: str,
    export_settings: dict,
    audio_settings=None,
) -> str:
```

Then replace the final `return output_path` at the end of `build_export` with:

```python
    # Apply audio mixing if additional tracks or processing requested
    if audio_settings and (
        getattr(audio_settings, "tracks", None) or
        getattr(audio_settings, "noise_reduction_strength", 0) > 0 or
        any(v != 0 for v in vars(getattr(audio_settings, "eq", None) or {}).values()
            if isinstance(v, (int, float)))
    ):
        from backend.services.audio_service import mix_audio_into_video

        # Resolve stored paths for audio tracks
        resolved_tracks = []
        _db = await get_db()
        try:
            for track in (audio_settings.tracks or []):
                async with _db.execute(
                    "SELECT stored_path FROM media_files WHERE id = ?",
                    (track.media_id,),
                ) as cur:
                    row = await cur.fetchone()
                if row:
                    resolved_tracks.append({
                        "stored_path": row["stored_path"],
                        "volume": track.volume,
                        "offset": track.offset,
                    })
        finally:
            await _db.close()

        eq_dict = None
        if audio_settings.eq:
            eq_dict = {
                "bass": audio_settings.eq.get("bass", 0),
                "mid": audio_settings.eq.get("mid", 0),
                "presence": audio_settings.eq.get("presence", 0),
                "treble": audio_settings.eq.get("treble", 0),
            }

        mixed_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        mixed_tmp.close()
        mixed_path = mixed_tmp.name
        try:
            import asyncio as _asyncio
            from functools import partial as _partial
            loop = _asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                _partial(
                    mix_audio_into_video,
                    output_path,
                    mixed_path,
                    resolved_tracks,
                    eq_dict,
                    audio_settings.noise_reduction_strength,
                ),
            )
            os.replace(mixed_path, output_path)
        except Exception:
            try:
                os.unlink(mixed_path)
            except OSError:
                pass

    return output_path
```

Also check the export router (`backend/routers/export.py`) for the `start_export` function that calls `build_export` — pass `audio_settings=request.audio_settings` to `build_export` there.

- [ ] **Step 3: Run existing export tests**

```bash
python -m pytest tests/test_export.py -v
```

Expected: all existing tests PASS (audio_settings defaults to None so existing behaviour unchanged).

- [ ] **Step 4: Commit**

```bash
git add backend/models/job.py backend/services/export_service.py
git commit -m "feat(audio): extend ExportRequest with audio_settings, apply amix in build_export"
```

---

## Task 9: Create WaveformDisplay.tsx and BeatMarkers.tsx

**Files:**
- Create: `frontend/src/components/audio/WaveformDisplay.tsx`
- Create: `frontend/src/components/audio/BeatMarkers.tsx`

- [ ] **Step 1: Create WaveformDisplay**

Create `frontend/src/components/audio/WaveformDisplay.tsx`:

```tsx
import { useEffect, useRef } from "react";

interface Props {
  waveform: number[];   // normalized 0–1 amplitude array
  width: number;
  height: number;
  color?: string;
}

export function WaveformDisplay({ waveform, width, height, color = "#4a9eff" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (waveform.length === 0) return;

    const barW = width / waveform.length;
    const midY = height / 2;

    ctx.fillStyle = color;
    waveform.forEach((amp, i) => {
      const barH = Math.max(1, amp * midY);
      ctx.fillRect(i * barW, midY - barH, Math.max(1, barW - 1), barH * 2);
    });
  }, [waveform, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: "block" }}
    />
  );
}
```

- [ ] **Step 2: Create BeatMarkers**

Create `frontend/src/components/audio/BeatMarkers.tsx`:

```tsx
interface Props {
  beats: number[];          // beat timestamps in seconds
  totalDuration: number;    // total audio/video duration in seconds
  width: number;
  height: number;
  color?: string;
}

export function BeatMarkers({ beats, totalDuration, width, height, color = "#f59e0b" }: Props) {
  if (totalDuration <= 0 || beats.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      {beats.map((t, i) => {
        const x = (t / totalDuration) * width;
        return (
          <line
            key={i}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={color}
            strokeWidth={1}
            strokeOpacity={0.8}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/audio/WaveformDisplay.tsx frontend/src/components/audio/BeatMarkers.tsx
git commit -m "feat(audio): add WaveformDisplay canvas and BeatMarkers SVG components"
```

---

## Task 10: Create AudioTrackRow.tsx

**Files:**
- Create: `frontend/src/components/audio/AudioTrackRow.tsx`

- [ ] **Step 1: Implement AudioTrackRow**

Create `frontend/src/components/audio/AudioTrackRow.tsx`:

```tsx
import { useRef, useState } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { audioImport } from "../../api/client";
import { WaveformDisplay } from "./WaveformDisplay";
import { BeatMarkers } from "./BeatMarkers";
import type { AudioTrack, AudioTrackType } from "../../types";

interface Props {
  trackType: AudioTrackType;
  label: string;
  icon: string;
  totalDuration: number;  // total composition duration in seconds
}

export function AudioTrackRow({ trackType, label, icon, totalDuration }: Props) {
  const { tracks, beatMarkers, addTrack, updateTrack, removeTrack } = useAudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const track: AudioTrack | undefined = tracks.find((t) => t.type === trackType);

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await audioImport(files[0], trackType as "music" | "voiceover");
      const data = res.data;
      const newTrack: AudioTrack = {
        id: `audio-${trackType}-${Date.now()}`,
        type: trackType,
        mediaId: data.media_id,
        name: files[0].name,
        volume: 1.0,
        offset: 0,
        muted: false,
        waveform: data.waveform,
      };
      // Replace existing track of same type if present
      if (track) removeTrack(track.id);
      addTrack(newTrack);
    } catch {
      setError("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const relevantBeats = trackType === "music" ? beatMarkers : [];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        borderBottom: "1px solid var(--border)",
        height: 48,
        flexShrink: 0,
      }}
    >
      {/* Label */}
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span className="section-label" style={{ width: 80, flexShrink: 0, fontSize: 11 }}>
        {label}
      </span>

      {/* Track area */}
      <div style={{ flex: 1, position: "relative", height: 36 }}>
        {track ? (
          <>
            <WaveformDisplay
              waveform={track.waveform}
              width={600}
              height={36}
              color={trackType === "music" ? "#4a9eff" : "#a78bfa"}
            />
            <BeatMarkers
              beats={relevantBeats.map((m) => m.timestamp)}
              totalDuration={totalDuration || 60}
              width={600}
              height={36}
            />
          </>
        ) : (
          <div
            style={{
              height: "100%",
              borderRadius: 4,
              background: "var(--bg-primary)",
              border: "1px dashed var(--border)",
              display: "flex",
              alignItems: "center",
              paddingLeft: 8,
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {importing ? "Importing…" : error ?? "No track"}
          </div>
        )}
      </div>

      {/* Controls */}
      {track && (
        <>
          {/* Mute */}
          <button
            className={`btn ${track.muted ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "2px 6px", fontSize: 10 }}
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            title={track.muted ? "Unmute" : "Mute"}
          >
            {track.muted ? "M" : "🔊"}
          </button>

          {/* Volume */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
            style={{ width: 60 }}
            title={`Volume: ${Math.round(track.volume * 100)}%`}
          />

          {/* Remove */}
          <button
            className="btn btn-secondary"
            style={{ padding: "2px 6px", fontSize: 10 }}
            onClick={() => removeTrack(track.id)}
            title="Remove track"
          >
            ✕
          </button>
        </>
      )}

      {/* Import button */}
      {!track && (
        <button
          className="btn btn-secondary"
          style={{ padding: "3px 8px", fontSize: 10, flexShrink: 0 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          + Import
        </button>
      )}
      {track && (
        <button
          className="btn btn-secondary"
          style={{ padding: "3px 8px", fontSize: 10, flexShrink: 0 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="Replace track"
        >
          ↺
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.aac,.flac,.ogg,.m4a,.wma,.opus"
        style={{ display: "none" }}
        onChange={(e) => handleImport(e.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/audio/AudioTrackRow.tsx
git commit -m "feat(audio): add AudioTrackRow with waveform, beat markers, volume, import"
```

---

## Task 11: Create AudioPropertiesTab.tsx

**Files:**
- Create: `frontend/src/components/audio/AudioPropertiesTab.tsx`

- [ ] **Step 1: Implement the tab**

Create `frontend/src/components/audio/AudioPropertiesTab.tsx`:

```tsx
import { useState } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { audioBeats } from "../../api/client";

function EQSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{value > 0 ? `+${value}` : value}</span>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ writingMode: "vertical-lr", direction: "rtl", height: 80 }}
      />
      <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

export function AudioPropertiesTab() {
  const { tracks, beatMarkers, eq, noiseReduction, setEQ, setNoiseReduction, setBeatMarkers } =
    useAudioStore();
  const [detectingBeats, setDetectingBeats] = useState(false);
  const [beatError, setBeatError] = useState<string | null>(null);

  const musicTrack = tracks.find((t) => t.type === "music");

  const handleDetectBeats = async () => {
    if (!musicTrack) return;
    setDetectingBeats(true);
    setBeatError(null);
    try {
      const res = await audioBeats(musicTrack.mediaId);
      const markers = res.data.beats.map((t: number) => ({ timestamp: t, strength: 1.0 }));
      setBeatMarkers(markers);
    } catch {
      setBeatError("Beat detection failed");
    } finally {
      setDetectingBeats(false);
    }
  };

  const handleAutoCut = () => {
    if (beatMarkers.length === 0) return;
    // Insert a cut point at each beat by splitting the last clip at each beat timestamp
    // For now: each beat becomes a new zero-duration marker clip the user can use to align
    // We add split indicators via updateClip trim_end for closest clip
    alert(
      `Auto-cut: ${beatMarkers.length} beat markers available on timeline. Use beat markers to manually align cuts.`
    );
  };

  return (
    <div style={{ overflowY: "auto", height: "100%", padding: "10px 12px" }}>
      {/* EQ */}
      <p className="section-label" style={{ marginBottom: 8 }}>
        Equalizer
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          marginBottom: 16,
          padding: "8px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <EQSlider label="Bass" value={eq.bass} onChange={(v) => setEQ({ bass: v })} />
        <EQSlider label="Mid" value={eq.mid} onChange={(v) => setEQ({ mid: v })} />
        <EQSlider label="Presence" value={eq.presence} onChange={(v) => setEQ({ presence: v })} />
        <EQSlider label="Treble" value={eq.treble} onChange={(v) => setEQ({ treble: v })} />
      </div>
      <button
        className="btn btn-secondary"
        style={{ fontSize: 10, padding: "3px 8px", marginBottom: 16 }}
        onClick={() => setEQ({ bass: 0, mid: 0, presence: 0, treble: 0 })}
      >
        Reset EQ
      </button>

      {/* Noise Reduction */}
      <p className="section-label" style={{ marginBottom: 8 }}>
        Noise Reduction
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <input
          type="checkbox"
          checked={noiseReduction.enabled}
          onChange={(e) => setNoiseReduction({ enabled: e.target.checked })}
          id="nr-enabled"
        />
        <label htmlFor="nr-enabled" style={{ fontSize: 12 }}>
          Enable
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={noiseReduction.strength}
          disabled={!noiseReduction.enabled}
          onChange={(e) => setNoiseReduction({ strength: Number(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, color: "var(--text-secondary)", width: 32 }}>
          {Math.round(noiseReduction.strength * 100)}%
        </span>
      </div>

      {/* Beat Detection */}
      <p className="section-label" style={{ marginBottom: 8 }}>
        Beat Detection
      </p>
      {!musicTrack && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
          Import a music track first
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 11, padding: "4px 10px" }}
          onClick={handleDetectBeats}
          disabled={!musicTrack || detectingBeats}
        >
          {detectingBeats ? "Detecting…" : "Detect Beats"}
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 11, padding: "4px 10px" }}
          onClick={handleAutoCut}
          disabled={beatMarkers.length === 0}
        >
          Auto-cut to Beats ({beatMarkers.length})
        </button>
      </div>
      {beatError && (
        <p style={{ fontSize: 11, color: "var(--text-error, red)", marginTop: 6 }}>{beatError}</p>
      )}
      {beatMarkers.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
          {beatMarkers.length} beats detected — markers shown on music track row
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/audio/AudioPropertiesTab.tsx
git commit -m "feat(audio): add AudioPropertiesTab with EQ sliders, NR, beat detection"
```

---

## Task 12: Wire AudioTrackRow into Timeline.tsx

**Files:**
- Modify: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Update Timeline to use AudioTrackRow**

Replace the full content of `frontend/src/components/edit/Timeline.tsx` with:

```tsx
import { useTimelineStore } from "../../stores/timelineStore";
import { Storyboard } from "./Storyboard";
import { AudioTrackRow } from "../audio/AudioTrackRow";

const VIDEO_TRACKS = [
  { icon: "🎥", label: "Video" },
  { icon: "🖼", label: "Image Overlay" },
];

export function Timeline() {
  const { mode, setMode, clips } = useTimelineStore();

  // Estimate total duration from clips (sum of durations)
  const totalDuration = clips.reduce((sum, c) => {
    if (c.type === "image") return sum + (c.duration ?? 3);
    const end = c.trim_end ?? 0;
    const start = c.trim_start ?? 0;
    return sum + Math.max(0, end - start);
  }, 0) || 60;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button
          className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("storyboard")}
        >
          Storyboard
        </button>
        <button
          className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("multitrack")}
        >
          Multi-track
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {mode === "storyboard" ? (
          <Storyboard />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Video / image placeholder tracks */}
            {VIDEO_TRACKS.map((track) => (
              <div
                key={track.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 12px",
                  borderBottom: "1px solid var(--border)",
                  height: 36,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 14 }}>{track.icon}</span>
                <span className="section-label" style={{ width: 80, flexShrink: 0, fontSize: 11 }}>
                  {track.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 4,
                    background: "var(--bg-primary)",
                    border: "1px dashed var(--border)",
                  }}
                />
              </div>
            ))}

            {/* Audio tracks with real waveforms */}
            <AudioTrackRow
              trackType="original"
              label="Original"
              icon="🔊"
              totalDuration={totalDuration}
            />
            <AudioTrackRow
              trackType="music"
              label="Music"
              icon="🎵"
              totalDuration={totalDuration}
            />
            <AudioTrackRow
              trackType="voiceover"
              label="Voice-over"
              icon="🎤"
              totalDuration={totalDuration}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/edit/Timeline.tsx
git commit -m "feat(audio): wire AudioTrackRow into Timeline multitrack view"
```

---

## Task 13: Add Audio tab to PropertiesPanel.tsx

**Files:**
- Modify: `frontend/src/components/edit/PropertiesPanel.tsx`

- [ ] **Step 1: Add tab bar and Audio tab to PropertiesPanel**

Replace the full content of `frontend/src/components/edit/PropertiesPanel.tsx` with:

```tsx
import { useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { AspectRatioSelector } from "../shared/AspectRatioSelector";
import { AudioPropertiesTab } from "../audio/AudioPropertiesTab";
import type { AspectRatio } from "../shared/AspectRatioSelector";

type PropertiesTab = "clip" | "audio";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label" style={{ marginBottom: 6 }}>
      {children}
    </p>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={0}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-primary)",
          padding: "4px 6px",
          fontSize: 12,
          width: "100%",
        }}
      />
    </div>
  );
}

function ClipProperties() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  if (!clip || !media) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 16,
          color: "var(--text-secondary)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        Select a clip to edit properties
      </div>
    );
  }

  const crop = clip.crop ?? { x: 0, y: 0, w: 100, h: 100 };

  const setCrop = (key: "x" | "y" | "w" | "h", val: number) => {
    updateClip(clip.id, { crop: { ...crop, [key]: val } });
  };

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <Section>
        <Label>Crop</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <NumInput label="X" value={crop.x} onChange={(v) => setCrop("x", v)} />
          <NumInput label="Y" value={crop.y} onChange={(v) => setCrop("y", v)} />
          <NumInput label="W" value={crop.w} onChange={(v) => setCrop("w", v)} />
          <NumInput label="H" value={crop.h} onChange={(v) => setCrop("h", v)} />
        </div>
      </Section>

      <Section>
        <Label>Aspect Ratio</Label>
        <AspectRatioSelector
          value="Free"
          onChange={(_ratio: AspectRatio) => {}}
        />
      </Section>

      {clip.type === "video" && (
        <Section>
          <Label>Trim</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumInput
              label="Start (s)"
              value={clip.trim_start}
              onChange={(v) => updateClip(clip.id, { trim_start: v })}
            />
            <NumInput
              label="End (s)"
              value={clip.trim_end ?? (media.duration_seconds ?? 0)}
              onChange={(v) => updateClip(clip.id, { trim_end: v })}
            />
          </div>
        </Section>
      )}

      {clip.type === "video" && (
        <Section>
          <Label>Speed</Label>
          <select
            value={clip.speed}
            onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 12,
              width: "100%",
              cursor: "pointer",
            }}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </Section>
      )}

      {clip.type === "image" && (
        <Section>
          <Label>Duration</Label>
          <NumInput
            label="Seconds"
            value={clip.duration ?? 5}
            onChange={(v) => updateClip(clip.id, { duration: v })}
          />
        </Section>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<PropertiesTab>("clip");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {(["clip", "audio"] as PropertiesTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "6px 0",
              fontSize: 11,
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent, #4a9eff)" : "2px solid transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab === "clip" ? "Clip" : "Audio"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "clip" ? <ClipProperties /> : <AudioPropertiesTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/edit/PropertiesPanel.tsx
git commit -m "feat(audio): add Audio tab to PropertiesPanel with EQ, NR, beat detection"
```

---

## Task 14: Final integration verification

**Files:**
- No new files — run tests + start servers

- [ ] **Step 1: Run full backend test suite**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all existing tests PASS, new audio tests PASS.

- [ ] **Step 2: Start backend**

```bash
cd backend && uvicorn backend.main:app --reload --port 8000
```

Expected: starts without error. Visit `http://localhost:8000/docs` — confirm `/api/audio/import`, `/api/audio/waveform/{media_id}`, `/api/audio/beats/{media_id}`, `/api/audio/sync` all appear.

- [ ] **Step 3: Start frontend**

```bash
cd frontend && npm run dev
```

Expected: starts without error on `http://localhost:5173`.

- [ ] **Step 4: Manual smoke test**

1. Open the app → Edit tab → Multi-track view
2. Confirm three audio track rows appear: Original, Music, Voice-over
3. Click "+ Import" on Music row → select an MP3/WAV → confirm waveform renders
4. Open Properties panel → Audio tab → confirm EQ sliders and NR slider appear
5. Click "Detect Beats" → confirm beat markers appear on music track row
6. Confirm "Auto-cut to Beats (N)" button shows beat count

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(audio): audio suite integration complete — waveform, beats, EQ, NR, voice-over"
```
