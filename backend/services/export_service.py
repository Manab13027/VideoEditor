"""Export service — resolve settings and build final video from project timeline."""
from __future__ import annotations

import json
import os
import tempfile
from typing import Optional

from backend.database import get_db
from backend.services.ffmpeg_service import (
    concat_media,
    image_to_video,
    resize_video,
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
    bitrate: Optional[str] = None,
    fps: int = DEFAULT_FPS,
    codec: str = DEFAULT_CODEC,
) -> dict:
    """Resolve final export settings. Priority: preset > quality_tier > manual values."""
    # Start with manual/default values
    settings = {
        "width": width or 1280,
        "height": height or 720,
        "bitrate": bitrate or DEFAULT_BITRATE,
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
                "SELECT stored_path, media_type FROM media_files WHERE id = ?", (media_id,)
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
                # video: apply trim if specified
                trim_start = clip.get("trim_start", 0.0)
                trim_end = clip.get("trim_end")
                if trim_end is not None and trim_end > trim_start:
                    trim_video(stored_path, tmp_path, trim_start, trim_end)
                else:
                    # No trim — just copy via convert
                    import shutil
                    shutil.copy2(stored_path, tmp_path)

            processed_clips.append(tmp_path)

    finally:
        await db.close()

    try:
        # Concatenate all clips
        if len(processed_clips) == 1:
            concat_path = processed_clips[0]
            # Remove from tmp_files so we don't delete it before resize
            tmp_files = [f for f in tmp_files if f != concat_path]
            owns_concat = False
        else:
            concat_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            concat_tmp.close()
            concat_path = concat_tmp.name
            owns_concat = True
            concat_media(processed_clips, concat_path)

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
