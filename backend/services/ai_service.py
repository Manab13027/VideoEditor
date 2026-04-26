"""AI-powered video processing services."""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(args: list[str]) -> subprocess.CompletedProcess:
    """Run a command, raise ValueError on non-zero exit."""
    result = subprocess.run(args, capture_output=True)
    if result.returncode != 0:
        raise ValueError(result.stderr.decode(errors="replace"))
    return result


def _segments_to_srt(segments: list[dict]) -> str:
    """Convert Whisper segment dicts to SRT text."""
    def fmt(t: float) -> str:
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int(round((t - int(t)) * 1000))
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{fmt(seg['start'])} --> {fmt(seg['end'])}")
        lines.append(seg["text"].strip())
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def transcribe_video(video_path: str, language: Optional[str] = None) -> list[dict]:
    """Transcribe audio → Whisper segments [{start, end, text}].

    Tries faster-whisper first, falls back to openai-whisper.
    Model size: 'base'.
    """
    # --- Extract audio to a temp WAV for whisper ---
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
    try:
        _run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ar", "16000", "-ac", "1", "-f", "wav", audio_path,
        ])

        # Try faster-whisper first
        try:
            from faster_whisper import WhisperModel  # type: ignore
            model = WhisperModel("base", device="cpu", compute_type="int8")
            kwargs: dict = {}
            if language:
                kwargs["language"] = language
            raw_segments, _ = model.transcribe(audio_path, **kwargs)
            return [
                {"start": seg.start, "end": seg.end, "text": seg.text}
                for seg in raw_segments
            ]
        except ImportError:
            pass

        # Fallback: openai-whisper
        try:
            import whisper  # type: ignore
        except ImportError as exc:
            raise ValueError(
                "No Whisper backend found. Install one:\n"
                "  pip install faster-whisper\n"
                "  pip install openai-whisper"
            ) from exc

        model_ow = whisper.load_model("base")
        kwargs_ow: dict = {}
        if language:
            kwargs_ow["language"] = language
        result = model_ow.transcribe(audio_path, **kwargs_ow)
        return [
            {"start": seg["start"], "end": seg["end"], "text": seg["text"]}
            for seg in result.get("segments", [])
        ]
    finally:
        if os.path.exists(audio_path):
            os.unlink(audio_path)


def burn_subtitles(
    video_path: str,
    srt_path: str,
    output_path: str,
    style: str = "default",
) -> str:
    """Burn SRT subtitles into video using ffmpeg subtitles filter.

    style='default': white text, black outline, bottom center.
    style='cinematic': yellow italic text.
    Returns output_path.
    """
    # Escape path for ffmpeg filter string (colons and backslashes)
    safe_srt = srt_path.replace("\\", "/").replace(":", "\\:")

    if style == "cinematic":
        force_style = (
            "FontName=Arial,FontSize=22,PrimaryColour=&H0000FFFF,"
            "OutlineColour=&H00000000,Outline=1,Shadow=0,"
            "Italic=1,Alignment=2,MarginV=30"
        )
    else:
        force_style = (
            "FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,Outline=2,Shadow=1,"
            "Alignment=2,MarginV=30"
        )

    vf = f"subtitles='{safe_srt}':force_style='{force_style}'"
    _run(["ffmpeg", "-y", "-i", video_path, "-vf", vf,
          "-c:v", "libx264", "-crf", "23", "-c:a", "copy", output_path])
    return output_path


def remove_background(
    input_path: str,
    output_path: str,
    media_type: str = "image",
) -> str:
    """Remove background using rembg (U2Net model).

    For images: direct rembg call → PNG with transparency.
    For videos: frame-by-frame, output as WebM with alpha (libvpx-vp9 yuva420p).
    """
    try:
        from rembg import remove as rembg_remove  # type: ignore
    except ImportError as exc:
        raise ValueError("Install rembg: pip install rembg[gpu]") from exc

    if media_type == "image":
        from PIL import Image  # type: ignore
        import io

        with open(input_path, "rb") as f:
            data = f.read()
        result_bytes = rembg_remove(data)
        img = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        img.save(output_path, "PNG")
        return output_path

    # Video: frame-by-frame processing
    from PIL import Image  # type: ignore
    import io

    with tempfile.TemporaryDirectory() as frames_dir:
        frames_in = str(Path(frames_dir) / "frame_%05d.png")
        frames_out_dir = str(Path(frames_dir) / "out")
        Path(frames_out_dir).mkdir()

        # Extract frames
        _run(["ffmpeg", "-y", "-i", input_path, frames_in])

        frame_files = sorted(Path(frames_dir).glob("frame_*.png"))
        for frame_file in frame_files:
            with open(frame_file, "rb") as f:
                data = f.read()
            result_bytes = rembg_remove(data)
            out_frame = Path(frames_out_dir) / frame_file.name
            img = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
            img.save(str(out_frame), "PNG")

        # Get FPS from source
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate",
             "-of", "default=noprint_wrappers=1:nokey=1", input_path],
            capture_output=True, text=True,
        )
        fps_str = probe.stdout.strip()
        # r_frame_rate comes as "30/1" or "2997/100"
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = float(num) / float(den)
        else:
            fps = float(fps_str) if fps_str else 25.0

        frames_out_pattern = str(Path(frames_out_dir) / "frame_%05d.png")
        _run([
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", frames_out_pattern,
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-b:v", "0", "-crf", "30",
            output_path,
        ])

    return output_path


