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
    from backend.services.ffmpeg_service import apply_transitions_concat
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        apply_transitions_concat(
            ["a.mp4"], [5.0], [("none", 0.5)], str(tmp_path / "out.mp4")
        )
    # Should have called ffmpeg (via concat_media) — just verify subprocess was invoked
    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    assert "ffmpeg" in cmd


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
