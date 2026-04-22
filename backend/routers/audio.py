"""Audio import and processing router."""
from __future__ import annotations

import uuid
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.services.audio_service import (
    compute_waveform,
    detect_beats,
    import_audio,
    sync_audio,
)
from backend.workers.task_runner import run_in_executor

router = APIRouter(prefix="/api/audio", tags=["audio"])


class SyncRequest(BaseModel):
    media_id: str
    target_duration: float


@router.post("/import")
async def audio_import(file: UploadFile, track_type: str = "music") -> dict:
    """Accept an audio file, normalise it, store it, return waveform + metadata."""
    if track_type not in ("music", "voiceover"):
        raise HTTPException(status_code=400, detail="track_type must be 'music' or 'voiceover'")

    audio_dir = settings.upload_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "").suffix or ".mp3"
    tmp_path = str(audio_dir / f"tmp_{uuid.uuid4().hex}{ext}")
    content = await file.read()
    Path(tmp_path).write_bytes(content)

    try:
        result = await run_in_executor(import_audio, tmp_path, track_type, str(audio_dir))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        try:
            Path(tmp_path).unlink()
        except OSError:
            pass

    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format, file_size_bytes, duration_seconds)
               VALUES (?, ?, ?, 'audio', ?, ?, ?)""",
            (
                result["filename"],
                result["filename"],
                result["stored_path"],
                ext.lstrip("."),
                len(content),
                result["duration"],
            ),
        )
        await db.commit()
        row_id = cursor.lastrowid
    finally:
        await db.close()

    return {
        "media_id": str(row_id),
        "filename": result["filename"],
        "waveform": result["waveform"],
        "duration": result["duration"],
        "track_type": track_type,
    }


@router.get("/waveform/{media_id}")
async def get_waveform(media_id: int) -> dict:
    """Return a 1000-sample waveform array for the given audio media file."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")

    waveform = await run_in_executor(compute_waveform, row["stored_path"], 1000)
    return {"waveform": waveform}


@router.post("/beats/{media_id}")
async def get_beats(media_id: int) -> dict:
    """Detect and return beat timestamps (in seconds) for the given audio file."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")

    beats = await run_in_executor(detect_beats, row["stored_path"])
    return {"beats": beats}


@router.post("/sync")
async def sync_audio_endpoint(body: SyncRequest) -> dict:
    """Stretch or compress audio to match a target duration."""
    import os

    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path, filename FROM media_files WHERE id = ?", (body.media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {body.media_id} not found")

    audio_dir = settings.upload_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(audio_dir / f"{uuid.uuid4().hex}_synced.mp3")

    try:
        await run_in_executor(sync_audio, row["stored_path"], out_path, body.target_duration)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    db2: aiosqlite.Connection = await get_db()
    try:
        cursor = await db2.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format, file_size_bytes)
               VALUES (?, ?, ?, 'audio', 'mp3', ?)""",
            (f"synced_{row['filename']}", row["filename"], out_path, os.path.getsize(out_path)),
        )
        await db2.commit()
        row_id = cursor.lastrowid
    finally:
        await db2.close()

    return {"output_media_id": str(row_id)}
