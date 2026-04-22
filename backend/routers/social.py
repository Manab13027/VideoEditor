"""Social media optimization router."""
from __future__ import annotations

import asyncio
import base64
from functools import partial
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import get_db
from backend.services.social_service import (
    extract_thumbnail,
    generate_hashtags,
    get_platform_limits,
    get_thumbnail_suggestions,
)

router = APIRouter(prefix="/api/social", tags=["social"])


class HashtagRequest(BaseModel):
    title: str
    description: str = ""
    platforms: list[str]
    api_key: Optional[str] = None


class MultiExportRequest(BaseModel):
    project_id: str
    platforms: list[str]


async def _fetch_media_path(media_id: int) -> str:
    """Look up stored_path for a media file by ID. Raises 404 if not found."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?",
            (media_id,),
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")
    return row["stored_path"]


@router.post("/hashtags")
async def hashtags_endpoint(body: HashtagRequest) -> dict:
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    if not body.platforms:
        raise HTTPException(status_code=422, detail="at least one platform is required")
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            None,
            partial(generate_hashtags, body.title, body.description, body.platforms, body.api_key),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"results": results}


@router.get("/limits")
async def limits_endpoint() -> dict:
    return get_platform_limits()


@router.get("/thumbnail/{media_id}/suggestions")
async def thumbnail_suggestions_endpoint(media_id: int) -> dict:
    video_path = await _fetch_media_path(media_id)
    loop = asyncio.get_event_loop()
    try:
        suggestions = await loop.run_in_executor(
            None, partial(get_thumbnail_suggestions, video_path),
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result = []
    for s in suggestions:
        with open(s["path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        result.append({"timestamp": s["timestamp"], "url": f"data:image/jpeg;base64,{b64}"})
    return {"suggestions": result}


@router.get("/thumbnail/{media_id}")
async def thumbnail_endpoint(
    media_id: int,
    timestamp: float = Query(...),
    overlay_text: Optional[str] = Query(None),
    preview: bool = Query(False),
) -> FileResponse:
    video_path = await _fetch_media_path(media_id)
    loop = asyncio.get_event_loop()
    try:
        output_path = await loop.run_in_executor(
            None,
            partial(extract_thumbnail, video_path, timestamp, overlay_text, preview),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    media_type = "image/jpeg" if preview else "image/png"
    ext = "jpg" if preview else "png"
    filename = f"thumbnail_{int(timestamp)}s.{ext}"
    return FileResponse(output_path, media_type=media_type, filename=filename)


@router.post("/multi-export")
async def multi_export_endpoint(body: MultiExportRequest) -> dict:
    from backend.services.export_service import SOCIAL_PRESETS
    from backend.routers.export import start_export
    from backend.models.job import ExportRequest

    if not body.platforms:
        raise HTTPException(status_code=422, detail="at least one platform required")
    for platform in body.platforms:
        if platform not in SOCIAL_PRESETS:
            raise HTTPException(status_code=422, detail=f"Unknown platform: {platform}")

    jobs = []
    for platform in body.platforms:
        request = ExportRequest(
            project_id=body.project_id,
            preset=platform,
            container="mp4",
            video_codec="libx264",
            audio_codec="aac",
            fps=30,
            upload_to_drive=False,
        )
        try:
            job = await start_export(request)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        jobs.append({"platform": platform, "job_id": job.id})
    return {"jobs": jobs}
