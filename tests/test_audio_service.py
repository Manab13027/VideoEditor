"""Tests for audio_service pure functions."""
import math
import os
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
        _make_wav(wav_path, duration=5.0, freq=2.0)
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
