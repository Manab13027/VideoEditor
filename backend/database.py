from __future__ import annotations

import aiosqlite

from backend.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    timeline_json TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_files (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    filename           TEXT    NOT NULL,
    original_path      TEXT    NOT NULL,
    stored_path        TEXT    NOT NULL,
    media_type         TEXT    NOT NULL,
    format             TEXT,
    width              INTEGER,
    height             INTEGER,
    duration_seconds   REAL,
    file_size_bytes    INTEGER,
    proxy_path         TEXT,
    thumbnail_path     TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type      TEXT    NOT NULL,
    project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    config_json   TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending',
    progress      REAL    NOT NULL DEFAULT 0.0,
    result_json   TEXT,
    error_message TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""


async def get_db() -> aiosqlite.Connection:
    """Return an aiosqlite connection with WAL mode and foreign keys enabled."""
    conn = await aiosqlite.connect(settings.db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    return conn


async def init_db() -> None:
    """Create all tables if they don't exist."""
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.executescript(SCHEMA)
        await conn.commit()
