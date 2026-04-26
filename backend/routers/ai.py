"""AI-powered video processing router."""
from __future__ import annotations

import asyncio
import uuid
from functools import partial
from pathlib import Path
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.models.media import MediaFileInfo
from backend.services.ai_service import (
    auto_cut_silence,
    burn_subtitles,
    enhance_faces,
    generate_video_from_text,
    remove_background,
    smart_reframe,
    track_object,
    transcribe_video,
)
from backend.services.ffmpeg_service import generate_proxy

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class CaptionRequest(BaseModel):
    language: Optional[str] = None


class BurnCaptionRequest(BaseModel):
    style: str = "default"


class AutoCutRequest(BaseModel):
    threshold_db: float = -35.0
    min_duration: float = 0.5


class ReframeRequest(BaseModel):
    target_width: int = 1080
    target_height: int = 1920


class TrackRequest(BaseModel):
    bbox: list[int]  # [x, y, w, h]


class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 4
    api_token: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_media_info(row: aiosqlite.Row) -> MediaFileInfo:
    return MediaFileInfo(
        id=row["id"],
        project_id=row["project_id"],
        filename=row["filename"],
        media_type=row["media_type"],
        format=row["format"],
        width=row["width"],
        height=row["height"],
        duration_seconds=row["duration_seconds"],
        file_size_bytes=row["file_size_bytes"],
        proxy_path=row["proxy_path"],
        thumbnail_path=row["thumbnail_path"],
        created_at=row["created_at"],
    )


async def _fetch_media(media_id: int) -> aiosqlite.Row:
    """Fetch a media row by ID. Raises 404 if not found."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT * FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Media file {media_id} not found")
    return row


async def _run_in_executor(fn, *args, **kwargs):
    """Run a blocking function in the default thread-pool executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(fn, *args, **kwargs))


def _captions_dir() -> Path:
    d = settings.data_dir / "captions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _segments_to_srt(segments: list[dict]) -> str:
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
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/captions/{media_id}")
async def generate_captions(media_id: int, body: CaptionRequest) -> dict:
    """Transcribe audio, save SRT, return segments + srt_path."""
    row = await _fetch_media(media_id)
    video_path = row["stored_path"]

    try:
        segments = await _run_in_executor(
            transcribe_video, video_path, body.language
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    srt_text = _segments_to_srt(segments)
    srt_path = str(_captions_dir() / f"{media_id}.srt")
    Path(srt_path).write_text(srt_text, encoding="utf-8")

    return {"segments": segments, "srt_path": srt_path}


@router.post("/captions/{media_id}/burn", response_model=MediaFileInfo)
async def burn_captions(media_id: int, body: BurnCaptionRequest) -> MediaFileInfo:
    """Burn SRT subtitles into video, update proxy, return updated MediaFile."""
    row = await _fetch_media(media_id)
    video_path = row["stored_path"]

    srt_path = str(_captions_dir() / f"{media_id}.srt")
    if not Path(srt_path).exists():
        raise HTTPException(
            status_code=422,
            detail=f"No SRT found for media {media_id}. Generate captions first.",
        )

    stem = Path(video_path).stem
    ext = Path(video_path).suffix or ".mp4"
    output_path = str(Path(video_path).parent / f"{stem}_subtitled{ext}")

    try:
        await _run_in_executor(burn_subtitles, video_path, srt_path, output_path, body.style)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Regenerate proxy
    proxy_path = str(settings.proxy_dir / f"{media_id}_sub_proxy.mp4")
    settings.proxy_dir.mkdir(parents=True, exist_ok=True)
    try:
        await _run_in_executor(generate_proxy, output_path, proxy_path)
    except Exception:
        proxy_path = row["proxy_path"]  # keep old proxy on failure

    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            "UPDATE media_files SET stored_path = ?, proxy_path = ? WHERE id = ?",
            (output_path, proxy_path, media_id),
        )
        await db.commit()
        async with db.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            updated = await cur.fetchone()
    finally:
        await db.close()

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated record")
    return _row_to_media_info(updated)


