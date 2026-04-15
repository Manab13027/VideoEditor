"""Media upload and info router."""
from __future__ import annotations

import uuid
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, HTTPException, UploadFile

from backend.config import settings
from backend.database import get_db
from backend.models.media import MediaFileInfo

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

    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT INTO media_files
                (filename, original_path, stored_path, media_type, format, file_size_bytes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                original_filename,
                original_filename,
                str(dest_path),
                media_type,
                ext.lstrip(".") if ext else None,
                file_size,
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
