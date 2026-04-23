"""FFmpeg service — probe and process media files using ffmpeg-python."""
from __future__ import annotations

import os
import subprocess
from typing import List, Optional

import ffmpeg

from backend.models.media import MediaProbeResult


def _run_ffmpeg_cmd(args: list[str]) -> None:
    """Run an ffmpeg command list, raise ValueError on failure."""
    result = subprocess.run(
        ["ffmpeg", *args, "-y"],
        capture_output=True,
    )
    if result.returncode != 0:
        raise ValueError(result.stderr.decode(errors="replace"))


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


def _has_audio(path: str) -> bool:
    """Return True if the media file has at least one audio stream."""
    try:
        probe = ffmpeg.probe(path)
        return any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    except Exception:
        return False


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
        inp = ffmpeg.input(input_path)
        video = inp.video.filter("scale", int(width), int(height))
        if _has_audio(input_path):
            out = ffmpeg.output(
                video, inp.audio, output_path,
                vcodec="libx264", crf=28, preset="fast", acodec="aac",
            )
        else:
            out = ffmpeg.output(
                video, output_path,
                vcodec="libx264", crf=28, preset="fast",
            )
        out.overwrite_output().run(capture_stdout=True, capture_stderr=True)
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
        inp = ffmpeg.input(input_path)
        video = (
            inp.video
            .filter("scale", width, height, force_original_aspect_ratio="decrease")
            .filter("pad", width, height, "(ow-iw)/2", "(oh-ih)/2")
        )
        if _has_audio(input_path):
            out = ffmpeg.output(video, inp.audio, output_path)
        else:
            out = ffmpeg.output(video, output_path)
        out.overwrite_output().run(capture_stdout=True, capture_stderr=True)
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