@router.post("/remove-bg/{media_id}")
async def remove_background_endpoint(media_id: int) -> dict:
    """Remove background, save result as a new media record."""
    row = await _fetch_media(media_id)
    input_path = row["stored_path"]
    media_type: str = row["media_type"]

    ext = ".png" if media_type == "image" else ".webm"
    unique = uuid.uuid4().hex
    output_path = str(settings.upload_dir / f"{unique}_nobg{ext}")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    try:
        await _run_in_executor(remove_background, input_path, output_path, media_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    file_size = Path(output_path).stat().st_size
    filename = Path(output_path).name

    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                file_size_bytes, width, height, duration_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                filename, filename, output_path,
                media_type, ext.lstrip("."),
                file_size,
                row["width"], row["height"], row["duration_seconds"],
            ),
        )
        await db.commit()
        new_id = cursor.lastrowid
    finally:
        await db.close()

    return {"output_path": output_path, "media_id": new_id}


@router.post("/auto-cut/{media_id}")
async def auto_cut_endpoint(media_id: int, body: AutoCutRequest) -> dict:
    """Remove silent segments, return stats."""
    row = await _fetch_media(media_id)
    input_path = row["stored_path"]

    stem = Path(input_path).stem
    ext = Path(input_path).suffix or ".mp4"
    output_path = str(Path(input_path).parent / f"{stem}_autocut{ext}")

    try:
        result = await _run_in_executor(
            auto_cut_silence,
            input_path, output_path,
            body.threshold_db, body.min_duration,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "output_path": output_path,
        "segments_removed": result["segments_removed"],
        "time_saved": result["time_saved_seconds"],
    }


@router.post("/reframe/{media_id}", response_model=MediaFileInfo)
async def reframe_endpoint(media_id: int, body: ReframeRequest) -> MediaFileInfo:
    """Smart reframe to target resolution, return updated MediaFile."""
    row = await _fetch_media(media_id)
    input_path = row["stored_path"]

    stem = Path(input_path).stem
    ext = Path(input_path).suffix or ".mp4"
    output_path = str(Path(input_path).parent / f"{stem}_reframed{ext}")

    try:
        await _run_in_executor(
            smart_reframe,
            input_path, output_path,
            body.target_width, body.target_height,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Regenerate proxy
    proxy_path = str(settings.proxy_dir / f"{media_id}_reframe_proxy.mp4")
    settings.proxy_dir.mkdir(parents=True, exist_ok=True)
    try:
        await _run_in_executor(generate_proxy, output_path, proxy_path)
    except Exception:
        proxy_path = row["proxy_path"]

    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            """UPDATE media_files
               SET stored_path = ?, proxy_path = ?,
                   width = ?, height = ?
             WHERE id = ?""",
            (output_path, proxy_path, body.target_width, body.target_height, media_id),
        )
        await db.commit()
        async with db.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            updated = await cur.fetchone()
    finally:
        await db.close()

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated record")
    return _row_to_media_info(updated)


@router.post("/enhance/{media_id}", response_model=MediaFileInfo)
async def enhance_endpoint(media_id: int) -> MediaFileInfo:
    """Face enhancement, return updated MediaFile."""
    row = await _fetch_media(media_id)
    input_path = row["stored_path"]

    stem = Path(input_path).stem
    ext = Path(input_path).suffix or ".mp4"
    output_path = str(Path(input_path).parent / f"{stem}_enhanced{ext}")

    try:
        await _run_in_executor(enhance_faces, input_path, output_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Regenerate proxy
    proxy_path = str(settings.proxy_dir / f"{media_id}_enhanced_proxy.mp4")
    settings.proxy_dir.mkdir(parents=True, exist_ok=True)
    try:
        await _run_in_executor(generate_proxy, output_path, proxy_path)
    except Exception:
        proxy_path = row["proxy_path"]

    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            "UPDATE media_files SET stored_path = ?, proxy_path = ? WHERE id = ?",
            (output_path, proxy_path, media_id),
        )
        await db.commit()
        async with db.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            updated = await cur.fetchone()
    finally:
        await db.close()

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated record")
    return _row_to_media_info(updated)


@router.post("/track/{media_id}")
async def track_endpoint(media_id: int, body: TrackRequest) -> dict:
    """Track object through video, return frame-by-frame bbox data."""
    if len(body.bbox) != 4:
        raise HTTPException(status_code=422, detail="bbox must be [x, y, w, h]")

    row = await _fetch_media(media_id)
    video_path = row["stored_path"]

    try:
        tracks = await _run_in_executor(
            track_object, video_path, tuple(body.bbox)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"tracks": tracks}


@router.post("/generate")
async def generate_endpoint(body: GenerateRequest) -> dict:
    """Generate video from text prompt via Replicate (zeroscope-v2-xl)."""
    try:
        result = await _run_in_executor(
            generate_video_from_text,
            body.prompt, body.duration, body.api_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return result
