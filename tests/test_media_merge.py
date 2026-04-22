import os
import subprocess
import pytest
from backend.services.ffmpeg_service import concat_media


def test_concat_needs_input():
    with pytest.raises(ValueError, match="input_paths must not be empty"):
        concat_media([], "/tmp/out_merge_test.mp4")


def test_concat_single_file(tmp_path):
    src = tmp_path / "src.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=320x240:r=10",
         "-t", "1", str(src)],
        check=True, capture_output=True,
    )
    out = str(tmp_path / "out.mp4")
    result = concat_media([str(src)], out)
    assert os.path.exists(result)