def reverse_video(input_path: str, output_path: str) -> str:
    """Reverse video and audio."""
    try:
        inp = ffmpeg.input(input_path)
        video = inp.video.filter("reverse")
        audio = inp.audio.filter("areverse")
        (
            ffmpeg
            .output(video, audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to reverse '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def rotate_video(input_path: str, output_path: str, degrees: int) -> str:
    """Rotate video by 90, 180, or 270 degrees clockwise."""
    if degrees not in (90, 180, 270):
        import shutil
        shutil.copy2(input_path, output_path)
        return output_path
    try:
        inp = ffmpeg.input(input_path)
        if degrees == 90:
            video = inp.video.filter("transpose", 1)
        elif degrees == 180:
            video = inp.video.filter("vflip").filter("hflip")
        else:  # 270
            video = inp.video.filter("transpose", 2)
        (
            ffmpeg
            .output(video, inp.audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to rotate '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def apply_color_grade(
    input_path: str,
    output_path: str,
    brightness: float = 1.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    hue: float = 0.0,
) -> str:
    """Apply brightness/contrast/saturation/hue adjustments.

    Brightness and contrast are in CSS scale (1.0 = normal).
    FFmpeg eq brightness is in -1..1 range (0 = normal), so we subtract 1.
    """
    ffmpeg_brightness = brightness - 1.0
    needs_eq = abs(ffmpeg_brightness) > 0.01 or abs(contrast - 1.0) > 0.01 or abs(saturation - 1.0) > 0.01
    needs_hue = abs(hue) > 0.5

    if not needs_eq and not needs_hue:
        import shutil
        shutil.copy2(input_path, output_path)
        return output_path

    try:
        inp = ffmpeg.input(input_path)
        video = inp.video
        if needs_eq:
            video = video.filter(
                "eq",
                brightness=ffmpeg_brightness,
                contrast=contrast,
                saturation=saturation,
            )
        if needs_hue:
            video = video.filter("hue", h=hue)
        (
            ffmpeg
            .output(video, inp.audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to color grade '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def apply_filter_preset(input_path: str, output_path: str, preset: str) -> str:
    """Apply a named visual filter preset (grayscale, sepia, vintage, vivid, cool, warm)."""
    try:
        inp = ffmpeg.input(input_path)
        v = inp.video

        if preset == "grayscale":
            v = v.filter("hue", s=0)
        elif preset == "sepia":
            v = v.filter(
                "colorchannelmixer",
                rr=0.393, rg=0.769, rb=0.189,
                gr=0.349, gg=0.686, gb=0.168,
                br=0.272, bg=0.534, bb=0.131,
            )
        elif preset == "vintage":
            v = v.filter("eq", saturation=0.7, contrast=0.9, brightness=-0.05)
            v = v.filter("hue", s=0.6)
        elif preset == "vivid":
            v = v.filter("eq", saturation=1.5, contrast=1.1)
        elif preset == "cool":
            v = v.filter("colorbalance", bs=0.15)
        elif preset == "warm":
            v = v.filter("colorbalance", rs=0.15, gs=0.05)
        elif preset == "teal_orange":
            v = v.filter("colorbalance", rs=0.12, bs=-0.1, gh=-0.05, bh=0.08)
            v = v.filter("eq", saturation=1.3, contrast=1.1)
        elif preset == "matte":
            v = v.filter("eq", contrast=0.85, brightness=0.05, saturation=0.75)
        elif preset == "film_noir":
            v = v.filter("hue", s=0)
            v = v.filter("eq", contrast=1.4, brightness=-0.1)
        elif preset == "golden":
            v = v.filter("colorbalance", rs=0.15, gs=0.05, bs=-0.1)
            v = v.filter("eq", saturation=1.4, brightness=0.08)
        elif preset == "cyberpunk":
            v = v.filter("eq", saturation=2.0, contrast=1.25)
            v = v.filter("colorbalance", bs=0.2, rs=0.1)
        elif preset == "faded":
            v = v.filter("eq", contrast=0.88, brightness=0.1, saturation=0.8)
        else:
            raise ValueError(f"Unknown filter preset '{preset}'")

        (
            ffmpeg
            .output(v, inp.audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to apply filter '{preset}' to '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def add_fade(
    input_path: str,
    output_path: str,
    fade_in: float = 0.0,
    fade_out: float = 0.0,
) -> str:
    """Add fade-in and/or fade-out to a clip."""
    if fade_in <= 0 and fade_out <= 0:
        import shutil
        shutil.copy2(input_path, output_path)
        return output_path
    try:
        info = ffmpeg.probe(input_path)
        duration = float(info["format"]["duration"])

        inp = ffmpeg.input(input_path)
        video = inp.video
        if fade_in > 0:
            video = video.filter("fade", type="in", duration=fade_in)
        if fade_out > 0:
            start = max(0.0, duration - fade_out)
            video = video.filter("fade", type="out", start_time=start, duration=fade_out)
        (
            ffmpeg
            .output(video, inp.audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to add fade to '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def change_speed(input_path: str, output_path: str, speed: float) -> str:
    """Change video playback speed. >1 faster, <1 slower.

    Uses setpts for video and chained atempo for audio (atempo is limited to 0.5–2.0,
    so values outside that range require multiple filters in series).
    """
    if abs(speed - 1.0) < 0.001:
        import shutil
        shutil.copy2(input_path, output_path)
        return output_path

    pts = 1.0 / speed

    # Build atempo chain — each filter must be in [0.5, 2.0]
    atempo_values: list[float] = []
    remaining = speed
    while remaining > 2.0:
        atempo_values.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        atempo_values.append(0.5)
        remaining /= 0.5
    atempo_values.append(remaining)

    try:
        inp = ffmpeg.input(input_path)
        video = inp.video.filter("setpts", f"{pts:.6f}*PTS")
        audio = inp.audio
        for tempo in atempo_values:
            audio = audio.filter("atempo", tempo)
        (
            ffmpeg
            .output(video, audio, output_path)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as exc:
        raise ValueError(
            f"Failed to change speed of '{input_path}': {exc.stderr.decode(errors='replace')}"
        ) from exc
    return output_path


def apply_curves(
    input_path: str,
    output_path: str,
    rgb: Optional[list] = None,
    r: Optional[list] = None,
    g: Optional[list] = None,
    b: Optional[list] = None,
) -> str:
    """Apply per-channel RGB curves. Each channel is a list of {x, y} points (0–255)."""
    def to_str(pts: Optional[list]) -> Optional[str]:
        if not pts or len(pts) < 2:
            return None
        s = sorted(pts, key=lambda p: p["x"])
        return " ".join(f"{p['x']/255:.4f}/{p['y']/255:.4f}" for p in s)

    parts = []
    if (ms := to_str(rgb)): parts.append(f"master='{ms}'")
    if (rs := to_str(r)):   parts.append(f"r='{rs}'")
    if (gs := to_str(g)):   parts.append(f"g='{gs}'")
    if (bs := to_str(b)):   parts.append(f"b='{bs}'")

    if not parts:
        import shutil; shutil.copy2(input_path, output_path); return output_path

    _run_ffmpeg_cmd(["-i", input_path, "-vf", f"curves={':'.join(parts)}", "-map", "0:a?", output_path])
    return output_path


def apply_color_wheels(
    input_path: str,
    output_path: str,
    shadows: Optional[dict] = None,
    midtones: Optional[dict] = None,
    highlights: Optional[dict] = None,
) -> str:
    """Apply three-way color correction (shadows/midtones/highlights) via colorbalance."""
    def v(d: Optional[dict], k: str) -> float:
        return float((d or {}).get(k, 0.0))

    vals = [v(shadows, "r"), v(shadows, "g"), v(shadows, "b"),
            v(midtones, "r"), v(midtones, "g"), v(midtones, "b"),
            v(highlights, "r"), v(highlights, "g"), v(highlights, "b")]

    if all(abs(x) < 0.005 for x in vals):
        import shutil; shutil.copy2(input_path, output_path); return output_path

    sr, sg, sb = vals[0], vals[1], vals[2]
    mr, mg, mb = vals[3], vals[4], vals[5]
    hr, hg, hb = vals[6], vals[7], vals[8]

    filt = (
        f"colorbalance=rs={sr:.3f}:gs={sg:.3f}:bs={sb:.3f}"
        f":rm={mr:.3f}:gm={mg:.3f}:bm={mb:.3f}"
        f":rh={hr:.3f}:gh={hg:.3f}:bh={hb:.3f}"
    )
    _run_ffmpeg_cmd(["-i", input_path, "-vf", filt, "-map", "0:a?", output_path])
    return output_path


def apply_glow(input_path: str, output_path: str, intensity: float = 0.5) -> str:
    """Apply glow effect — blur + lighten blend."""
    if intensity < 0.01:
        import shutil; shutil.copy2(input_path, output_path); return output_path
    sigma = max(1, int(intensity * 18))
    opacity = min(1.0, intensity * 1.5)
    fc = (
        f"[0:v]split[m][b];"
        f"[b]gblur=sigma={sigma}[bg];"
        f"[m][bg]blend=all_mode=lighten:all_opacity={opacity:.2f}[v]"
    )
    _run_ffmpeg_cmd(["-i", input_path, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", output_path])
    return output_path


def apply_motion_blur(input_path: str, output_path: str, amount: float = 0.5) -> str:
    """Apply motion blur via temporal frame mixing."""
    if amount < 0.01:
        import shutil; shutil.copy2(input_path, output_path); return output_path
    frames = max(2, min(15, int(amount * 12)))
    weights = " ".join(str(i + 1) for i in range(frames))
    filt = f"tmix=frames={frames}:weights='{weights}'"
    _run_ffmpeg_cmd(["-i", input_path, "-vf", filt, "-map", "0:a?", output_path])
    return output_path


def apply_shake(input_path: str, output_path: str, amount: float = 0.5) -> str:
    """Apply camera shake via random crop displacement."""
    if amount < 0.01:
        import shutil; shutil.copy2(input_path, output_path); return output_path
    # Probe dimensions for safe crop
    info = ffmpeg.probe(input_path)
    vs = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    w = int(vs["width"]) if vs else 1280
    h = int(vs["height"]) if vs else 720
    margin = max(4, int(amount * min(w, h) * 0.03))
    cw, ch = w - margin * 2, h - margin * 2
    # Displacement using a simple sine-based expression
    freq = 8 + int(amount * 12)
    amp = margin
    filt = (
        f"crop={cw}:{ch}:"
        f"x={amp}+{amp}*sin(2*PI*t*{freq}/1):"
        f"y={amp}+{amp}*cos(2*PI*t*{freq}/1.3),"
        f"scale={w}:{h}"
    )
    _run_ffmpeg_cmd(["-i", input_path, "-vf", filt, "-map", "0:a?", output_path])
    return output_path


def apply_transition(
    clip_a: str,
    clip_b: str,
    output_path: str,
    transition_type: str = "fade",
    duration: float = 0.5,
    offset: float = 0.0,
) -> str:
    """Apply xfade transition between two clips at the given offset (end of clip_a minus duration)."""
    xfade_map = {
        "fade":       "fade",
        "crossfade":  "fade",
        "wipe_left":  "slideleft",
        "wipe_right": "slideright",
        "zoom_in":    "zoomin",
        "glitch":     "pixelize",
    }
    xtype = xfade_map.get(transition_type, "fade")
    fc = f"[0:v][1:v]xfade=transition={xtype}:duration={duration:.2f}:offset={offset:.2f}[v]"
    _run_ffmpeg_cmd(["-i", clip_a, "-i", clip_b, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", output_path])
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
