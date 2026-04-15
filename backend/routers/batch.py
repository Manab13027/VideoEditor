"""Batch processing router."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict

import aiosqlite
from fastapi import APIRouter, HTTPException

from backend.database import get_db
from backend.models.job import BatchFileResult, BatchJobResponse, BatchRequest
from backend.services.batch_service import process_single_file
from backend.workers.task_runner import run_in_executor

router = APIRouter(prefix="/api/batch", tags=["batch"])

# In-memory job tracking: job_id -> BatchJobResponse dict
_active_jobs: Dict[str, dict] = {}


def _make_job_response(
    job_id: str,
    status: str,
    progress: float,
    results: list,
    created_at: str,
) -> BatchJobResponse:
    return BatchJobResponse(
        id=job_id,
        status=status,
        progress=progress,
        results=results,
        created_at=created_at,
    )


async def _run_batch(
    job_id: str,
    file_rows: list,
    operations: list,
    output_dir: str,
    naming_pattern: str,
) -> None:
    """Background coroutine: process each file and update job state."""
    total = len(file_rows)

    for idx, row in enumerate(file_rows):
        file_id = str(row["id"])

        # Mark file as processing
        for r in _active_jobs[job_id]["results"]:
            if r["file_id"] == file_id:
                r["status"] = "processing"
                break

        # Serialize operations for subprocess (BatchOperation → dict)
        ops_dicts = [op.model_dump() for op in operations]

        result = await run_in_executor(
            process_single_file,
            row["stored_path"],
            row["filename"],
            ops_dicts,
            output_dir,
            naming_pattern,
        )

        # Update in-memory result
        for r in _active_jobs[job_id]["results"]:
            if r["file_id"] == file_id:
                r["status"] = result["status"]
                r["output_path"] = result.get("output_path")
                r["error"] = result.get("error")
                r["progress"] = 1.0
                break

        completed = idx + 1
        _active_jobs[job_id]["progress"] = completed / total

    # Determine overall status
    all_results = _active_jobs[job_id]["results"]
    if all(r["status"] == "completed" for r in all_results):
        final_status = "completed"
    elif any(r["status"] == "failed" for r in all_results):
        final_status = "partial"
    else:
        final_status = "completed"

    _active_jobs[job_id]["status"] = final_status

    # Persist to DB (match by job_uuid stored in config_json)
    db: aiosqlite.Connection = await get_db()
    try:
        await db.execute(
            """
            UPDATE jobs
               SET status = ?, progress = ?, result_json = ?, updated_at = datetime('now')
             WHERE json_extract(config_json, '$.job_uuid') = ?
            """,
            (
                final_status,
                _active_jobs[job_id]["progress"],
                json.dumps(all_results),
                job_id,
            ),
        )
        await db.commit()
    finally:
        await db.close()


@router.post("", response_model=BatchJobResponse, status_code=202)
async def start_batch(request: BatchRequest) -> BatchJobResponse:
    """Start a batch processing job for a list of file IDs."""
    if not request.file_ids:
        raise HTTPException(status_code=400, detail="file_ids must not be empty")

    # Validate all file_ids exist
    db: aiosqlite.Connection = await get_db()
    try:
        file_rows = []
        for fid in request.file_ids:
            async with db.execute(
                "SELECT id, filename, stored_path FROM media_files WHERE id = ?", (fid,)
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"File {fid} not found")
            file_rows.append(row)
    finally:
        await db.close()

    job_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    output_dir = request.output_dir or "/tmp/batch_output"

    results = [
        {
            "file_id": str(row["id"]),
            "filename": row["filename"],
            "status": "pending",
            "progress": 0.0,
            "output_path": None,
            "error": None,
        }
        for row in file_rows
    ]

    _active_jobs[job_id] = {
        "status": "processing",
        "progress": 0.0,
        "results": results,
        "created_at": created_at,
    }

    # Persist job to DB (store uuid in config_json since PK is auto INTEGER)
    db2: aiosqlite.Connection = await get_db()
    try:
        await db2.execute(
            """
            INSERT INTO jobs (job_type, config_json, status, progress)
            VALUES ('batch', ?, 'processing', 0.0)
            """,
            (json.dumps({"job_uuid": job_id, "file_ids": request.file_ids, "output_dir": output_dir}),),
        )
        await db2.commit()
    finally:
        await db2.close()

    asyncio.create_task(
        _run_batch(
            job_id,
            file_rows,
            request.operations,
            output_dir,
            request.naming_pattern,
        )
    )

    return _make_job_response(
        job_id,
        "processing",
        0.0,
        [BatchFileResult(**r) for r in results],
        created_at,
    )


@router.get("/{job_id}/status", response_model=BatchJobResponse)
async def get_batch_status(job_id: str) -> BatchJobResponse:
    """Get the current status of a batch job."""
    if job_id in _active_jobs:
        job = _active_jobs[job_id]
        return _make_job_response(
            job_id,
            job["status"],
            job["progress"],
            [BatchFileResult(**r) for r in job["results"]],
            job["created_at"],
        )

    # Fall back to DB (match by job_uuid in config_json)
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
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    results_raw = json.loads(row["result_json"]) if row["result_json"] else []
    return _make_job_response(
        job_id,
        row["status"],
        row["progress"],
        [BatchFileResult(**r) for r in results_raw],
        row["created_at"],
    )
