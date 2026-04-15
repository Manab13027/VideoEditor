"""FFmpeg service — probe and process media files using ffmpeg-python."""
from __future__ import annotations

import os
from typing import List

import ffmpeg

from models.media import MediaProbeResult


def probe_file(file_path: str) -> MediaProbeResult:
    """Probe a media file and return metadata.

    Raises:
        ValueError: If the file cannot be probed (invalid/corrupt).
    """
    try:
        info = ffmpeg.probe(file_path)
    except ffmpeg.Error as exc:
        raise ValueError(f"Failed to probe '{file_path}': {exc.stderr.decode(errors='replace')}") from exc

    video_stream = next(
        (s for s in info.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if video_stream is None:
        raise ValueError(f"Failed to probe '{file_path}': no video stream found")

    fmt = info.get("format", {})
    duration_str = fmt.get("duration") or video_stream.get("duration")
    duration = float(duration_str) if duration_str else None
    size = int(fmt.get("size", 0)) or os.path.getsize(file_path)

    return MediaProbeResult(
        width=int(video_stream["width"]),
        height=int(video_stream["height"]),
        duration_seconds=duration,
        codec=video_stream.get("codec_name", "unknown"),
        format=video_stream.get("codec_name", "unknown"),
        file_size_bytes=size,
    )


def generate_thumbnail(input_path: str, output_path: str, timestamp: float = 1.0) -> str:
    """Extract a single frame at *timestamp* seconds, scaled to 320 px wide.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        (
            ffmpeg
            .input(input_path, ss=timestamp)
            .filter("scale", 320, -1)
            .output(output_path, vframes=1)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to generate thumbnail from '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def generate_proxy(
    input_path: str,
    output_path: str,
    resolution: str = "1280x720",
) -> str:
    """Create a low-res H.264/MP4 proxy (crf=28, fast preset).

    Returns output_path on success.
    Raises ValueError on failure.
    """
    width, height = resolution.split("x")
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("scale", int(width), int(height))
            .output(
                output_path,
                vcodec="libx264",
                crf=28,
                preset="fast",
                acodec="aac",
            )
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to generate proxy from '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def crop_video(
    input_path: str,
    output_path: str,
    x: int,
    y: int,
    w: int,
    h: int,
) -> str:
    """Crop video to rectangle (x, y, w, h).

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("crop", w, h, x, y)
            .output(output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to crop '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def trim_video(
    input_path: str,
    output_path: str,
    start_seconds: float,
    end_seconds: float,
) -> str:
    """Trim video to [start_seconds, end_seconds].

    Returns output_path on success.
    Raises ValueError on failure.
    """
    duration = end_seconds - start_seconds
    if duration <= 0:
        raise ValueError(f"end_seconds ({end_seconds}) must be greater than start_seconds ({start_seconds})")
    try:
        (
            ffmpeg
            .input(input_path, ss=start_seconds, t=duration)
            .output(output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to trim '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def concat_media(input_paths: List[str], output_path: str) -> str:
    """Concatenate multiple clips into one output file.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    if not input_paths:
        raise ValueError("input_paths must not be empty")
    try:
        streams = [ffmpeg.input(p) for p in input_paths]
        (
            ffmpeg
            .concat(*streams)
            .output(output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to concatenate clips: {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def convert_format(
    input_path: str,
    output_path: str,
    codec: str = "libx264",
    audio_codec: str = "aac",
) -> str:
    """Convert media to a different format/codec.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        (
            ffmpeg
            .input(input_path)
            .output(output_path, vcodec=codec, acodec=audio_codec)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to convert '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def resize_video(
    input_path: str,
    output_path: str,
    width: int,
    height: int,
) -> str:
    """Resize video to width×height with padding to maintain aspect ratio.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("scale", width, height, force_original_aspect_ratio="decrease")
            .filter("pad", width, height, "(ow-iw)/2", "(oh-ih)/2")
            .output(output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to resize '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def add_watermark(
    input_path: str,
    watermark_path: str,
    output_path: str,
    x: str = "W-w-10",
    y: str = "H-h-10",
    opacity: float = 0.5,
) -> str:
    """Overlay a watermark image onto video at position (x, y) with given opacity.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        video = ffmpeg.input(input_path)
        watermark = ffmpeg.input(watermark_path).filter("format", "rgba").filter("colorchannelmixer", aa=opacity)
        (
            ffmpeg
            .overlay(video, watermark, x=x, y=y)
            .output(output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to add watermark to '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


# CRF values per quality level
_QUALITY_CRF = {
    "low": 35,
    "medium": 28,
    "high": 23,
}


def compress_video(
    input_path: str,
    output_path: str,
    quality: str = "medium",
) -> str:
    """Compress video using CRF encoding (low=35, medium=28, high=23).

    Returns output_path on success.
    Raises ValueError on failure.
    """
    crf = _QUALITY_CRF.get(quality)
    if crf is None:
        raise ValueError(f"Unknown quality '{quality}'. Choose from: {list(_QUALITY_CRF)}")
    try:
        (
            ffmpeg
            .input(input_path)
            .output(output_path, vcodec="libx264", crf=crf, acodec="aac")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to compress '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def image_to_video(
    image_path: str,
    output_path: str,
    duration: float = 3.0,
) -> str:
    """Convert a still image to a video clip of *duration* seconds.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        (
            ffmpeg
            .input(image_path, loop=1, t=duration)
            .output(output_path, vcodec="libx264", pix_fmt="yuv420p", r=24)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to convert image '{image_path}' to video: {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path
