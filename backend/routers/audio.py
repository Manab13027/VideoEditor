"""Audio editing suite router."""
from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from asyncio import get_event_loop
from functools import partial
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.services.audio_service import detect_beats, extract_waveform, sync_audio_to_duration

router = APIRouter(prefix="/api/audio", tags=["audio"])


def _get_audio_ext(filename: str) -> str:
    """Return lowercase extension if it is an allowed audio format, else raise ValueError."""
    ext = Path(filename).suffix.lower()
    if ext not in settings.allowed_audio_extensions:
        raise ValueError(f"Unsupported audio format: {ext!r}")
    return ext


async def _fetch_audio_path(media_id: str) -> str:
    """Look up stored_path for an audio media file. Raises 404 if not found."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ? AND media_type = 'audio'",
            (media_id,),
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Audio media {media_id} not found")
    return row["stored_path"]


@router.post("/import")
async def import_audio(
    file: UploadFile,
    track_type: str = Form("music"),
) -> dict:
    """Accept an audio file upload, persist it, return waveform + metadata."""
    try:
        ext = _get_audio_ext(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = settings.audio_dir / unique_name

    content = await file.read()
    stored_path.write_bytes(content)

    loop = get_event_loop()
    try:
        waveform = await loop.run_in_executor(
            None, partial(extract_waveform, str(stored_path))
        )
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Failed to process audio: {exc}") from exc

    import ffmpeg as _ffmpeg
    try:
        info = _ffmpeg.probe(str(stored_path))
        duration = float(info["format"].get("duration", 0))
    except Exception:
        duration = 0.0

    file_size = stored_path.stat().st_size

    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                width, height, duration_seconds, file_size_bytes)
               VALUES (?, ?, ?, 'audio', ?, NULL, NULL, ?, ?)""",
            (
                file.filename,
                str(stored_path),
                str(stored_path),
                ext.lstrip("."),
                duration,
                file_size,
            ),
        ) as cur:
            media_id = cur.lastrowid
        await db.commit()
    finally:
        await db.close()

    return {
        "media_id": str(media_id),
        "filename": file.filename,
        "track_type": track_type,
        "waveform": waveform,
        "duration": duration,
    }


@router.get("/waveform/{media_id}")
async def get_waveform(media_id: str) -> dict:
    stored_path = await _fetch_audio_path(media_id)
    loop = get_event_loop()
    try:
        waveform = await loop.run_in_executor(
            None, partial(extract_waveform, stored_path)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"waveform": waveform}


@router.post("/beats/{media_id}")
async def get_beats(media_id: str) -> dict:
    stored_path = await _fetch_audio_path(media_id)
    loop = get_event_loop()
    try:
        beats = await loop.run_in_executor(
            None, partial(detect_beats, stored_path)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"beats": beats}


class SyncRequest(BaseModel):
    media_id: str
    target_duration: float


@router.post("/sync")
async def sync_audio(body: SyncRequest) -> dict:
    if body.target_duration <= 0:
        raise HTTPException(status_code=422, detail="target_duration must be positive")
    stored_path = await _fetch_audio_path(body.media_id)

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    output_path = tmp.name

    loop = get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            partial(sync_audio_to_duration, stored_path, output_path, body.target_duration),
        )
    except Exception as exc:
        os.unlink(output_path)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    unique_name = f"{uuid.uuid4().hex}.wav"
    dest = settings.audio_dir / unique_name
    shutil.move(output_path, str(dest))

    file_size = dest.stat().st_size
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            """INSERT INTO media_files
               (filename, original_path, stored_path, media_type, format,
                duration_seconds, file_size_bytes)
               VALUES (?, ?, ?, 'audio', 'wav', ?, ?)""",
            (unique_name, str(dest), str(dest), body.target_duration, file_size),
        ) as cur:
            new_media_id = cur.lastrowid
        await db.commit()
    finally:
        await db.close()

    return {"output_media_id": str(new_media_id)}
