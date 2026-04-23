"""Media upload and info router."""
from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.models.media import CropRequest, MediaFileInfo
from backend.services.ffmpeg_service import (
    concat_media, crop_video, probe_file, generate_proxy, generate_thumbnail, trim_video,
)
from backend.workers.task_runner import run_in_executor

router = APIRouter(prefix="/api/media", tags=["media"])


class MergeClipSpec(BaseModel):
    media_id: int
    trim_start: float = 0.0
    trim_end: Optional[float] = None


class MergeRequest(BaseModel):
    clips: List[MergeClipSpec]


def _get_media_type(filename: str) -> str:
    """Return 'video' or 'image' based on file extension.

    Raises ValueError for unsupported extensions.
    """
    ext = Path(filename).suffix.lower()
    if ext in settings.allowed_video_extensions:
        return "video"
    if ext in settings.allowed_image_extensions:
        return "image"
    raise ValueError(f"Unsupported file extension: {ext!r}")


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


@router.post("/upload", response_model=MediaFileInfo)
async def upload_media(file: UploadFile) -> MediaFileInfo:
    """Accept an uploaded media file, validate its format, persist it, and return metadata."""
    try:
        media_type = _get_media_type(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {exc}") from exc

    # Generate a unique filename to avoid collisions
    ext = Path(file.filename or "").suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = settings.upload_dir / unique_name

    # Ensure upload dir exists (lifespan may not have run in tests)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    dest_path.write_bytes(content)

    file_size = len(content)
    original_filename = file.filename or unique_name

    # Auto-probe video files for width/height/duration
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    if media_type == "video":
        try:
            probe = probe_file(str(dest_path))
            width = probe.width
            height = probe.height
            duration_seconds = probe.duration_seconds
        except Exception:
            pass  # probe is non-critical

    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT INTO media_files
                (filename, original_path, stored_path, media_type, format,
                 file_size_bytes, width, height, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                original_filename,
                original_filename,
                str(dest_path),
                media_type,
                ext.lstrip(".") if ext else None,
                file_size,
                width,
                height,
                duration_seconds,
            ),
        )
        await db.commit()
        row_id = cursor.lastrowid
    finally:
        await db.close()

    db2: aiosqlite.Connection = await get_db()
    try:
        async with db2.execute(
            "SELECT * FROM media_files WHERE id = ?", (row_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db2.close()

    if row is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve inserted media record")

    return _row_to_media_info(row)


@router.post("/{media_id}/crop", response_model=MediaFileInfo)
async def apply_crop(media_id: int, body: CropRequest) -> MediaFileInfo:
    """Crop a media file in-place. Crop values are percentages (0-100)."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media file {media_id} not found")

    src = row["stored_path"]
    orig_w: int = row["width"] or 1280
    orig_h: int = row["height"] or 720

    # Convert percentages → pixels (clamp to valid range)
    px = max(0, int(body.x / 100 * orig_w))
    py = max(0, int(body.y / 100 * orig_h))
    pw = max(1, min(int(body.w / 100 * orig_w), orig_w - px))
    ph = max(1, min(int(body.h / 100 * orig_h), orig_h - py))

    # Write to a new file alongside the original
    out_path = str(Path(src).with_stem(Path(src).stem + "_crop"))
    try:
        crop_video(src, out_path, px, py, pw, ph)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Update DB: new stored_path, dimensions, clear stale proxy/thumbnail
    db2: aiosqlite.Connection = await get_db()
    try:
        await db2.execute(
            """UPDATE media_files
               SET stored_path = ?, width = ?, height = ?,
                   proxy_path = NULL, thumbnail_path = NULL
             WHERE id = ?""",
            (out_path, pw, ph, media_id),
        )
        await db2.commit()
        async with db2.execute("SELECT * FROM media_files WHERE id = ?", (media_id,)) as cur:
            updated = await cur.fetchone()
    finally:
        await db2.close()

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated media record")
    return _row_to_media_info(updated)


@router.get("/{media_id}/download")
async def download_media(media_id: int) -> FileResponse:
    """Download the stored file for a media entry."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path, filename FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media file {media_id} not found")

    return FileResponse(
        row["stored_path"],
        filename=row["filename"],
        headers={"Content-Disposition": f'attachment; filename="{row["filename"]}"'},
    )


@router.get("/{media_id}/info", response_model=MediaFileInfo)
async def get_media_info(media_id: int) -> MediaFileInfo:
    """Fetch metadata for a media file by ID."""
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

    return _row_to_media_info(row)


@router.get("/{media_id}/proxy")
async def get_media_proxy(media_id: int) -> FileResponse:
    """Return or generate a proxy file for the given media."""
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

    stored_path = row["stored_path"]
    media_type = row["media_type"]

    # Images served directly
    if media_type == "image":
        return FileResponse(stored_path)

    # Return existing proxy if available
    existing_proxy = row["proxy_path"]
    if existing_proxy and Path(existing_proxy).exists():
        return FileResponse(existing_proxy)

    # Generate proxy
    settings.proxy_dir.mkdir(parents=True, exist_ok=True)
    proxy_path = str(settings.proxy_dir / f"{media_id}_proxy.mp4")
    try:
        generate_proxy(stored_path, proxy_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Proxy generation failed: {exc}") from exc

    # Update DB
    db3: aiosqlite.Connection = await get_db()
    try:
        await db3.execute(
            "UPDATE media_files SET proxy_path = ? WHERE id = ?",
            (proxy_path, media_id),
        )
        await db3.commit()
    finally:
        await db3.close()

    return FileResponse(proxy_path)


@router.get("/{media_id}/thumbnail")
async def get_media_thumbnail(media_id: int) -> FileResponse:
    """Return or generate a thumbnail for the given media."""
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

    stored_path = row["stored_path"]
    media_type = row["media_type"]

    # Return existing thumbnail if available
    existing_thumb = row["thumbnail_path"]
    if existing_thumb and Path(existing_thumb).exists():
        return FileResponse(existing_thumb)

    # Generate thumbnail
    settings.thumbnail_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = str(settings.thumbnail_dir / f"{media_id}_thumb.jpg")
    try:
        if media_type == "image":
            shutil.copy2(stored_path, thumb_path)
        else:
            generate_thumbnail(stored_path, thumb_path, timestamp=1.0)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {exc}") from exc

    # Update DB
    db3: aiosqlite.Connection = await get_db()
    try:
        await db3.execute(
            "UPDATE media_files SET thumbnail_path = ? WHERE id = ?",
            (thumb_path, media_id),
        )
        await db3.commit()
    finally:
        await db3.close()

    return FileResponse(thumb_path)


@router.post("/merge", response_model=MediaFileInfo)
async def merge_clips(body: MergeRequest) -> MediaFileInfo:
    """Trim and concatenate clips into a single new MediaFile."""
    if not body.clips:
        raise HTTPException(status_code=400, detail="clips list must not be empty")

    # Fetch stored paths for all clips
    db: aiosqlite.Connection = await get_db()
    try:
        rows = []
        for spec in body.clips:
            async with db.execute(
                "SELECT id, stored_path, media_type, duration_seconds FROM media_files WHERE id = ?",
                (spec.media_id,),
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"Media {spec.media_id} not found")
            rows.append((spec, row))
    finally:
        await db.close()

    def _build_merge() -> str:
        tmp_files: list[str] = []
        try:
            processed: list[str] = []
            for spec, row in rows:
                src = row["stored_path"]
                src_dur = row["duration_seconds"] or 9999
                trim_end = spec.trim_end if spec.trim_end is not None else src_dur
                if spec.trim_start > 0 or spec.trim_end is not None:
                    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                    tmp.close()
                    tmp_files.append(tmp.name)
                    trim_video(src, tmp.name, spec.trim_start, trim_end)
                    processed.append(tmp.name)
                else:
                    processed.append(src)

            settings.upload_dir.mkdir(parents=True, exist_ok=True)
            out_path = str(settings.upload_dir / f"{uuid.uuid4().hex}_merged.mp4")
            concat_media(processed, out_path)
            return out_path
        finally:
            for f in tmp_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass

    try:
        out_path = await run_in_executor(_build_merge)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Probe merged file
    try:
        probe = probe_file(out_path)
        w, h, dur = probe.width, probe.height, probe.duration_seconds
    except Exception:
        w, h, dur = None, None, None

    merged_name = f"merged_{uuid.uuid4().hex[:6]}.mp4"
    file_size = os.path.getsize(out_path)

    db2: aiosqlite.Connection = await get_db()
    try:
        cursor = await db2.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                file_size_bytes, width, height, duration_seconds)
               VALUES (?, ?, ?, 'video', 'mp4', ?, ?, ?, ?)""",
            (merged_name, merged_name, out_path, file_size, w, h, dur),
        )
        await db2.commit()
        row_id = cursor.lastrowid
        async with db2.execute("SELECT * FROM media_files WHERE id = ?", (row_id,)) as cur:
            new_row = await cur.fetchone()
    finally:
        await db2.close()

    if new_row is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve merged record")
    return _row_to_media_info(new_row)
