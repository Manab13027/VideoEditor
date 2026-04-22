"""Audio processing service — waveform extraction, beat detection, sync."""
from __future__ import annotations

import os
import shutil
import struct
import subprocess
import tempfile
import uuid
from pathlib import Path


def compute_waveform(file_path: str, n_samples: int = 1000) -> list[float]:
    """Return n_samples amplitude values in [0, 1] decoded via ffmpeg."""
    try:
        cmd = [
            "ffmpeg", "-i", file_path,
            "-vn", "-ar", "8000", "-ac", "1", "-f", "f32le", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, check=True)
        raw = result.stdout
    except subprocess.CalledProcessError:
        return [0.0] * n_samples

    count = len(raw) // 4
    if count == 0:
        return [0.0] * n_samples

    samples = [abs(struct.unpack_from("<f", raw, i * 4)[0]) for i in range(count)]

    step = max(1, len(samples) // n_samples)
    buckets: list[float] = []
    for i in range(0, len(samples), step):
        buckets.append(max(samples[i : i + step]))
        if len(buckets) >= n_samples:
            break

    while len(buckets) < n_samples:
        buckets.append(0.0)

    peak = max(buckets) or 1.0
    return [v / peak for v in buckets[:n_samples]]


def import_audio(file_path: str, track_type: str, output_dir: str) -> dict:
    """Normalise an audio file and return metadata including waveform."""
    os.makedirs(output_dir, exist_ok=True)
    media_id = uuid.uuid4().hex
    ext = Path(file_path).suffix or ".mp3"
    out_path = str(Path(output_dir) / f"{media_id}{ext}")

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
    """Return beat timestamps in seconds. Uses librosa if available, else fallback."""
    try:
        import librosa  # type: ignore
        y, sr = librosa.load(file_path, mono=True)
        _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        times = librosa.frames_to_time(beat_frames, sr=sr)
        return [float(t) for t in times]
    except ImportError:
        pass

    return _energy_peaks_fallback(file_path)


def _energy_peaks_fallback(file_path: str) -> list[float]:
    duration = _probe_duration(file_path)
    if duration <= 0:
        return []
    return [round(i * 0.5, 2) for i in range(int(duration / 0.5))]


def sync_audio(input_path: str, output_path: str, target_duration: float) -> str:
    """Stretch or compress audio to match target_duration using atempo filter."""
    src_duration = _probe_duration(input_path)
    if src_duration <= 0:
        shutil.copy2(input_path, output_path)
        return output_path

    ratio = max(0.5, min(src_duration / target_duration, 100.0))
    atempo = f"atempo={ratio:.6f}"

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-af", atempo, output_path],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        raise ValueError(
            f"audio sync failed: {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def _probe_duration(file_path: str) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True, text=True, check=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0
