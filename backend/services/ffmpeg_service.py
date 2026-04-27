"""FFmpeg service — probe and process media files using ffmpeg-python."""
from __future__ import annotations

import os
import subprocess
import tempfile
from typing import List

import ffmpeg

from backend.models.media import MediaProbeResult


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
    """Create a low-res H.264/MP4 proxy (crf=28, fast preset), preserving audio.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    width, height = resolution.split("x")
    try:
        probe = ffmpeg.probe(input_path)
        has_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    except Exception:
        has_audio = False

    try:
        inp = ffmpeg.input(input_path)
        video = inp.video.filter("scale", int(width), int(height))
        if has_audio:
            (
                ffmpeg
                .output(
                    video, inp.audio,
                    output_path,
                    vcodec="libx264",
                    crf=28,
                    preset="fast",
                    acodec="aac",
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
        else:
            (
                ffmpeg
                .output(
                    video,
                    output_path,
                    vcodec="libx264",
                    crf=28,
                    preset="fast",
                    an=None,
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
            .output(output_path, vcodec="libx264", acodec="aac")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to trim '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def concat_media(
    input_paths: List[str],
    output_path: str,
    fps: int = 30,
    sample_rate: int = 44100,
) -> str:
    """Concatenate clips via ffmpeg concat demuxer (direct subprocess call).

    Uses subprocess instead of ffmpeg-python to guarantee the concat DEMUXER
    is used (not the concat filter). The demuxer decodes each file independently
    so SAR, FPS, pixel-format and sample-rate differences are handled by the
    decoder — no parameter-matching required.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    if not input_paths:
        raise ValueError("input_paths must not be empty")

    list_file = None
    try:
        # Write the concat list file — one 'file <path>' line per clip
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as lf:
            for p in input_paths:
                lf.write(f"file {p!r}\n")
            list_file = lf.name

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_file,
            "-vf", f"setsar=1,fps={fps},format=yuv420p",
            "-af", f"aresample={sample_rate}",
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise ValueError(
                f"Failed to concatenate clips: {result.stderr}"
            )
    finally:
        if list_file and os.path.exists(list_file):
            try:
                os.unlink(list_file)
            except OSError:
                pass

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
    """Resize video to width×height with padding, preserving audio.

    Returns output_path on success.
    Raises ValueError on failure.
    """
    try:
        probe = ffmpeg.probe(input_path)
        has_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    except Exception:
        has_audio = False

    try:
        inp = ffmpeg.input(input_path)
        video = (
            inp.video
            .filter("scale", width, height, force_original_aspect_ratio="decrease")
            .filter("pad", width, height, "(ow-iw)/2", "(oh-ih)/2")
        )
        if has_audio:
            (
                ffmpeg
                .output(video, inp.audio, output_path, vcodec="libx264", acodec="aac")
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
        else:
            (
                ffmpeg
                .output(video, output_path, vcodec="libx264", an=None)
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


def mix_audio_tracks(
    video_path: str,
    output_path: str,
    audio_tracks: list,  # list of dicts: {stored_path, volume, offset, muted, duration}
    mute_original: bool = False,
) -> str:
    """Mix audio tracks over a video. Each track has offset (seconds) and optional duration trim."""
    import shutil

    active = [t for t in audio_tracks if not t.get("muted", False)]

    if not active and not mute_original:
        shutil.copy2(video_path, output_path)
        return output_path

    cmd = ["ffmpeg", "-y", "-i", video_path]
    filter_parts = []
    audio_labels = []

    for i, track in enumerate(active):
        cmd.extend(["-i", track["stored_path"]])
        idx = i + 1  # video is input 0
        label_out = f"[a{i}]"
        parts = []

        duration = track.get("duration")
        if duration:
            parts.append(f"atrim=0:{duration}")
            parts.append("asetpts=PTS-STARTPTS")

        # Fade in
        fade_in = track.get("fade_in", 0.0) or 0.0
        if fade_in > 0:
            parts.append(f"afade=t=in:st=0:d={fade_in}")

        # Fade out — starts at (duration - fade_out) seconds
        fade_out = track.get("fade_out", 0.0) or 0.0
        if fade_out > 0 and duration and duration > fade_out:
            fade_out_start = round(duration - fade_out, 6)
            parts.append(f"afade=t=out:st={fade_out_start}:d={fade_out}")

        offset_ms = int(track.get("offset", 0) * 1000)
        if offset_ms > 0:
            parts.append(f"adelay={offset_ms}|{offset_ms}")

        volume = track.get("volume", 1.0)
        if volume != 1.0:
            parts.append(f"volume={volume}")

        if not parts:
            parts.append("anull")  # correct no-op audio filter (was "acopy" — bug fix)

        filter_chain = ",".join(parts)
        filter_parts.append(f"[{idx}:a]{filter_chain}{label_out}")
        audio_labels.append(label_out)

    # Check if video has audio stream
    try:
        probe = ffmpeg.probe(video_path)
        has_orig_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    except Exception:
        has_orig_audio = False

    if active:
        if mute_original or not has_orig_audio:
            all_labels = audio_labels
        else:
            all_labels = ["[0:a]"] + audio_labels

        if len(all_labels) == 1:
            mix_label = all_labels[0]
        else:
            mix_label = "[aout]"
            inputs_str = "".join(all_labels)
            filter_parts.append(f"{inputs_str}amix=inputs={len(all_labels)}:normalize=0[aout]")
    else:
        # mute_original=True, no active tracks → strip audio
        cmd_strip = ["ffmpeg", "-y", "-i", video_path, "-c:v", "copy", "-an", output_path]
        result = subprocess.run(cmd_strip, capture_output=True, text=True)
        if result.returncode != 0:
            raise ValueError(f"Failed to strip audio: {result.stderr}")
        return output_path

    filter_str = ";".join(filter_parts)
    cmd.extend([
        "-filter_complex", filter_str,
        "-map", "0:v",
        "-map", mix_label,
        "-c:v", "copy",
        "-c:a", "aac",
        output_path,
    ])

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValueError(f"Failed to mix audio tracks: {result.stderr}")
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
        video = ffmpeg.input(image_path, loop=1, t=duration)
        silence = ffmpeg.input("anullsrc=channel_layout=stereo:sample_rate=44100", f="lavfi", t=duration)
        (
            ffmpeg
            .output(
                video.video,
                silence.audio,
                output_path,
                vcodec="libx264",
                pix_fmt="yuv420p",
                acodec="aac",
                r=24,
                shortest=None,
            )
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to convert image '{image_path}' to video: {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path
