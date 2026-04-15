"""Project CRUD router."""
from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from starlette.responses import Response

from backend.database import get_db
from backend.models.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    TimelineData,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _row_to_response(row: aiosqlite.Row) -> ProjectResponse:
    timeline_raw = row["timeline_json"]
    if timeline_raw:
        timeline = TimelineData.model_validate(json.loads(timeline_raw))
    else:
        timeline = TimelineData()
    return ProjectResponse(
        id=row["id"],
        name=row["name"],
        timeline=timeline,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("", status_code=201, response_model=ProjectResponse)
async def create_project(payload: ProjectCreate) -> ProjectResponse:
    """Create a new project with an empty timeline."""
    timeline = TimelineData()
    timeline_json = timeline.model_dump_json()

    db: aiosqlite.Connection = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO projects (name, timeline_json) VALUES (?, ?)",
            (payload.name, timeline_json),
        )
        await db.commit()
        row_id = cursor.lastrowid
    finally:
        await db.close()

    db2: aiosqlite.Connection = await get_db()
    try:
        async with db2.execute("SELECT * FROM projects WHERE id = ?", (row_id,)) as cur:
            row = await cur.fetchone()
    finally:
        await db2.close()

    if row is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve created project")

    return _row_to_response(row)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int) -> ProjectResponse:
    """Fetch a project by ID."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

    return _row_to_response(row)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: int, payload: ProjectUpdate) -> ProjectResponse:
    """Update a project's name and/or timeline."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cur:
            row = await cur.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        new_name = payload.name if payload.name is not None else row["name"]
        if payload.timeline is not None:
            new_timeline_json = payload.timeline.model_dump_json()
        else:
            new_timeline_json = row["timeline_json"]

        await db.execute(
            """
            UPDATE projects
               SET name = ?, timeline_json = ?, updated_at = datetime('now')
             WHERE id = ?
            """,
            (new_name, new_timeline_json, project_id),
        )
        await db.commit()

        async with db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cur:
            updated_row = await cur.fetchone()
    finally:
        await db.close()

    return _row_to_response(updated_row)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int) -> Response:
    """Delete a project by ID."""
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)) as cur:
            row = await cur.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await db.commit()
    finally:
        await db.close()

    return Response(status_code=204)
