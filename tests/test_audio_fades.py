"""Unit tests for audio fade filter generation in mix_audio_tracks."""
import subprocess
import pytest
from unittest.mock import patch


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
