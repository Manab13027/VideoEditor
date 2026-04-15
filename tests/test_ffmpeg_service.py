"""Tests for FFmpeg service."""
import os
import subprocess
import tempfile

import pytest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from services.ffmpeg_service import probe_file


def _create_test_video(path: str, duration: float = 2.0) -> None:
    """Create a tiny red 320x240 H.264 video using ffmpeg subprocess."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=red:size=320x240:duration={duration}:rate=24",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True)
    assert result.returncode == 0, f"ffmpeg failed: {result.stderr.decode()}"


def test_probe_video():
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
    try:
        _create_test_video(tmp_path, duration=2.0)
        result = probe_file(tmp_path)
        assert result.width == 320
        assert result.height == 240
        assert result.duration_seconds is not None
        assert result.duration_seconds >= 1.5
        assert result.format == "h264"
        assert result.file_size_bytes > 0
    finally:
        os.unlink(tmp_path)


def test_probe_invalid_file():
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(b"\x00\x01\x02garbage data not a video file")
        tmp_path = f.name
    try:
        with pytest.raises(ValueError, match="Failed to probe"):
            probe_file(tmp_path)
    finally:
        os.unlink(tmp_path)
