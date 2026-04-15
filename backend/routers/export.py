"""Export router."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict

import aiosqlite
from fastapi import APIRouter, HTTPException

from backend.database import get_db
from backend.models.job import ExportJobResponse, ExportRequest
from backend.services.export_service import build_export, resolve_export_settings

router = APIRouter(prefix="/api/export", tags=["export"])

# In-memory job tracking: job_id -> dict
_active_exports: Dict[str, dict] = {}


async def _run_export(job_id: str, project_id: str, output_path: str, export_settings: dict) -> None:
    """Background coroutine: run build_export and update job state."""
    try:
        await build_export(project_id, output_path, export_settings)
        _active_exports[job_id]["status"] = "completed"
        _active_exports[job_id]["progress"] = 1.0
        _active_exports[job_id]["output_path"] = output_path
        final_status = "completed"
        error_message = None
    except Exception as exc:
        _active_exports[job_id]["status"] = "failed"
        _active_exports[job_id]["error"] = str(exc)
        final_status = "failed"
        error_message = str(exc)

    # Persist result to DB
    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            """
            UPDATE jobs
               SET status = ?, progress = ?, result_json = ?, error_message = ?, updated_at = datetime('now')
             WHERE json_extract(config_json, '$.job_uuid') = ?
            """,
            (
                final_status,
                _active_exports[job_id]["progress"],
                json.dumps({"output_path": _active_exports[job_id].get("output_path")}),
                error_message,
                job_id,
            ),
        )
        await db.commit()
    finally:
        await db.close()


@router.post("", response_model=ExportJobResponse, status_code=200)
async def start_export(request: ExportRequest) -> ExportJobResponse:
    """Start an export job for a project."""
    export_settings = resolve_export_settings(
        preset=request.preset,
        quality_tier=request.quality_tier,
        width=request.width,
        height=request.height,
        bitrate=request.bitrate,
        fps=request.fps,
        codec=request.video_codec,
    )

    job_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    output_dir = request.output_dir or "data/exports"
    output_path = f"{output_dir}/{job_id}.{request.container}"

    _active_exports[job_id] = {
        "status": "processing",
        "progress": 0.0,
        "output_path": None,
        "error": None,
        "created_at": created_at,
    }

    # Persist job to DB — project_id may not exist (FK), store it only in config_json
    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO jobs (job_type, config_json, status, progress)
            VALUES ('export', ?, 'processing', 0.0)
            """,
            (
                json.dumps({
                    "job_uuid": job_id,
                    "project_id": request.project_id,
                    "output_path": output_path,
                    "export_settings": export_settings,
                }),
            ),
        )
        await db.commit()
    finally:
        await db.close()

    asyncio.create_task(
        _run_export(job_id, request.project_id, output_path, export_settings)
    )

    return ExportJobResponse(
        id=job_id,
        status="processing",
        progress=0.0,
        output_path=None,
        error=None,
        created_at=created_at,
    )


@router.get("/{job_id}/status", response_model=ExportJobResponse)
async def get_export_status(job_id: str) -> ExportJobResponse:
    """Get the current status of an export job."""
    if job_id in _active_exports:
        job = _active_exports[job_id]
        return ExportJobResponse(
            id=job_id,
            status=job["status"],
            progress=job["progress"],
            output_path=job.get("output_path"),
            error=job.get("error"),
            created_at=job["created_at"],
        )

    # Fall back to DB
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT * FROM jobs WHERE json_extract(config_json, '$.job_uuid') = ?",
            (job_id,),
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Export job {job_id} not found")

    result = json.loads(row["result_json"]) if row["result_json"] else {}
    return ExportJobResponse(
        id=job_id,
        status=row["status"],
        progress=row["progress"],
        output_path=result.get("output_path"),
        error=row["error_message"],
        created_at=row["created_at"],
    )
