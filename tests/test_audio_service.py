import os
import subprocess
import pytest


def _make_audio(tmp_path, duration=3) -> str:
    path = str(tmp_path / "test.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi",
         "-i", f"sine=frequency=440:duration={duration}",
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
    assert os.path.exists(result["stored_path"])


def test_sync_audio_produces_output(tmp_path):
    from backend.services.audio_service import sync_audio
    audio = _make_audio(tmp_path, duration=5)
    out = str(tmp_path / "synced.mp3")
    sync_audio(audio, out, target_duration=3.0)
    assert os.path.exists(out)
