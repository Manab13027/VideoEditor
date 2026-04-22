"""Pydantic models for batch processing and export jobs."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class BatchOperation(BaseModel):
    type: str  # "convert"|"crop"|"watermark"|"trim"|"thumbnail"|"compress"
    target_format: Optional[str] = None
    codec: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    quality: Optional[str] = None
    watermark_path: Optional[str] = None
    watermark_position: Optional[str] = None
    watermark_opacity: Optional[float] = 0.5
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    thumbnail_timestamp: Optional[float] = 1.0
    thumbnail_format: Optional[str] = "jpg"


class BatchRequest(BaseModel):
    file_ids: List[str]
    operations: List[BatchOperation]
    output_dir: Optional[str] = None
    naming_pattern: str = "{original}_{operation}"


class BatchFileResult(BaseModel):
    file_id: str
    filename: str
    status: str = "pending"  # "pending"|"processing"|"completed"|"failed"
    progress: float = 0.0
    output_path: Optional[str] = None
    error: Optional[str] = None


class BatchJobResponse(BaseModel):
    id: str
    status: str
    progress: float
    results: List[BatchFileResult]
    created_at: str


class ExportRequest(BaseModel):
    project_id: str
    preset: Optional[str] = None
    container: str = "mp4"
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    width: Optional[int] = None
    height: Optional[int] = None
    bitrate: Optional[int] = None
    fps: int = 30
    quality_tier: Optional[str] = None
    output_dir: Optional[str] = None
    upload_to_drive: bool = False
    drive_folder_id: Optional[str] = None


class ExportJobResponse(BaseModel):
    id: str
    status: str
    progress: float
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: str
