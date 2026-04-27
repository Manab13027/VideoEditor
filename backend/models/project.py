"""Pydantic models for project and timeline data."""
from __future__ import annotations

from typing import List, Optional

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


class AudioTrackData(BaseModel):
    """Represents one audio track in the timeline (music, voiceover, etc.)."""
    id: str
    type: str = "music"          # "music" | "voiceover" | "original"
    mediaId: str                  # frontend uses camelCase
    name: str = ""
    volume: float = 1.0
    offset: float = 0.0          # seconds from composition start
    muted: bool = False
    duration: Optional[float] = None  # seconds to play; None = full file
    waveform: List[float] = Field(default_factory=list)
    fade_in: float = 0.0         # seconds; 0 = no fade
    fade_out: float = 0.0        # seconds; 0 = no fade


class TimelineData(BaseModel):
    mode: str = "storyboard"  # "storyboard" | "multitrack"
    clips: list[ClipData] = Field(default_factory=list)
    overlays: list[OverlayData] = Field(default_factory=list)
    audioTracks: List[AudioTrackData] = Field(default_factory=list)
    muteOriginal: bool = False


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
