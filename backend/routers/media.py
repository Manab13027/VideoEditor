"""Media upload and info router."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.config import settings
from backend.database import get_db
from backend.models.media import MediaFileInfo
from backend.services.ffmpeg_service import probe_file, generate_proxy, generate_thumbnail

router = APIRouter(prefix="/api/media", tags=["media"])


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
