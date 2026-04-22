"""Export service — resolve settings and build final video from project timeline."""
from __future__ import annotations

import json
import os
import tempfile
from typing import Optional

import ffmpeg
from backend.database import get_db
from backend.services.ffmpeg_service import (
    add_fade,
    apply_color_grade,
    apply_color_wheels,
    apply_curves,
    apply_filter_preset,
    apply_glow,
    apply_motion_blur,
    apply_shake,
    apply_transition,
    change_speed,
    concat_media,
    crop_video,
    image_to_video,
    resize_video,
    reverse_video,
    rotate_video,
    trim_video,
)

QUALITY_TIERS = {
    "sd": {"width": 854, "height": 480, "bitrate": "2M"},
    "hd": {"width": 1280, "height": 720, "bitrate": "5M"},
    "fullhd": {"width": 1920, "height": 1080, "bitrate": "8M"},
    "4k": {"width": 3840, "height": 2160, "bitrate": "20M"},
}

SOCIAL_PRESETS = {
    "youtube": {"width": 1920, "height": 1080, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "instagram_reel": {"width": 1080, "height": 1920, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "tiktok": {"width": 1080, "height": 1920, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "twitter": {"width": 1280, "height": 720, "fps": 30, "codec": "libx264", "bitrate": "5M"},
    "instagram_post": {"width": 1080, "height": 1080, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "whatsapp": {"width": 1280, "height": 720, "fps": 30, "codec": "libx264", "bitrate": "3M"},
}

DEFAULT_FPS = 30
DEFAULT_CODEC = "libx264"
DEFAULT_BITRATE = "5M"


def resolve_export_settings(
    preset: Optional[str] = None,
    quality_tier: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    bitrate: Optional[int] = None,
    fps: int = DEFAULT_FPS,
    codec: str = DEFAULT_CODEC,
) -> dict:
    """Resolve final export settings. Priority: preset > quality_tier > manual values."""
    bitrate_str = f"{bitrate}M" if bitrate is not None else DEFAULT_BITRATE

    settings = {
        "width": width or 1280,
        "height": height or 720,
        "bitrate": bitrate_str,
        "fps": fps,
        "codec": codec,
    }

    # Override with quality tier
    if quality_tier and quality_tier in QUALITY_TIERS:
        tier = QUALITY_TIERS[quality_tier]
        settings["width"] = tier["width"]
        settings["height"] = tier["height"]
        settings["bitrate"] = tier["bitrate"]

    # Override with preset (highest priority)
    if preset and preset in SOCIAL_PRESETS:
        p = SOCIAL_PRESETS[preset]
        settings["width"] = p["width"]
        settings["height"] = p["height"]
        settings["fps"] = p["fps"]
        settings["codec"] = p["codec"]
        settings["bitrate"] = p["bitrate"]

    return settings


async def build_export(project_id: str, output_path: str, export_settings: dict) -> str:
    """Build final video from project timeline.

    Steps:
    1. Fetch project + timeline from DB
    2. For each clip (sorted by order): get stored_path, convert image→video or trim/crop video
    3. Concatenate all processed clips
    4. Resize to target resolution
    5. Return output_path
    """
    db = await get_db()
    try:
        # Fetch project
        async with db.execute(
            "SELECT id, timeline_json FROM projects WHERE id = ?", (project_id,)
        ) as cur:
            project_row = await cur.fetchone()

        if project_row is None:
            raise ValueError(f"Project {project_id} not found")

        timeline_json = project_row["timeline_json"]
        if not timeline_json:
            raise ValueError(f"Project {project_id} has no timeline")

        timeline = json.loads(timeline_json)
        clips = sorted(timeline.get("clips", []), key=lambda c: c.get("order", 0))

        if not clips:
            raise ValueError(f"Project {project_id} timeline has no clips")

        # Fetch media file paths
        processed_clips = []
        tmp_files = []

        for clip in clips:
            media_id = clip["media_id"]
            async with db.execute(
                "SELECT stored_path, media_type, width, height FROM media_files WHERE id = ?", (media_id,)
            ) as cur:
                media_row = await cur.fetchone()

            if media_row is None:
                raise ValueError(f"Media file {media_id} not found")

            stored_path = media_row["stored_path"]
            media_type = media_row["media_type"]
            clip_type = clip.get("type", media_type)

            # Create a temp file for this processed clip
            suffix = ".mp4"
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            tmp.close()
            tmp_path = tmp.name
            tmp_files.append(tmp_path)

            if clip_type == "image":
                duration = clip.get("duration") or 3.0
                image_to_video(stored_path, tmp_path, duration=duration)
            else:
                trim_start = clip.get("trim_start", 0.0)
                trim_end = clip.get("trim_end")
                if trim_end is not None and trim_end > trim_start:
                    trim_video(stored_path, tmp_path, trim_start, trim_end)
                else:
                    import shutil
                    shutil.copy2(stored_path, tmp_path)

            # Apply speed change if not 1x
            speed = float(clip.get("speed", 1.0))
            if abs(speed - 1.0) > 0.001:
                speed_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                speed_tmp.close()
                tmp_files.append(speed_tmp.name)
                change_speed(tmp_path, speed_tmp.name, speed)
                tmp_path = speed_tmp.name

            # Reverse
            if clip.get("reversed"):
                rev_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                rev_tmp.close()
                tmp_files.append(rev_tmp.name)
                reverse_video(tmp_path, rev_tmp.name)
                tmp_path = rev_tmp.name

            # Rotate
            rotate = clip.get("rotate", 0) or 0
            if rotate in (90, 180, 270):
                rot_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                rot_tmp.close()
                tmp_files.append(rot_tmp.name)
                rotate_video(tmp_path, rot_tmp.name, rotate)
                tmp_path = rot_tmp.name

            # Color grade
            color = clip.get("color")
            if color:
                col_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                col_tmp.close()
                tmp_files.append(col_tmp.name)
                apply_color_grade(
                    tmp_path, col_tmp.name,
                    brightness=float(color.get("brightness", 1.0)),
                    contrast=float(color.get("contrast", 1.0)),
                    saturation=float(color.get("saturation", 1.0)),
                    hue=float(color.get("hue", 0.0)),
                )
                tmp_path = col_tmp.name

            # Filter preset
            filter_preset = clip.get("filter")
            if filter_preset:
                filt_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                filt_tmp.close()
                tmp_files.append(filt_tmp.name)
                apply_filter_preset(tmp_path, filt_tmp.name, filter_preset)
                tmp_path = filt_tmp.name

            # Fade in / out
            fade_in = float(clip.get("fade_in") or 0.0)
            fade_out = float(clip.get("fade_out") or 0.0)
            if fade_in > 0 or fade_out > 0:
                fade_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                fade_tmp.close()
                tmp_files.append(fade_tmp.name)
                add_fade(tmp_path, fade_tmp.name, fade_in, fade_out)
                tmp_path = fade_tmp.name

            # RGB Curves
            curves = clip.get("curves")
            if curves:
                crv_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                crv_tmp.close()
                tmp_files.append(crv_tmp.name)
                apply_curves(
                    tmp_path, crv_tmp.name,
                    rgb=curves.get("rgb"),
                    r=curves.get("r"),
                    g=curves.get("g"),
                    b=curves.get("b"),
                )
                tmp_path = crv_tmp.name

            # Color Wheels
            wheels = clip.get("wheels")
            if wheels:
                whl_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                whl_tmp.close()
                tmp_files.append(whl_tmp.name)
                apply_color_wheels(
                    tmp_path, whl_tmp.name,
                    shadows=wheels.get("shadows"),
                    midtones=wheels.get("midtones"),
                    highlights=wheels.get("highlights"),
                )
                tmp_path = whl_tmp.name

            # Effects
            effects = clip.get("effects") or {}
            motion_blur = float(effects.get("motion_blur") or 0.0)
            glow = float(effects.get("glow") or 0.0)
            shake = float(effects.get("shake") or 0.0)

            if motion_blur > 0.01:
                mb_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                mb_tmp.close()
                tmp_files.append(mb_tmp.name)
                apply_motion_blur(tmp_path, mb_tmp.name, motion_blur)
                tmp_path = mb_tmp.name

            if glow > 0.01:
                gl_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                gl_tmp.close()
                tmp_files.append(gl_tmp.name)
                apply_glow(tmp_path, gl_tmp.name, glow)
                tmp_path = gl_tmp.name

            if shake > 0.01 and clip_type == "video":
                sk_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                sk_tmp.close()
                tmp_files.append(sk_tmp.name)
                apply_shake(tmp_path, sk_tmp.name, shake)
                tmp_path = sk_tmp.name

            # Apply crop if set (and not full-frame)
            crop = clip.get("crop")
            if crop and not (
                crop["x"] == 0 and crop["y"] == 0
                and crop["w"] == 100 and crop["h"] == 100
            ):
                actual_w = media_row["width"] or 1280
                actual_h = media_row["height"] or 720
                px = max(0, int(crop["x"] / 100 * actual_w))
                py = max(0, int(crop["y"] / 100 * actual_h))
                pw = max(1, min(int(crop["w"] / 100 * actual_w), actual_w - px))
                ph = max(1, min(int(crop["h"] / 100 * actual_h), actual_h - py))
                crop_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                crop_tmp.close()
                tmp_files.append(crop_tmp.name)
                crop_video(tmp_path, crop_tmp.name, px, py, pw, ph)
                tmp_path = crop_tmp.name

            processed_clips.append(tmp_path)

    finally:
        await db.close()

    try:
        # Apply transitions between clips, then concatenate
        # processed_clips[i] corresponds to clips[i] (transition_in is applied at the seam)
        def _probe_duration(path: str) -> float:
            try:
                info = ffmpeg.probe(path)
                return float(info["format"].get("duration", 0))
            except Exception:
                return 0.0

        # Merge clips with xfade transitions where defined
        merged_clips = [processed_clips[0]]
        for i in range(1, len(processed_clips)):
            clip_meta = clips[i]
            trans_type = clip_meta.get("transition_in", "none")
            trans_dur  = float(clip_meta.get("transition_dur") or 0.5)
            if trans_type and trans_type != "none":
                prev_path = merged_clips[-1]
                prev_dur  = _probe_duration(prev_path)
                offset = max(0.0, prev_dur - trans_dur)
                xf_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                xf_tmp.close()
                tmp_files.append(xf_tmp.name)
                try:
                    apply_transition(prev_path, processed_clips[i], xf_tmp.name, trans_type, trans_dur, offset)
                    merged_clips[-1] = xf_tmp.name
                except Exception:
                    # Fall back to plain concat on xfade failure
                    merged_clips.append(processed_clips[i])
            else:
                merged_clips.append(processed_clips[i])

        if len(merged_clips) == 1:
            concat_path = merged_clips[0]
            tmp_files = [f for f in tmp_files if f != concat_path]
            owns_concat = False
        else:
            concat_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            concat_tmp.close()
            concat_path = concat_tmp.name
            owns_concat = True
            concat_media(merged_clips, concat_path)

        # Resize to target resolution
        target_w = export_settings.get("width", 1280)
        target_h = export_settings.get("height", 720)

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        resize_video(concat_path, output_path, target_w, target_h)

    finally:
        # Clean up temp files
        for f in tmp_files:
            try:
                os.unlink(f)
            except OSError:
                pass
        if owns_concat:
            try:
                os.unlink(concat_path)
            except OSError:
                pass

    return output_path
