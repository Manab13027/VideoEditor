"""Tests for /api/audio endpoints."""
import io
import math
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
