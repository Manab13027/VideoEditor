"""Pydantic models for project and timeline data."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ClipData(BaseModel):
    id: str
    media_id: int
    type: str  # "video" | "image"
    trim_start: float = 0.0
    trim_end: Optional[float] = None
    crop: Optional[dict] = None
    speed: float = 1.0
    duration: Optional[float] = None
    order: int = 0


class OverlayData(BaseModel):
    media_id: int
    position: dict = Field(default_factory=lambda: {"x": 50, "y": 50})
    size: dict = Field(default_factory=lambda: {"w": 200, "h": 200})
    time_start: float = 0.0
    time_end: float = 5.0


class TimelineData(BaseModel):
    mode: str = "storyboard"  # "storyboard" | "multitrack"
    clips: list[ClipData] = Field(default_factory=list)
    overlays: list[OverlayData] = Field(default_factory=list)


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    timeline: Optional[TimelineData] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    timeline: TimelineData
    created_at: str
    updated_at: str
