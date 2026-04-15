"""Pydantic models for media files."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class MediaFileInfo(BaseModel):
    id: int
    project_id: Optional[int] = None
    filename: str
    media_type: str  # "video" | "image"
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_seconds: Optional[float] = None
    file_size_bytes: int
    proxy_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    created_at: str


class MediaProbeResult(BaseModel):
    width: int
    height: int
    duration_seconds: Optional[float] = None
    codec: str
    format: str
    file_size_bytes: int