def auto_cut_silence(
    input_path: str,
    output_path: str,
    threshold_db: float = -35.0,
    min_duration: float = 0.5,
) -> dict:
    """Detect silence via ffmpeg silencedetect, remove silent segments.

    Returns {segments_removed, time_saved_seconds, keep_segments: [(start, end)...]}.
    """
    # Detect silence
    detect_result = subprocess.run(
        [
            "ffmpeg", "-i", input_path,
            "-af", f"silencedetect=n={threshold_db}dB:d={min_duration}",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    stderr = detect_result.stderr

    # Parse silence_start / silence_end pairs
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", stderr)]

    # Probe total duration
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", input_path],
        capture_output=True, text=True,
    )
    total_duration = float(probe.stdout.strip() or "0")

    # Build keep segments (inverse of silent ones)
    silent_ranges: list[tuple[float, float]] = []
    for s, e in zip(starts, ends):
        silent_ranges.append((s, e))
    # If last silence_start has no end, it goes to end of file
    if len(starts) > len(ends):
        silent_ranges.append((starts[-1], total_duration))

    keep_segments: list[tuple[float, float]] = []
    cursor = 0.0
    for s_start, s_end in sorted(silent_ranges):
        if s_start > cursor:
            keep_segments.append((cursor, s_start))
        cursor = s_end
    if cursor < total_duration:
        keep_segments.append((cursor, total_duration))

    if not keep_segments:
        raise ValueError("No non-silent segments found in the video.")

    time_saved = sum((e - s) for s, e in silent_ranges if e <= total_duration)
    segments_removed = len(silent_ranges)

    # Build select/aselect filter expression
    video_select_parts = []
    audio_select_parts = []
    for s, e in keep_segments:
        video_select_parts.append(f"between(t,{s:.3f},{e:.3f})")
        audio_select_parts.append(f"between(t,{s:.3f},{e:.3f})")

    select_expr = "+".join(video_select_parts)
    vf = f"select='{select_expr}',setpts=N/FRAME_RATE/TB"
    af = f"aselect='{select_expr}',asetpts=N/SR/TB"

    _run([
        "ffmpeg", "-y", "-i", input_path,
        "-vf", vf, "-af", af,
        "-c:v", "libx264", "-crf", "23",
        "-c:a", "aac",
        output_path,
    ])

    return {
        "segments_removed": segments_removed,
        "time_saved_seconds": round(time_saved, 3),
        "keep_segments": [(round(s, 3), round(e, 3)) for s, e in keep_segments],
    }


def smart_reframe(
    input_path: str,
    output_path: str,
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """Reframe to target aspect ratio using face detection to find subject center.

    Samples every 30 frames with OpenCV haarcascade. Falls back to center crop.
    """
    try:
        import cv2  # type: ignore
    except ImportError as exc:
        raise ValueError(
            "Install opencv-python: pip install opencv-python"
        ) from exc

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    cap = cv2.VideoCapture(input_path)
    orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    cx_sum = 0.0
    cy_sum = 0.0
    face_count = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % 30 == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            for (x, y, w, h) in faces:
                cx_sum += x + w / 2
                cy_sum += y + h / 2
                face_count += 1
        frame_idx += 1

    cap.release()

    if face_count > 0:
        subject_cx = int(cx_sum / face_count)
        subject_cy = int(cy_sum / face_count)
    else:
        subject_cx = orig_width // 2
        subject_cy = orig_height // 2

    # Determine crop dimensions preserving target aspect ratio
    target_ratio = target_width / target_height
    orig_ratio = orig_width / orig_height

    if orig_ratio > target_ratio:
        # Source is wider — crop width
        crop_h = orig_height
        crop_w = int(crop_h * target_ratio)
    else:
        # Source is taller — crop height
        crop_w = orig_width
        crop_h = int(crop_w / target_ratio)

    # Center the crop on the detected subject
    crop_x = max(0, min(subject_cx - crop_w // 2, orig_width - crop_w))
    crop_y = max(0, min(subject_cy - crop_h // 2, orig_height - crop_h))

    vf = (
        f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},"
        f"scale={target_width}:{target_height}"
    )
    _run([
        "ffmpeg", "-y", "-i", input_path,
        "-vf", vf,
        "-c:v", "libx264", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ])
    return output_path


def enhance_faces(input_path: str, output_path: str) -> str:
    """Enhance facial quality.

    Tries GFPGAN first; falls back to ffmpeg unsharp + denoise.
    Works for images and videos.
    """
    # Try GFPGAN
    try:
        from gfpgan import GFPGANer  # type: ignore
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        enhancer = GFPGANer(
            model_path=None,  # auto-download
            upscale=1,
            arch="clean",
            channel_multiplier=2,
        )
        img = cv2.imread(input_path)
        if img is not None:
            _, _, restored_img = enhancer.enhance(img, has_aligned=False, only_center_face=False)
            cv2.imwrite(output_path, restored_img)
            return output_path
        # If cv2.imread returned None, fall through to ffmpeg for video
    except (ImportError, Exception):
        pass

    # Fallback: ffmpeg unsharp + hqdn3d
    vf = "unsharp=5:5:1.5:5:5:0.0,hqdn3d=2:1:2:3"
    _run([
        "ffmpeg", "-y", "-i", input_path,
        "-vf", vf,
        "-c:v", "libx264", "-crf", "20",
        "-c:a", "copy",
        output_path,
    ])
    return output_path


def track_object(
    video_path: str,
    bbox: tuple,  # (x, y, w, h) pixel coords for frame 0
) -> list[dict]:
    """Track object through video using OpenCV CSRT tracker.

    Returns [{frame, success, bbox:[x,y,w,h]}].
    """
    try:
        import cv2  # type: ignore
    except ImportError as exc:
        raise ValueError(
            "Install opencv-python: pip install opencv-python"
        ) from exc

    # Try modern API first, fall back to legacy
    try:
        tracker = cv2.TrackerCSRT_create()
    except AttributeError:
        try:
            tracker = cv2.legacy.TrackerCSRT_create()  # type: ignore
        except AttributeError as exc:
            raise ValueError(
                "CSRT tracker not available. Install opencv-contrib-python: "
                "pip install opencv-contrib-python"
            ) from exc

    cap = cv2.VideoCapture(video_path)
    ret, first_frame = cap.read()
    if not ret:
        cap.release()
        raise ValueError(f"Cannot read video: {video_path}")

    x, y, w, h = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
    tracker.init(first_frame, (x, y, w, h))

    tracks: list[dict] = [{"frame": 0, "success": True, "bbox": [x, y, w, h]}]
    frame_idx = 1

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        success, box = tracker.update(frame)
        if success:
            bx, by, bw, bh = (int(v) for v in box)
            tracks.append({"frame": frame_idx, "success": True, "bbox": [bx, by, bw, bh]})
        else:
            tracks.append({"frame": frame_idx, "success": False, "bbox": [0, 0, 0, 0]})
        frame_idx += 1

    cap.release()
    return tracks


def generate_video_from_text(
    prompt: str,
    duration: int = 4,
    api_token: Optional[str] = None,
) -> dict:
    """Generate video from text using Replicate API (zeroscope-v2-xl).

    Returns {url, status} or raises ValueError.
    Needs: pip install replicate
    Uses REPLICATE_API_TOKEN env var if api_token not provided.
    """
    try:
        import replicate  # type: ignore
    except ImportError as exc:
        raise ValueError("Install replicate: pip install replicate") from exc

    token = api_token or os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise ValueError(
            "No Replicate API token provided. "
            "Pass api_token= or set the REPLICATE_API_TOKEN environment variable."
        )

    os.environ["REPLICATE_API_TOKEN"] = token

    model = (
        "anotherjesse/zeroscope-v2-xl:"
        "9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351"
    )

    try:
        output = replicate.run(
            model,
            input={"prompt": prompt, "num_frames": duration * 8},
        )
    except Exception as exc:
        raise ValueError(f"Replicate API error: {exc}") from exc

    # output is typically a list of file URLs or a single URL
    if isinstance(output, list):
        url = output[0] if output else ""
    else:
        url = str(output)

    return {"url": url, "status": "succeeded"}
