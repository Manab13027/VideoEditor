# ClipForge Video Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid video editing app with React frontend + Python FastAPI backend + FFmpeg, supporting quick social-media edits and batch processing.

**Architecture:** Monolith FastAPI server serves REST + WebSocket APIs; FFmpeg handles all video/image processing via `ffmpeg-python`; React (Vite/TypeScript) frontend with three tab modes (Edit, Batch, Export); SQLite for project/job state; Zustand for frontend state management.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, ffmpeg-python, SQLite (aiosqlite), React 18, TypeScript, Vite, Zustand, Google Drive API

---

## Phase 1: Backend Foundation

### Task 1: Project Scaffolding & FastAPI Skeleton

**Files:**
- Create: `backend/main.py`
- Create: `backend/config.py`
- Create: `backend/database.py`
- Create: `backend/requirements.txt`
- Create: `backend/models/__init__.py`
- Create: `backend/routers/__init__.py`
- Create: `backend/services/__init__.py`
- Create: `backend/workers/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/test_health.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
ffmpeg-python==0.2.0
aiosqlite==0.20.0
python-multipart==0.0.9
websockets==12.0
google-api-python-client==2.130.0
google-auth-oauthlib==1.2.0
pydantic==2.7.0
pytest==8.2.0
httpx==0.27.0
pytest-asyncio==0.23.0
```

- [ ] **Step 2: Create config.py**

```python
from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "ClipForge"
    data_dir: Path = Path("data")
    upload_dir: Path = Path("data/uploads")
    proxy_dir: Path = Path("data/proxies")
    export_dir: Path = Path("data/exports")
    thumbnail_dir: Path = Path("data/thumbnails")
    db_path: Path = Path("data/clipforge.db")
    max_workers: int = 3
    proxy_resolution: str = "1280x720"
    allowed_video_extensions: set[str] = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv",
        ".wmv", ".mpeg", ".mpg", ".3gp", ".m4v", ".ts",
        ".vob", ".ogv", ".asf",
    }
    allowed_image_extensions: set[str] = {
        ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif",
        ".gif", ".webp", ".svg", ".ico", ".tga",
    }

    def ensure_dirs(self) -> None:
        for d in [self.upload_dir, self.proxy_dir, self.export_dir, self.thumbnail_dir]:
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
```

- [ ] **Step 3: Create database.py**

```python
import aiosqlite
from config import settings

DB_PATH = str(settings.db_path)

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timeline_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK(media_type IN ('video', 'image')),
    format TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds REAL,
    file_size_bytes INTEGER,
    proxy_path TEXT,
    thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK(job_type IN ('export', 'batch')),
    project_id TEXT,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    progress REAL NOT NULL DEFAULT 0.0,
    result_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    settings.ensure_dirs()
    db = await get_db()
    try:
        await db.executescript(SCHEMA)
        await db.commit()
    finally:
        await db.close()
```

- [ ] **Step 4: Create main.py**

```python
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
```

- [ ] **Step 5: Create empty __init__.py files**

Create empty files at:
- `backend/models/__init__.py`
- `backend/routers/__init__.py`
- `backend/services/__init__.py`
- `backend/workers/__init__.py`
- `tests/__init__.py`

- [ ] **Step 6: Write the health check test**

```python
# tests/test_health.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "ClipForge"
```

- [ ] **Step 7: Set up Python environment and run test**

```bash
cd /Users/fighter/VideoEditor
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && python -m pytest ../tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/ tests/
git commit -m "feat: scaffold FastAPI backend with health check, config, database"
```

---

### Task 2: Media Models & Upload Endpoint

**Files:**
- Create: `backend/models/media.py`
- Create: `backend/routers/media.py`
- Modify: `backend/main.py` (add router)
- Create: `tests/test_media_upload.py`

- [ ] **Step 1: Create media model**

```python
# backend/models/media.py
from pydantic import BaseModel
from typing import Optional


class MediaFileInfo(BaseModel):
    id: str
    project_id: Optional[str]
    filename: str
    media_type: str  # "video" or "image"
    format: str
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
```

- [ ] **Step 2: Write failing test for upload endpoint**

```python
# tests/test_media_upload.py
import pytest
import os
import tempfile
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_upload_media_file():
    # Create a tiny valid file for upload
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(b"\x00" * 1024)  # dummy bytes
        tmp_path = f.name

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with open(tmp_path, "rb") as upload_file:
                response = await client.post(
                    "/api/media/upload",
                    files={"file": ("test_video.mp4", upload_file, "video/mp4")},
                )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_video.mp4"
        assert data["media_type"] == "video"
        assert "id" in data
    finally:
        os.unlink(tmp_path)


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_format():
    with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
        f.write(b"\x00" * 100)
        tmp_path = f.name

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with open(tmp_path, "rb") as upload_file:
                response = await client.post(
                    "/api/media/upload",
                    files={"file": ("bad.xyz", upload_file, "application/octet-stream")},
                )
        assert response.status_code == 400
        assert "unsupported" in response.json()["detail"].lower()
    finally:
        os.unlink(tmp_path)
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_media_upload.py -v
```

Expected: FAIL — route not found (404)

- [ ] **Step 4: Create media router**

```python
# backend/routers/media.py
import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from config import settings
from database import get_db
from models.media import MediaFileInfo

router = APIRouter(prefix="/api/media", tags=["media"])


def _get_media_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in settings.allowed_video_extensions:
        return "video"
    if ext in settings.allowed_image_extensions:
        return "image"
    raise ValueError(f"Unsupported format: {ext}")


@router.post("/upload", response_model=MediaFileInfo)
async def upload_media(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        media_type = _get_media_type(file.filename)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {Path(file.filename).suffix}",
        )

    file_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower()
    stored_name = f"{file_id}{ext}"
    stored_path = settings.upload_dir / stored_name

    with open(stored_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_size = stored_path.stat().st_size
    now = datetime.now(timezone.utc).isoformat()

    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO media_files
               (id, project_id, filename, original_path, stored_path,
                media_type, format, file_size_bytes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (file_id, None, file.filename, file.filename, str(stored_path),
             media_type, ext.lstrip("."), file_size, now),
        )
        await db.commit()
    finally:
        await db.close()

    return MediaFileInfo(
        id=file_id,
        project_id=None,
        filename=file.filename,
        media_type=media_type,
        format=ext.lstrip("."),
        file_size_bytes=file_size,
        created_at=now,
    )


@router.get("/{media_id}/info", response_model=MediaFileInfo)
async def get_media_info(media_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM media_files WHERE id = ?", (media_id,)
        )
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Media file not found")

    return MediaFileInfo(
        id=row["id"],
        project_id=row["project_id"],
        filename=row["filename"],
        media_type=row["media_type"],
        format=row["format"],
        width=row["width"],
        height=row["height"],
        duration_seconds=row["duration_seconds"],
        file_size_bytes=row["file_size_bytes"],
        proxy_path=row["proxy_path"],
        thumbnail_path=row["thumbnail_path"],
        created_at=row["created_at"],
    )
```

- [ ] **Step 5: Register router in main.py**

Add to `backend/main.py` after the CORS middleware:

```python
from routers.media import router as media_router

app.include_router(media_router)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_media_upload.py -v
```

Expected: 2 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/models/media.py backend/routers/media.py backend/main.py tests/test_media_upload.py
git commit -m "feat: add media upload endpoint with format validation"
```

---

### Task 3: FFmpeg Probe Service

**Files:**
- Create: `backend/services/ffmpeg_service.py`
- Create: `tests/test_ffmpeg_service.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_ffmpeg_service.py
import pytest
import subprocess
import tempfile
import os


def _create_test_video(path: str, duration: float = 2.0):
    """Create a tiny real video file using FFmpeg for testing."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            f"color=c=red:s=320x240:d={duration}",
            "-c:v", "libx264", "-t", str(duration), path,
        ],
        capture_output=True,
        check=True,
    )


def test_probe_video():
    from backend.services.ffmpeg_service import probe_file

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name

    try:
        _create_test_video(tmp_path, duration=2.0)
        result = probe_file(tmp_path)
        assert result.width == 320
        assert result.height == 240
        assert result.duration_seconds is not None
        assert result.duration_seconds >= 1.5  # allow slight variance
        assert result.format == "h264"
    finally:
        os.unlink(tmp_path)


def test_probe_invalid_file():
    from backend.services.ffmpeg_service import probe_file

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(b"not a video")
        tmp_path = f.name

    try:
        with pytest.raises(ValueError, match="Failed to probe"):
            probe_file(tmp_path)
    finally:
        os.unlink(tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_ffmpeg_service.py -v
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ffmpeg_service.py**

```python
# backend/services/ffmpeg_service.py
import ffmpeg
from pathlib import Path
from models.media import MediaProbeResult


def probe_file(file_path: str) -> MediaProbeResult:
    """Probe a media file and return its metadata."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        info = ffmpeg.probe(file_path)
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to probe file: {e.stderr}")

    video_stream = next(
        (s for s in info.get("streams", []) if s["codec_type"] == "video"),
        None,
    )

    if video_stream is None:
        # Might be an image — check format
        fmt = info.get("format", {})
        raise ValueError(f"Failed to probe file: no video stream found")

    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    codec = video_stream.get("codec_name", "unknown")

    duration = None
    dur_str = video_stream.get("duration") or info.get("format", {}).get("duration")
    if dur_str:
        duration = float(dur_str)

    file_size = int(info.get("format", {}).get("size", path.stat().st_size))

    fmt_name = info.get("format", {}).get("format_name", "unknown")

    return MediaProbeResult(
        width=width,
        height=height,
        duration_seconds=duration,
        codec=codec,
        format=codec,  # use codec as format for video
        file_size_bytes=file_size,
    )


def generate_thumbnail(
    input_path: str, output_path: str, timestamp: float = 1.0
) -> str:
    """Extract a single frame as a thumbnail image."""
    try:
        (
            ffmpeg
            .input(input_path, ss=timestamp)
            .filter("scale", 320, -1)
            .output(output_path, vframes=1, f="image2")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to generate thumbnail: {e.stderr}")
    return output_path


def generate_proxy(input_path: str, output_path: str, resolution: str = "1280x720") -> str:
    """Generate a low-res H.264/MP4 proxy for browser playback."""
    w, h = resolution.split("x")
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("scale", int(w), int(h), force_original_aspect_ratio="decrease")
            .filter("pad", int(w), int(h), "(ow-iw)/2", "(oh-ih)/2")
            .output(output_path, vcodec="libx264", crf=28, preset="fast", acodec="aac", f="mp4")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to generate proxy: {e.stderr}")
    return output_path


def crop_video(
    input_path: str, output_path: str,
    x: int, y: int, w: int, h: int
) -> str:
    """Crop a video to the specified rectangle."""
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("crop", w, h, x, y)
            .output(output_path, vcodec="libx264", acodec="copy")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to crop video: {e.stderr}")
    return output_path


def trim_video(
    input_path: str, output_path: str,
    start_seconds: float, end_seconds: float
) -> str:
    """Trim a video to the specified time range."""
    duration = end_seconds - start_seconds
    try:
        (
            ffmpeg
            .input(input_path, ss=start_seconds, t=duration)
            .output(output_path, vcodec="libx264", acodec="copy")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to trim video: {e.stderr}")
    return output_path


def concat_media(input_paths: list[str], output_path: str) -> str:
    """Concatenate multiple video/image clips into one video."""
    if not input_paths:
        raise ValueError("No input files provided")

    inputs = [ffmpeg.input(p) for p in input_paths]

    try:
        (
            ffmpeg
            .concat(*inputs, v=1, a=1)
            .output(output_path, vcodec="libx264", acodec="aac")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to concatenate media: {e.stderr}")
    return output_path


def convert_format(
    input_path: str, output_path: str,
    codec: str = "libx264", audio_codec: str = "aac"
) -> str:
    """Convert a video to a different format/codec."""
    try:
        (
            ffmpeg
            .input(input_path)
            .output(output_path, vcodec=codec, acodec=audio_codec)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to convert: {e.stderr}")
    return output_path


def resize_video(input_path: str, output_path: str, width: int, height: int) -> str:
    """Resize a video to the specified resolution."""
    try:
        (
            ffmpeg
            .input(input_path)
            .filter("scale", width, height, force_original_aspect_ratio="decrease")
            .filter("pad", width, height, "(ow-iw)/2", "(oh-ih)/2")
            .output(output_path, vcodec="libx264", acodec="copy")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to resize video: {e.stderr}")
    return output_path


def add_watermark(
    input_path: str, watermark_path: str, output_path: str,
    x: str = "W-w-10", y: str = "H-h-10", opacity: float = 0.5
) -> str:
    """Overlay a watermark image on a video."""
    main = ffmpeg.input(input_path)
    watermark = ffmpeg.input(watermark_path)

    try:
        (
            ffmpeg
            .filter([main, watermark], "overlay", x, y,
                     format="auto", alpha="straight")
            .output(output_path, vcodec="libx264", acodec="copy")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to add watermark: {e.stderr}")
    return output_path


def compress_video(
    input_path: str, output_path: str, quality: str = "medium"
) -> str:
    """Compress a video at different quality levels."""
    crf_map = {"low": 35, "medium": 28, "high": 23}
    crf = crf_map.get(quality, 28)

    try:
        (
            ffmpeg
            .input(input_path)
            .output(output_path, vcodec="libx264", crf=crf, preset="medium", acodec="aac")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to compress video: {e.stderr}")
    return output_path


def image_to_video(
    image_path: str, output_path: str, duration: float = 3.0
) -> str:
    """Convert a still image to a video clip of the given duration."""
    try:
        (
            ffmpeg
            .input(image_path, loop=1, t=duration)
            .output(output_path, vcodec="libx264", pix_fmt="yuv420p",
                    t=duration, r=30)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        raise ValueError(f"Failed to convert image to video: {e.stderr}")
    return output_path
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_ffmpeg_service.py -v
```

Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/ffmpeg_service.py tests/test_ffmpeg_service.py
git commit -m "feat: add FFmpeg service with probe, thumbnail, proxy, crop, trim, concat, convert, resize, watermark, compress"
```

---

### Task 4: Project CRUD Endpoints

**Files:**
- Create: `backend/models/project.py`
- Create: `backend/routers/projects.py`
- Modify: `backend/main.py` (add router)
- Create: `tests/test_projects.py`

- [ ] **Step 1: Create project model**

```python
# backend/models/project.py
from pydantic import BaseModel
from typing import Optional


class ClipData(BaseModel):
    id: str
    media_id: str
    type: str  # "video" or "image"
    trim_start: float = 0.0
    trim_end: Optional[float] = None
    crop: Optional[dict] = None  # {"x": 0, "y": 0, "w": 1920, "h": 1080}
    speed: float = 1.0
    duration: Optional[float] = None  # for images
    order: int = 0


class OverlayData(BaseModel):
    media_id: str
    position: dict = {"x": 50, "y": 50}
    size: dict = {"w": 200, "h": 200}
    time_start: float = 0.0
    time_end: float = 5.0


class TimelineData(BaseModel):
    mode: str = "storyboard"  # "storyboard" or "multitrack"
    clips: list[ClipData] = []
    overlays: list[OverlayData] = []


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    timeline: Optional[TimelineData] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    timeline: TimelineData
    created_at: str
    updated_at: str
```

- [ ] **Step 2: Write failing test**

```python
# tests/test_projects.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_create_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/projects", json={"name": "Test Project"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Project"
    assert "id" in data
    assert data["timeline"]["mode"] == "storyboard"
    assert data["timeline"]["clips"] == []


@pytest.mark.asyncio
async def test_get_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post(
            "/api/projects", json={"name": "Get Test"}
        )
        project_id = create_resp.json()["id"]

        get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Get Test"


@pytest.mark.asyncio
async def test_get_nonexistent_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/projects/nonexistent-id")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_project_name():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post(
            "/api/projects", json={"name": "Original"}
        )
        project_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/projects/{project_id}",
            json={"name": "Updated Name"},
        )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_delete_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post(
            "/api/projects", json={"name": "To Delete"}
        )
        project_id = create_resp.json()["id"]

        del_resp = await client.delete(f"/api/projects/{project_id}")
        assert del_resp.status_code == 200

        get_resp = await client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_projects.py -v
```

Expected: FAIL — 404

- [ ] **Step 4: Create projects router**

```python
# backend/routers/projects.py
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from database import get_db
from models.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, TimelineData,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
async def create_project(data: ProjectCreate):
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    timeline = TimelineData()

    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO projects (id, name, timeline_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (project_id, data.name, timeline.model_dump_json(), now, now),
        )
        await db.commit()
    finally:
        await db.close()

    return ProjectResponse(
        id=project_id, name=data.name, timeline=timeline,
        created_at=now, updated_at=now,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        )
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    timeline = TimelineData(**json.loads(row["timeline_json"]))
    return ProjectResponse(
        id=row["id"], name=row["name"], timeline=timeline,
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        name = data.name if data.name is not None else row["name"]
        timeline_json = row["timeline_json"]
        if data.timeline is not None:
            timeline_json = data.timeline.model_dump_json()

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """UPDATE projects SET name = ?, timeline_json = ?, updated_at = ?
               WHERE id = ?""",
            (name, timeline_json, now, project_id),
        )
        await db.commit()

        timeline = TimelineData(**json.loads(timeline_json))
        return ProjectResponse(
            id=project_id, name=name, timeline=timeline,
            created_at=row["created_at"], updated_at=now,
        )
    finally:
        await db.close()


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM projects WHERE id = ?", (project_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")

        await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await db.commit()
    finally:
        await db.close()

    return {"status": "deleted", "id": project_id}
```

- [ ] **Step 5: Register router in main.py**

Add to `backend/main.py`:

```python
from routers.projects import router as projects_router

app.include_router(projects_router)
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_projects.py -v
```

Expected: 5 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/models/project.py backend/routers/projects.py backend/main.py tests/test_projects.py
git commit -m "feat: add project CRUD endpoints with timeline model"
```

---

### Task 5: Batch Processing Endpoint & Worker

**Files:**
- Create: `backend/models/job.py`
- Create: `backend/routers/batch.py`
- Create: `backend/services/batch_service.py`
- Create: `backend/workers/task_runner.py`
- Modify: `backend/main.py` (add router, start worker pool)
- Create: `tests/test_batch.py`

- [ ] **Step 1: Create job model**

```python
# backend/models/job.py
from pydantic import BaseModel
from typing import Optional


class BatchOperation(BaseModel):
    type: str  # "convert", "crop", "watermark", "trim", "thumbnail", "compress"
    target_format: Optional[str] = None
    codec: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    quality: Optional[str] = None  # "low", "medium", "high"
    watermark_path: Optional[str] = None
    watermark_position: Optional[str] = None  # e.g. "W-w-10"
    watermark_opacity: Optional[float] = 0.5
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    thumbnail_timestamp: Optional[float] = 1.0
    thumbnail_format: Optional[str] = "png"


class BatchRequest(BaseModel):
    file_ids: list[str]
    operations: list[BatchOperation]
    output_dir: Optional[str] = None
    naming_pattern: str = "{original}_{operation}"


class BatchFileResult(BaseModel):
    file_id: str
    filename: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: float = 0.0
    output_path: Optional[str] = None
    error: Optional[str] = None


class BatchJobResponse(BaseModel):
    id: str
    status: str
    progress: float
    results: list[BatchFileResult]
    created_at: str


class ExportRequest(BaseModel):
    project_id: str
    preset: Optional[str] = None  # "youtube", "instagram_reel", etc.
    container: str = "mp4"
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    width: Optional[int] = 1920
    height: Optional[int] = 1080
    bitrate: Optional[str] = "8M"
    fps: int = 30
    quality_tier: Optional[str] = None  # "sd", "hd", "fullhd", "4k"
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
```

- [ ] **Step 2: Create task runner**

```python
# backend/workers/task_runner.py
import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import Callable, Any

_executor: ProcessPoolExecutor | None = None


def get_executor(max_workers: int = 3) -> ProcessPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ProcessPoolExecutor(max_workers=max_workers)
    return _executor


async def run_in_executor(func: Callable, *args: Any) -> Any:
    """Run a blocking function in the process pool executor."""
    loop = asyncio.get_event_loop()
    executor = get_executor()
    return await loop.run_in_executor(executor, func, *args)


def shutdown_executor() -> None:
    global _executor
    if _executor:
        _executor.shutdown(wait=False)
        _executor = None
```

- [ ] **Step 3: Create batch service**

```python
# backend/services/batch_service.py
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from config import settings
from database import get_db
from models.job import BatchOperation, BatchFileResult
from services.ffmpeg_service import (
    convert_format, crop_video, resize_video,
    add_watermark, trim_video, generate_thumbnail,
    compress_video,
)


def _get_output_filename(
    original: str, operation_type: str, pattern: str, target_format: Optional[str] = None
) -> str:
    stem = Path(original).stem
    ext = target_format if target_format else Path(original).suffix.lstrip(".")
    name = pattern.replace("{original}", stem).replace("{operation}", operation_type)
    return f"{name}.{ext}"


def process_single_file(
    stored_path: str,
    filename: str,
    operations: list[dict],
    output_dir: str,
    naming_pattern: str,
) -> dict:
    """Process a single file through all operations. Runs in a separate process."""
    current_input = stored_path
    results = []

    for op_dict in operations:
        op = BatchOperation(**op_dict)
        out_name = _get_output_filename(
            filename, op.type, naming_pattern, op.target_format
        )
        out_path = str(Path(output_dir) / out_name)

        try:
            if op.type == "convert":
                codec = op.codec or "libx264"
                convert_format(current_input, out_path, codec=codec)
            elif op.type == "crop":
                if op.width and op.height:
                    resize_video(current_input, out_path, op.width, op.height)
                else:
                    resize_video(current_input, out_path, 1920, 1080)
            elif op.type == "watermark":
                if not op.watermark_path:
                    return {"status": "failed", "error": "No watermark image provided"}
                pos = op.watermark_position or "W-w-10"
                add_watermark(current_input, op.watermark_path, out_path, x=pos, y="H-h-10")
            elif op.type == "trim":
                start = op.trim_start or 0.0
                end = op.trim_end or 9999.0
                trim_video(current_input, out_path, start, end)
            elif op.type == "thumbnail":
                ts = op.thumbnail_timestamp or 1.0
                fmt = op.thumbnail_format or "png"
                out_path = str(Path(output_dir) / f"{Path(filename).stem}_thumb.{fmt}")
                generate_thumbnail(current_input, out_path, timestamp=ts)
            elif op.type == "compress":
                quality = op.quality or "medium"
                compress_video(current_input, out_path, quality=quality)
            else:
                return {"status": "failed", "error": f"Unknown operation: {op.type}"}

            current_input = out_path
            results.append({"operation": op.type, "output": out_path})
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    return {"status": "completed", "output_path": current_input, "details": results}
```

- [ ] **Step 4: Create batch router**

```python
# backend/routers/batch.py
import uuid
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException
from database import get_db
from config import settings
from models.job import BatchRequest, BatchJobResponse, BatchFileResult
from services.batch_service import process_single_file
from workers.task_runner import run_in_executor

router = APIRouter(prefix="/api/batch", tags=["batch"])

# In-memory job tracking (for WebSocket progress)
_active_jobs: dict[str, dict] = {}


@router.post("", response_model=BatchJobResponse)
async def start_batch_job(request: BatchRequest):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    output_dir = request.output_dir or str(settings.export_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Fetch file info from DB
    db = await get_db()
    try:
        files_info = []
        for file_id in request.file_ids:
            cursor = await db.execute(
                "SELECT * FROM media_files WHERE id = ?", (file_id,)
            )
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(
                    status_code=404, detail=f"Media file not found: {file_id}"
                )
            files_info.append(dict(row))

        # Store job in DB
        config = {
            "file_ids": request.file_ids,
            "operations": [op.model_dump() for op in request.operations],
            "output_dir": output_dir,
            "naming_pattern": request.naming_pattern,
        }
        await db.execute(
            """INSERT INTO jobs (id, job_type, config_json, status, created_at, updated_at)
               VALUES (?, 'batch', ?, 'processing', ?, ?)""",
            (job_id, json.dumps(config), now, now),
        )
        await db.commit()
    finally:
        await db.close()

    # Initialize results tracking
    results = [
        BatchFileResult(
            file_id=f["id"], filename=f["filename"], status="pending"
        )
        for f in files_info
    ]
    _active_jobs[job_id] = {"results": results, "status": "processing"}

    # Launch processing in background
    operations_dicts = [op.model_dump() for op in request.operations]

    async def process_all():
        for i, file_info in enumerate(files_info):
            _active_jobs[job_id]["results"][i].status = "processing"
            try:
                result = await run_in_executor(
                    process_single_file,
                    file_info["stored_path"],
                    file_info["filename"],
                    operations_dicts,
                    output_dir,
                    request.naming_pattern,
                )
                _active_jobs[job_id]["results"][i].status = result["status"]
                _active_jobs[job_id]["results"][i].output_path = result.get("output_path")
                _active_jobs[job_id]["results"][i].error = result.get("error")
            except Exception as e:
                _active_jobs[job_id]["results"][i].status = "failed"
                _active_jobs[job_id]["results"][i].error = str(e)

            _active_jobs[job_id]["results"][i].progress = 100.0

        _active_jobs[job_id]["status"] = "completed"

        # Update DB
        db2 = await get_db()
        try:
            now2 = datetime.now(timezone.utc).isoformat()
            result_json = json.dumps(
                [r.model_dump() for r in _active_jobs[job_id]["results"]]
            )
            await db2.execute(
                """UPDATE jobs SET status = 'completed', progress = 100.0,
                   result_json = ?, updated_at = ? WHERE id = ?""",
                (result_json, now2, job_id),
            )
            await db2.commit()
        finally:
            await db2.close()

    asyncio.create_task(process_all())

    return BatchJobResponse(
        id=job_id, status="processing", progress=0.0,
        results=results, created_at=now,
    )


@router.get("/{job_id}/status", response_model=BatchJobResponse)
async def get_batch_status(job_id: str):
    if job_id in _active_jobs:
        job = _active_jobs[job_id]
        completed = sum(1 for r in job["results"] if r.status in ("completed", "failed"))
        total = len(job["results"])
        progress = (completed / total * 100) if total > 0 else 0

        return BatchJobResponse(
            id=job_id,
            status=job["status"],
            progress=progress,
            results=job["results"],
            created_at="",
        )

    # Check DB
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    results = []
    if row["result_json"]:
        results = [BatchFileResult(**r) for r in json.loads(row["result_json"])]

    return BatchJobResponse(
        id=row["id"], status=row["status"], progress=row["progress"],
        results=results, created_at=row["created_at"],
    )
```

- [ ] **Step 5: Register batch router in main.py**

Add to `backend/main.py`:

```python
from routers.batch import router as batch_router

app.include_router(batch_router)
```

Also update the lifespan to shutdown executor:

```python
from workers.task_runner import shutdown_executor

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    yield
    shutdown_executor()
```

- [ ] **Step 6: Write batch test**

```python
# tests/test_batch.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app
import tempfile
import os


@pytest.mark.asyncio
async def test_start_batch_job_missing_files():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/batch", json={
            "file_ids": ["nonexistent"],
            "operations": [{"type": "compress", "quality": "medium"}],
        })
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_batch_status_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/batch/fake-id/status")
    assert response.status_code == 404
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_batch.py -v
```

Expected: 2 PASS

- [ ] **Step 8: Commit**

```bash
git add backend/models/job.py backend/routers/batch.py backend/services/batch_service.py backend/workers/task_runner.py backend/main.py tests/test_batch.py
git commit -m "feat: add batch processing endpoint with parallel FFmpeg worker"
```

---

### Task 6: Export Endpoint & Pipeline

**Files:**
- Create: `backend/services/export_service.py`
- Create: `backend/routers/export.py`
- Modify: `backend/main.py` (add router)
- Create: `tests/test_export.py`

- [ ] **Step 1: Create export service**

```python
# backend/services/export_service.py
import json
from pathlib import Path
from config import settings
from database import get_db
from models.project import TimelineData, ClipData
from services.ffmpeg_service import (
    trim_video, crop_video, image_to_video, concat_media, resize_video,
)


QUALITY_TIERS = {
    "sd": {"width": 854, "height": 480, "bitrate": "2M"},
    "hd": {"width": 1280, "height": 720, "bitrate": "5M"},
    "fullhd": {"width": 1920, "height": 1080, "bitrate": "8M"},
    "4k": {"width": 3840, "height": 2160, "bitrate": "20M"},
}

SOCIAL_PRESETS = {
    "youtube": {"width": 1920, "height": 1080, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "instagram_reel": {"width": 1080, "height": 1920, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "tiktok": {"width": 1080, "height": 1920, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "twitter": {"width": 1280, "height": 720, "fps": 30, "codec": "libx264", "bitrate": "5M"},
    "instagram_post": {"width": 1080, "height": 1080, "fps": 30, "codec": "libx264", "bitrate": "8M"},
    "whatsapp": {"width": 1280, "height": 720, "fps": 30, "codec": "libx264", "bitrate": "3M"},
}


def resolve_export_settings(
    preset: str | None,
    quality_tier: str | None,
    width: int | None,
    height: int | None,
    bitrate: str | None,
    fps: int,
    codec: str,
) -> dict:
    """Resolve final export settings from preset/tier/manual values."""
    if preset and preset in SOCIAL_PRESETS:
        return SOCIAL_PRESETS[preset]
    if quality_tier and quality_tier in QUALITY_TIERS:
        tier = QUALITY_TIERS[quality_tier]
        return {
            "width": tier["width"],
            "height": tier["height"],
            "bitrate": tier["bitrate"],
            "fps": fps,
            "codec": codec,
        }
    return {
        "width": width or 1920,
        "height": height or 1080,
        "bitrate": bitrate or "8M",
        "fps": fps,
        "codec": codec,
    }


async def build_export(
    project_id: str,
    output_path: str,
    export_settings: dict,
) -> str:
    """Build the final exported video from a project's timeline."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise ValueError(f"Project not found: {project_id}")

        timeline = TimelineData(**json.loads(row["timeline_json"]))

        if not timeline.clips:
            raise ValueError("Timeline has no clips to export")

        # Process each clip
        temp_clips: list[str] = []
        temp_dir = settings.export_dir / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)

        for i, clip in enumerate(sorted(timeline.clips, key=lambda c: c.order)):
            # Get the stored path for this media
            media_cursor = await db.execute(
                "SELECT stored_path, media_type FROM media_files WHERE id = ?",
                (clip.media_id,),
            )
            media_row = await media_cursor.fetchone()
            if not media_row:
                raise ValueError(f"Media not found: {clip.media_id}")

            source_path = media_row["stored_path"]
            media_type = media_row["media_type"]
            temp_output = str(temp_dir / f"clip_{i:04d}.mp4")

            if media_type == "image":
                duration = clip.duration or 3.0
                image_to_video(source_path, temp_output, duration=duration)
            else:
                # Apply trim if set
                if clip.trim_start > 0 or clip.trim_end is not None:
                    end = clip.trim_end or 9999.0
                    trim_video(source_path, temp_output, clip.trim_start, end)
                else:
                    # Just copy/re-encode for consistent format
                    import shutil
                    shutil.copy2(source_path, temp_output)

                # Apply crop if set
                if clip.crop:
                    cropped = str(temp_dir / f"clip_{i:04d}_cropped.mp4")
                    crop_video(
                        temp_output, cropped,
                        clip.crop["x"], clip.crop["y"],
                        clip.crop["w"], clip.crop["h"],
                    )
                    temp_output = cropped

            temp_clips.append(temp_output)

        # Concatenate all clips
        if len(temp_clips) == 1:
            import shutil
            shutil.copy2(temp_clips[0], output_path)
        else:
            concat_media(temp_clips, output_path)

        # Resize to target resolution
        final_w = export_settings["width"]
        final_h = export_settings["height"]
        resized_output = str(Path(output_path).with_suffix(".tmp.mp4"))
        resize_video(output_path, resized_output, final_w, final_h)

        import shutil
        shutil.move(resized_output, output_path)

        return output_path
    finally:
        await db.close()
```

- [ ] **Step 2: Create export router**

```python
# backend/routers/export.py
import uuid
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException
from database import get_db
from config import settings
from models.job import ExportRequest, ExportJobResponse
from services.export_service import resolve_export_settings, build_export

router = APIRouter(prefix="/api/export", tags=["export"])

_active_exports: dict[str, dict] = {}


@router.post("", response_model=ExportJobResponse)
async def start_export(request: ExportRequest):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    output_dir = request.output_dir or str(settings.export_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    export_settings = resolve_export_settings(
        preset=request.preset,
        quality_tier=request.quality_tier,
        width=request.width,
        height=request.height,
        bitrate=request.bitrate,
        fps=request.fps,
        codec=request.video_codec,
    )

    output_path = str(Path(output_dir) / f"export_{job_id}.{request.container}")

    # Store job
    db = await get_db()
    try:
        config = {
            "project_id": request.project_id,
            "export_settings": export_settings,
            "output_path": output_path,
            "upload_to_drive": request.upload_to_drive,
            "drive_folder_id": request.drive_folder_id,
        }
        await db.execute(
            """INSERT INTO jobs (id, job_type, project_id, config_json, status, created_at, updated_at)
               VALUES (?, 'export', ?, ?, 'processing', ?, ?)""",
            (job_id, request.project_id, json.dumps(config), now, now),
        )
        await db.commit()
    finally:
        await db.close()

    _active_exports[job_id] = {
        "status": "processing", "progress": 0.0,
        "output_path": None, "error": None,
    }

    async def do_export():
        try:
            result_path = await build_export(
                request.project_id, output_path, export_settings
            )
            _active_exports[job_id]["status"] = "completed"
            _active_exports[job_id]["progress"] = 100.0
            _active_exports[job_id]["output_path"] = result_path

            db2 = await get_db()
            try:
                now2 = datetime.now(timezone.utc).isoformat()
                await db2.execute(
                    """UPDATE jobs SET status = 'completed', progress = 100.0,
                       result_json = ?, updated_at = ? WHERE id = ?""",
                    (json.dumps({"output_path": result_path}), now2, job_id),
                )
                await db2.commit()
            finally:
                await db2.close()
        except Exception as e:
            _active_exports[job_id]["status"] = "failed"
            _active_exports[job_id]["error"] = str(e)

    asyncio.create_task(do_export())

    return ExportJobResponse(
        id=job_id, status="processing", progress=0.0, created_at=now,
    )


@router.get("/{job_id}/status", response_model=ExportJobResponse)
async def get_export_status(job_id: str):
    if job_id in _active_exports:
        job = _active_exports[job_id]
        return ExportJobResponse(
            id=job_id,
            status=job["status"],
            progress=job["progress"],
            output_path=job.get("output_path"),
            error=job.get("error"),
            created_at="",
        )

    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Export job not found")

    output_path = None
    if row["result_json"]:
        result = json.loads(row["result_json"])
        output_path = result.get("output_path")

    return ExportJobResponse(
        id=row["id"], status=row["status"], progress=row["progress"],
        output_path=output_path, error=row["error_message"],
        created_at=row["created_at"],
    )
```

- [ ] **Step 3: Register export router in main.py**

Add to `backend/main.py`:

```python
from routers.export import router as export_router

app.include_router(export_router)
```

- [ ] **Step 4: Write export test**

```python
# tests/test_export.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_export_nonexistent_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/export", json={
            "project_id": "nonexistent",
            "container": "mp4",
            "video_codec": "libx264",
            "fps": 30,
        })
    # Job is created but will fail async — check it's accepted
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert "id" in data


@pytest.mark.asyncio
async def test_export_status_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/export/fake-id/status")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_resolve_export_settings_preset():
    from backend.services.export_service import resolve_export_settings

    result = resolve_export_settings(
        preset="youtube", quality_tier=None,
        width=None, height=None, bitrate=None,
        fps=30, codec="libx264",
    )
    assert result["width"] == 1920
    assert result["height"] == 1080

    result_tiktok = resolve_export_settings(
        preset="tiktok", quality_tier=None,
        width=None, height=None, bitrate=None,
        fps=30, codec="libx264",
    )
    assert result_tiktok["width"] == 1080
    assert result_tiktok["height"] == 1920


@pytest.mark.asyncio
async def test_resolve_export_settings_quality_tier():
    from backend.services.export_service import resolve_export_settings

    result = resolve_export_settings(
        preset=None, quality_tier="hd",
        width=None, height=None, bitrate=None,
        fps=30, codec="libx264",
    )
    assert result["width"] == 1280
    assert result["height"] == 720
    assert result["bitrate"] == "5M"

    result_4k = resolve_export_settings(
        preset=None, quality_tier="4k",
        width=None, height=None, bitrate=None,
        fps=30, codec="libx264",
    )
    assert result_4k["width"] == 3840
    assert result_4k["height"] == 2160
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_export.py -v
```

Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/services/export_service.py backend/routers/export.py backend/main.py tests/test_export.py
git commit -m "feat: add export endpoint with quality tiers, social presets, and pipeline"
```

---

### Task 7: WebSocket Progress & Google Drive Upload

**Files:**
- Create: `backend/routers/websocket.py`
- Create: `backend/services/drive_service.py`
- Create: `backend/routers/drive.py`
- Modify: `backend/main.py` (add routers)

- [ ] **Step 1: Create WebSocket router**

```python
# backend/routers/websocket.py
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Registry of active connections per job
_connections: dict[str, list[WebSocket]] = {}


async def broadcast_progress(job_id: str, data: dict) -> None:
    """Send progress update to all WebSocket clients watching a job."""
    if job_id not in _connections:
        return
    message = json.dumps(data)
    dead = []
    for ws in _connections[job_id]:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections[job_id].remove(ws)


@router.websocket("/ws/progress/{job_id}")
async def progress_websocket(websocket: WebSocket, job_id: str):
    await websocket.accept()

    if job_id not in _connections:
        _connections[job_id] = []
    _connections[job_id].append(websocket)

    try:
        while True:
            # Keep connection alive — client can send pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        if job_id in _connections:
            _connections[job_id].remove(websocket)
            if not _connections[job_id]:
                del _connections[job_id]
```

- [ ] **Step 2: Create Google Drive service**

```python
# backend/services/drive_service.py
from pathlib import Path
from typing import Optional

# Google Drive integration
# Requires: google-api-python-client, google-auth-oauthlib
# OAuth credentials must be set up by the user

_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
_credentials = None
_token_path = Path("data/drive_token.json")
_credentials_path = Path("data/drive_credentials.json")


def is_drive_configured() -> bool:
    """Check if Google Drive credentials are available."""
    return _credentials_path.exists()


def get_auth_url() -> str:
    """Start OAuth flow and return the authorization URL."""
    from google_auth_oauthlib.flow import Flow

    if not _credentials_path.exists():
        raise ValueError(
            "Google Drive credentials not found. "
            "Place your OAuth credentials JSON at data/drive_credentials.json"
        )

    flow = Flow.from_client_secrets_file(
        str(_credentials_path),
        scopes=_SCOPES,
        redirect_uri="http://localhost:8000/api/drive/callback",
    )
    auth_url, _ = flow.authorization_url(prompt="consent")
    return auth_url


def complete_auth(auth_code: str) -> None:
    """Complete OAuth flow with the authorization code."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_secrets_file(
        str(_credentials_path),
        scopes=_SCOPES,
        redirect_uri="http://localhost:8000/api/drive/callback",
    )
    flow.fetch_token(code=auth_code)
    creds = flow.credentials

    _token_path.parent.mkdir(parents=True, exist_ok=True)
    with open(_token_path, "w") as f:
        f.write(creds.to_json())

    global _credentials
    _credentials = creds


def _get_credentials():
    """Load stored credentials."""
    global _credentials
    if _credentials and _credentials.valid:
        return _credentials

    if _token_path.exists():
        from google.oauth2.credentials import Credentials
        _credentials = Credentials.from_authorized_user_file(
            str(_token_path), _SCOPES
        )
        if _credentials and _credentials.valid:
            return _credentials

    raise ValueError("Not authenticated with Google Drive. Please authenticate first.")


def upload_to_drive(
    file_path: str,
    folder_id: Optional[str] = None,
    filename: Optional[str] = None,
) -> str:
    """Upload a file to Google Drive. Returns the file ID."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    creds = _get_credentials()
    service = build("drive", "v3", credentials=creds)

    file_metadata = {
        "name": filename or Path(file_path).name,
    }
    if folder_id:
        file_metadata["parents"] = [folder_id]

    media = MediaFileUpload(file_path, resumable=True)
    file = service.files().create(
        body=file_metadata, media_body=media, fields="id"
    ).execute()

    return file.get("id")
```

- [ ] **Step 3: Create Drive router**

```python
# backend/routers/drive.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from services.drive_service import (
    is_drive_configured, get_auth_url, complete_auth, upload_to_drive,
)
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/drive", tags=["drive"])


class DriveUploadRequest(BaseModel):
    file_path: str
    folder_id: Optional[str] = None
    filename: Optional[str] = None


class DriveStatusResponse(BaseModel):
    configured: bool
    authenticated: bool


@router.get("/status", response_model=DriveStatusResponse)
async def drive_status():
    configured = is_drive_configured()
    authenticated = False
    if configured:
        try:
            from services.drive_service import _get_credentials
            _get_credentials()
            authenticated = True
        except ValueError:
            authenticated = False

    return DriveStatusResponse(configured=configured, authenticated=authenticated)


@router.post("/auth")
async def start_auth():
    try:
        url = get_auth_url()
        return {"auth_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/callback")
async def auth_callback(code: str):
    try:
        complete_auth(code)
        return {"status": "authenticated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def upload_file(request: DriveUploadRequest):
    try:
        file_id = upload_to_drive(
            request.file_path,
            folder_id=request.folder_id,
            filename=request.filename,
        )
        return {"status": "uploaded", "drive_file_id": file_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
```

- [ ] **Step 4: Register routers in main.py**

Add to `backend/main.py`:

```python
from routers.websocket import router as ws_router
from routers.drive import router as drive_router

app.include_router(ws_router)
app.include_router(drive_router)
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/websocket.py backend/services/drive_service.py backend/routers/drive.py backend/main.py
git commit -m "feat: add WebSocket progress updates and Google Drive upload integration"
```

---

## Phase 2: React Frontend

### Task 8: React Project Scaffolding

**Files:**
- Create: `frontend/` (via Vite scaffolding)
- Modify: `frontend/package.json` (add deps)
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Scaffold React app with Vite**

```bash
cd /Users/fighter/VideoEditor
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install zustand axios react-icons react-dropzone
npm install -D @types/node
```

- [ ] **Step 2: Create TypeScript types**

```typescript
// frontend/src/types/index.ts

export interface MediaFile {
  id: string;
  project_id: string | null;
  filename: string;
  media_type: "video" | "image";
  format: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  proxy_path: string | null;
  thumbnail_path: string | null;
  created_at: string;
}

export interface Clip {
  id: string;
  media_id: string;
  type: "video" | "image";
  trim_start: number;
  trim_end: number | null;
  crop: { x: number; y: number; w: number; h: number } | null;
  speed: number;
  duration: number | null;
  order: number;
}

export interface Overlay {
  media_id: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  time_start: number;
  time_end: number;
}

export interface Timeline {
  mode: "storyboard" | "multitrack";
  clips: Clip[];
  overlays: Overlay[];
}

export interface Project {
  id: string;
  name: string;
  timeline: Timeline;
  created_at: string;
  updated_at: string;
}

export interface BatchOperation {
  type: "convert" | "crop" | "watermark" | "trim" | "thumbnail" | "compress";
  target_format?: string;
  codec?: string;
  width?: number;
  height?: number;
  quality?: "low" | "medium" | "high";
  watermark_path?: string;
  trim_start?: number;
  trim_end?: number;
  thumbnail_timestamp?: number;
  thumbnail_format?: string;
}

export interface BatchFileResult {
  file_id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  output_path: string | null;
  error: string | null;
}

export interface BatchJob {
  id: string;
  status: string;
  progress: number;
  results: BatchFileResult[];
  created_at: string;
}

export interface ExportSettings {
  project_id: string;
  preset?: string;
  container: string;
  video_codec: string;
  audio_codec: string;
  width?: number;
  height?: number;
  bitrate?: string;
  fps: number;
  quality_tier?: string;
  output_dir?: string;
  upload_to_drive: boolean;
  drive_folder_id?: string;
}

export interface ExportJob {
  id: string;
  status: string;
  progress: number;
  output_path: string | null;
  error: string | null;
  created_at: string;
}

export type TabMode = "edit" | "batch" | "export";
```

- [ ] **Step 3: Create API client**

```typescript
// frontend/src/api/client.ts
import axios from "axios";
import type {
  MediaFile, Project, BatchJob, ExportJob,
  BatchOperation, ExportSettings,
} from "../types";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

// Media
export async function uploadMedia(file: File): Promise<MediaFile> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<MediaFile>("/media/upload", formData);
  return data;
}

export async function getMediaInfo(id: string): Promise<MediaFile> {
  const { data } = await api.get<MediaFile>(`/media/${id}/info`);
  return data;
}

export function getMediaProxyUrl(id: string): string {
  return `http://localhost:8000/api/media/${id}/proxy`;
}

export function getMediaThumbnailUrl(id: string): string {
  return `http://localhost:8000/api/media/${id}/thumbnail`;
}

// Projects
export async function createProject(name: string): Promise<Project> {
  const { data } = await api.post<Project>("/projects", { name });
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/projects/${id}`);
  return data;
}

export async function updateProject(
  id: string,
  update: { name?: string; timeline?: Project["timeline"] }
): Promise<Project> {
  const { data } = await api.put<Project>(`/projects/${id}`, update);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

// Batch
export async function startBatchJob(
  fileIds: string[],
  operations: BatchOperation[],
  outputDir?: string,
): Promise<BatchJob> {
  const { data } = await api.post<BatchJob>("/batch", {
    file_ids: fileIds,
    operations,
    output_dir: outputDir,
  });
  return data;
}

export async function getBatchStatus(jobId: string): Promise<BatchJob> {
  const { data } = await api.get<BatchJob>(`/batch/${jobId}/status`);
  return data;
}

// Export
export async function startExport(settings: ExportSettings): Promise<ExportJob> {
  const { data } = await api.post<ExportJob>("/export", settings);
  return data;
}

export async function getExportStatus(jobId: string): Promise<ExportJob> {
  const { data } = await api.get<ExportJob>(`/export/${jobId}/status`);
  return data;
}

// Drive
export async function getDriveStatus(): Promise<{ configured: boolean; authenticated: boolean }> {
  const { data } = await api.get("/drive/status");
  return data;
}

export async function startDriveAuth(): Promise<{ auth_url: string }> {
  const { data } = await api.post("/drive/auth");
  return data;
}

export async function uploadToDrive(
  filePath: string,
  folderId?: string,
): Promise<{ drive_file_id: string }> {
  const { data } = await api.post("/drive/upload", {
    file_path: filePath,
    folder_id: folderId,
  });
  return data;
}

// WebSocket
export function connectProgressWS(
  jobId: string,
  onMessage: (data: unknown) => void,
): WebSocket {
  const ws = new WebSocket(`ws://localhost:8000/ws/progress/${jobId}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  return ws;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React frontend with TypeScript types and API client"
```

---

### Task 9: Zustand Stores

**Files:**
- Create: `frontend/src/stores/projectStore.ts`
- Create: `frontend/src/stores/timelineStore.ts`
- Create: `frontend/src/stores/batchStore.ts`

- [ ] **Step 1: Create project store**

```typescript
// frontend/src/stores/projectStore.ts
import { create } from "zustand";
import type { Project, MediaFile, TabMode } from "../types";
import { createProject, updateProject } from "../api/client";

interface ProjectState {
  activeTab: TabMode;
  project: Project | null;
  mediaFiles: MediaFile[];
  setActiveTab: (tab: TabMode) => void;
  initProject: (name: string) => Promise<void>;
  setProject: (project: Project) => void;
  addMediaFile: (file: MediaFile) => void;
  removeMediaFile: (id: string) => void;
  saveTimeline: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeTab: "edit",
  project: null,
  mediaFiles: [],

  setActiveTab: (tab) => set({ activeTab: tab }),

  initProject: async (name) => {
    const project = await createProject(name);
    set({ project });
  },

  setProject: (project) => set({ project }),

  addMediaFile: (file) =>
    set((state) => ({ mediaFiles: [...state.mediaFiles, file] })),

  removeMediaFile: (id) =>
    set((state) => ({
      mediaFiles: state.mediaFiles.filter((f) => f.id !== id),
    })),

  saveTimeline: async () => {
    const { project } = get();
    if (!project) return;
    const updated = await updateProject(project.id, {
      timeline: project.timeline,
    });
    set({ project: updated });
  },
}));
```

- [ ] **Step 2: Create timeline store**

```typescript
// frontend/src/stores/timelineStore.ts
import { create } from "zustand";
import type { Clip, Overlay } from "../types";

interface TimelineState {
  mode: "storyboard" | "multitrack";
  clips: Clip[];
  overlays: Overlay[];
  selectedClipId: string | null;
  setMode: (mode: "storyboard" | "multitrack") => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  reorderClips: (clips: Clip[]) => void;
  selectClip: (id: string | null) => void;
  addOverlay: (overlay: Overlay) => void;
  removeOverlay: (index: number) => void;
  clearTimeline: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  mode: "storyboard",
  clips: [],
  overlays: [],
  selectedClipId: null,

  setMode: (mode) => set({ mode }),

  addClip: (clip) =>
    set((state) => ({
      clips: [...state.clips, { ...clip, order: state.clips.length }],
    })),

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order: i })),
      selectedClipId:
        state.selectedClipId === id ? null : state.selectedClipId,
    })),

  updateClip: (id, updates) =>
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  reorderClips: (clips) =>
    set({ clips: clips.map((c, i) => ({ ...c, order: i })) }),

  selectClip: (id) => set({ selectedClipId: id }),

  addOverlay: (overlay) =>
    set((state) => ({ overlays: [...state.overlays, overlay] })),

  removeOverlay: (index) =>
    set((state) => ({
      overlays: state.overlays.filter((_, i) => i !== index),
    })),

  clearTimeline: () =>
    set({ clips: [], overlays: [], selectedClipId: null }),
}));
```

- [ ] **Step 3: Create batch store**

```typescript
// frontend/src/stores/batchStore.ts
import { create } from "zustand";
import type { MediaFile, BatchOperation, BatchJob } from "../types";

interface BatchState {
  files: MediaFile[];
  selectedFileIds: Set<string>;
  operations: BatchOperation[];
  activeJob: BatchJob | null;
  addFiles: (files: MediaFile[]) => void;
  removeFile: (id: string) => void;
  toggleFileSelection: (id: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;
  addOperation: (op: BatchOperation) => void;
  removeOperation: (index: number) => void;
  updateOperation: (index: number, op: BatchOperation) => void;
  setActiveJob: (job: BatchJob | null) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  files: [],
  selectedFileIds: new Set(),
  operations: [],
  activeJob: null,

  addFiles: (files) =>
    set((state) => {
      const newIds = new Set(state.selectedFileIds);
      files.forEach((f) => newIds.add(f.id));
      return {
        files: [...state.files, ...files],
        selectedFileIds: newIds,
      };
    }),

  removeFile: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedFileIds);
      newIds.delete(id);
      return {
        files: state.files.filter((f) => f.id !== id),
        selectedFileIds: newIds,
      };
    }),

  toggleFileSelection: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedFileIds);
      if (newIds.has(id)) newIds.delete(id);
      else newIds.add(id);
      return { selectedFileIds: newIds };
    }),

  selectAllFiles: () =>
    set((state) => ({
      selectedFileIds: new Set(state.files.map((f) => f.id)),
    })),

  deselectAllFiles: () => set({ selectedFileIds: new Set() }),

  addOperation: (op) =>
    set((state) => ({ operations: [...state.operations, op] })),

  removeOperation: (index) =>
    set((state) => ({
      operations: state.operations.filter((_, i) => i !== index),
    })),

  updateOperation: (index, op) =>
    set((state) => ({
      operations: state.operations.map((o, i) => (i === index ? op : o)),
    })),

  setActiveJob: (job) => set({ activeJob: job }),

  clearBatch: () =>
    set({
      files: [],
      selectedFileIds: new Set(),
      operations: [],
      activeJob: null,
    }),
}));
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/
git commit -m "feat: add Zustand stores for project, timeline, and batch state"
```

---

### Task 10: App Shell — TabBar & Panel Layout

**Files:**
- Create: `frontend/src/components/layout/TabBar.tsx`
- Create: `frontend/src/components/layout/PanelLayout.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create TabBar component**

```tsx
// frontend/src/components/layout/TabBar.tsx
import { useProjectStore } from "../../stores/projectStore";
import type { TabMode } from "../../types";

const tabs: { id: TabMode; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "batch", label: "Batch" },
  { id: "export", label: "Export" },
];

export function TabBar() {
  const { activeTab, setActiveTab } = useProjectStore();

  return (
    <header className="tab-bar">
      <div className="app-logo">🎬 ClipForge</div>
      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <button className="settings-btn" title="Settings">⚙</button>
    </header>
  );
}
```

- [ ] **Step 2: Create PanelLayout component**

```tsx
// frontend/src/components/layout/PanelLayout.tsx
import type { ReactNode } from "react";

interface PanelLayoutProps {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
}

export function PanelLayout({ left, center, right, bottom }: PanelLayoutProps) {
  return (
    <div className="panel-layout">
      <div className="panel-main">
        {left && <aside className="panel-left">{left}</aside>}
        <main className="panel-center">{center}</main>
        {right && <aside className="panel-right">{right}</aside>}
      </div>
      {bottom && <footer className="panel-bottom">{bottom}</footer>}
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx**

```tsx
// frontend/src/App.tsx
import { useEffect } from "react";
import { TabBar } from "./components/layout/TabBar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { useProjectStore } from "./stores/projectStore";

function EditMode() {
  return (
    <PanelLayout
      left={<div className="placeholder-panel">Media Browser</div>}
      center={<div className="placeholder-panel">Preview Player</div>}
      right={<div className="placeholder-panel">Properties</div>}
      bottom={<div className="placeholder-panel">Timeline</div>}
    />
  );
}

function BatchMode() {
  return (
    <PanelLayout
      left={<div className="placeholder-panel">File Queue</div>}
      center={<div className="placeholder-panel">Operation Config</div>}
      right={<div className="placeholder-panel">Progress</div>}
    />
  );
}

function ExportMode() {
  return (
    <PanelLayout
      left={<div className="placeholder-panel">Preview Summary</div>}
      center={<div className="placeholder-panel">Export Settings</div>}
    />
  );
}

export default function App() {
  const { activeTab, project, initProject } = useProjectStore();

  useEffect(() => {
    if (!project) {
      initProject("Untitled Project");
    }
  }, [project, initProject]);

  return (
    <div className="app">
      <TabBar />
      <div className="app-body">
        {activeTab === "edit" && <EditMode />}
        {activeTab === "batch" && <BatchMode />}
        {activeTab === "export" && <ExportMode />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write global CSS**

```css
/* frontend/src/index.css */
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --accent: #e94560;
  --accent-hover: #ff6b81;
  --purple: #533483;
  --success: #3fb950;
  --error: #f85149;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

#root {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  gap: 8px;
  flex-shrink: 0;
}

.app-logo {
  font-weight: bold;
  font-size: 16px;
  color: var(--accent);
  margin-right: 12px;
}

.tab-nav {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
  font-weight: 600;
}

.settings-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
}

.settings-btn:hover {
  color: var(--text-primary);
}

/* Panel Layout */
.app-body {
  flex: 1;
  overflow: hidden;
}

.panel-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.panel-left {
  width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-center {
  flex: 1;
  overflow: hidden;
}

.panel-right {
  width: 220px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-bottom {
  height: 140px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  overflow-x: auto;
  flex-shrink: 0;
}

.placeholder-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Shared */
.section-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 10px 4px;
}

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--accent);
  color: white;
  font-weight: 600;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: var(--border);
  color: var(--text-primary);
}

.progress-bar {
  height: 4px;
  background: var(--bg-primary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s;
}

.progress-bar-fill.complete {
  background: var(--success);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

- [ ] **Step 5: Verify the frontend runs**

```bash
cd /Users/fighter/VideoEditor/frontend && npm run dev
```

Expected: Vite dev server starts, opens at http://localhost:5173 with tab bar and placeholder panels.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/ frontend/src/App.tsx frontend/src/index.css
git commit -m "feat: add app shell with TabBar, PanelLayout, and dark theme CSS"
```

---

### Task 11: Shared Components — FileDropZone, VideoPlayer, ProgressBar

**Files:**
- Create: `frontend/src/components/shared/FileDropZone.tsx`
- Create: `frontend/src/components/shared/VideoPlayer.tsx`
- Create: `frontend/src/components/shared/ProgressBar.tsx`
- Create: `frontend/src/components/shared/AspectRatioSelector.tsx`

- [ ] **Step 1: Create FileDropZone**

```tsx
// frontend/src/components/shared/FileDropZone.tsx
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: Record<string, string[]>;
  label?: string;
  compact?: boolean;
}

export function FileDropZone({
  onFilesDropped,
  accept,
  label = "Drop files here or click to browse",
  compact = false,
}: FileDropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesDropped(acceptedFiles);
    },
    [onFilesDropped]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? "active" : ""} ${compact ? "compact" : ""}`}
      style={{
        border: `1px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        padding: compact ? "8px" : "20px",
        textAlign: "center",
        cursor: "pointer",
        background: isDragActive ? "rgba(233,69,96,0.1)" : "transparent",
        transition: "all 0.15s",
      }}
    >
      <input {...getInputProps()} />
      <p style={{ color: "var(--text-secondary)", fontSize: compact ? 11 : 13 }}>
        {isDragActive ? "Drop files here..." : label}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create VideoPlayer**

```tsx
// frontend/src/components/shared/VideoPlayer.tsx
import { useRef, useState, useEffect } from "react";

interface VideoPlayerProps {
  src: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function VideoPlayer({ src, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    onTimeUpdate?.(video.currentTime, video.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => setDuration(video.duration);
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [src]);

  return (
    <div className="video-player">
      <div className="video-container" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {!isPlaying && (
          <div className="play-overlay">
            <span style={{ fontSize: 48, color: "var(--accent)" }}>▶</span>
          </div>
        )}
      </div>
      <div className="player-controls">
        <button className="btn-secondary btn" onClick={togglePlay}>
          {isPlaying ? "⏸" : "▶"}
        </button>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 80 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProgressBar**

```tsx
// frontend/src/components/shared/ProgressBar.tsx
interface ProgressBarProps {
  progress: number; // 0-100
  status?: "processing" | "completed" | "failed";
  label?: string;
}

export function ProgressBar({ progress, status, label }: ProgressBarProps) {
  const barClass =
    status === "completed" ? "complete" : status === "failed" ? "error" : "";

  return (
    <div>
      {label && (
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginBottom: 3, fontSize: 9,
        }}>
          <span style={{ color: "var(--text-primary)" }}>{label}</span>
          <span style={{
            color: status === "completed" ? "var(--success)"
              : status === "failed" ? "var(--error)"
              : "var(--text-secondary)",
          }}>
            {status === "completed" ? "✓" : status === "failed" ? "✗" : `${Math.round(progress)}%`}
          </span>
        </div>
      )}
      <div className="progress-bar">
        <div
          className={`progress-bar-fill ${barClass}`}
          style={{
            width: `${Math.min(progress, 100)}%`,
            background: status === "failed" ? "var(--error)" : undefined,
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create AspectRatioSelector**

```tsx
// frontend/src/components/shared/AspectRatioSelector.tsx
interface AspectRatioSelectorProps {
  value: string;
  onChange: (ratio: string) => void;
}

const RATIOS = ["16:9", "9:16", "1:1", "4:3", "Free"];

export function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {RATIOS.map((ratio) => (
        <button
          key={ratio}
          className={`btn ${value === ratio ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: 10, padding: "3px 8px" }}
          onClick={() => onChange(ratio)}
        >
          {ratio}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/
git commit -m "feat: add shared components — FileDropZone, VideoPlayer, ProgressBar, AspectRatioSelector"
```

---

### Task 12: Edit Mode — MediaBrowser Component

**Files:**
- Create: `frontend/src/components/edit/MediaBrowser.tsx`

- [ ] **Step 1: Create MediaBrowser**

```tsx
// frontend/src/components/edit/MediaBrowser.tsx
import { useState } from "react";
import { FileDropZone } from "../shared/FileDropZone";
import { useProjectStore } from "../../stores/projectStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { uploadMedia } from "../../api/client";
import type { MediaFile } from "../../types";

type FilterType = "all" | "video" | "image";

export function MediaBrowser() {
  const { mediaFiles, addMediaFile } = useProjectStore();
  const { addClip } = useTimelineStore();
  const [filter, setFilter] = useState<FilterType>("all");
  const [uploading, setUploading] = useState(false);

  const filteredFiles = mediaFiles.filter((f) =>
    filter === "all" ? true : f.media_type === filter
  );

  const handleFilesDropped = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      try {
        const mediaFile = await uploadMedia(file);
        addMediaFile(mediaFile);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setUploading(false);
  };

  const handleAddToTimeline = (file: MediaFile) => {
    addClip({
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      media_id: file.id,
      type: file.media_type as "video" | "image",
      trim_start: 0,
      trim_end: file.duration_seconds,
      crop: null,
      speed: 1.0,
      duration: file.media_type === "image" ? 3.0 : file.duration_seconds,
      order: 0,
    });
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="section-label">Media Files</div>

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["all", "video", "image"] as FilterType[]).map((f) => (
          <button
            key={f}
            className={`btn ${filter === f ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: 10, padding: "3px 8px", textTransform: "capitalize" }}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {filteredFiles.map((file) => (
          <div
            key={file.id}
            style={{
              background: "var(--bg-tertiary)",
              borderRadius: 4,
              padding: 6,
              cursor: "pointer",
            }}
            onClick={() => handleAddToTimeline(file)}
            title="Click to add to timeline"
          >
            <div style={{
              height: 50,
              background: "var(--bg-primary)",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: file.media_type === "video" ? "var(--accent)" : "var(--purple)",
            }}>
              {file.media_type === "video" ? "🎥" : "🖼"}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-primary)", marginTop: 3 }}>
              {file.filename}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
              {file.media_type === "video" && file.duration_seconds
                ? `${formatDuration(file.duration_seconds)} · `
                : ""}
              {file.width && file.height ? `${file.width}×${file.height} · ` : ""}
              {formatSize(file.file_size_bytes)}
            </div>
          </div>
        ))}

        {uploading && (
          <div style={{ textAlign: "center", padding: 8, fontSize: 11, color: "var(--text-secondary)" }}>
            Uploading...
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <FileDropZone
          onFilesDropped={handleFilesDropped}
          label="+ Drop files"
          compact
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/edit/MediaBrowser.tsx
git commit -m "feat: add MediaBrowser component with upload, filter, and add-to-timeline"
```

---

### Task 13: Edit Mode — PreviewPlayer & PropertiesPanel

**Files:**
- Create: `frontend/src/components/edit/PreviewPlayer.tsx`
- Create: `frontend/src/components/edit/PropertiesPanel.tsx`

- [ ] **Step 1: Create PreviewPlayer**

```tsx
// frontend/src/components/edit/PreviewPlayer.tsx
import { VideoPlayer } from "../shared/VideoPlayer";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { getMediaProxyUrl } from "../../api/client";

export function PreviewPlayer() {
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const mediaFile = selectedClip
    ? mediaFiles.find((m) => m.id === selectedClip.media_id)
    : null;

  if (!selectedClip || !mediaFile) {
    return (
      <div style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
        color: "var(--text-secondary)",
      }}>
        <span style={{ fontSize: 48, color: "var(--accent)" }}>▶</span>
        <span style={{ fontSize: 13 }}>Select a clip to preview</span>
      </div>
    );
  }

  if (mediaFile.media_type === "image") {
    return (
      <div style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
      }}>
        <img
          src={getMediaProxyUrl(mediaFile.id)}
          alt={mediaFile.filename}
          style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain" }}
        />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, background: "var(--bg-primary)" }}>
        <VideoPlayer src={getMediaProxyUrl(mediaFile.id)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PropertiesPanel**

```tsx
// frontend/src/components/edit/PropertiesPanel.tsx
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { AspectRatioSelector } from "../shared/AspectRatioSelector";
import { useState } from "react";

export function PropertiesPanel() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const [aspectRatio, setAspectRatio] = useState("16:9");

  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const mediaFile = selectedClip
    ? mediaFiles.find((m) => m.id === selectedClip.media_id)
    : null;

  if (!selectedClip) {
    return (
      <div style={{ padding: 10, color: "var(--text-secondary)", fontSize: 12 }}>
        Select a clip to edit properties
      </div>
    );
  }

  const crop = selectedClip.crop || { x: 0, y: 0, w: mediaFile?.width || 1920, h: mediaFile?.height || 1080 };

  const handleCropChange = (field: string, value: number) => {
    updateClip(selectedClip.id, {
      crop: { ...crop, [field]: value },
    });
  };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-label">Properties</div>

      {/* Crop */}
      <div>
        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
          CROP
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {(["x", "y", "w", "h"] as const).map((field) => (
            <div key={field} style={{
              background: "var(--bg-tertiary)", borderRadius: 3, padding: "4px 6px",
            }}>
              <label style={{ fontSize: 8, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                {field}
              </label>
              <input
                type="number"
                value={crop[field]}
                onChange={(e) => handleCropChange(field, parseInt(e.target.value) || 0)}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  color: "var(--text-primary)", fontSize: 11, outline: "none",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
          ASPECT RATIO
        </div>
        <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
      </div>

      {/* Trim */}
      {selectedClip.type === "video" && (
        <div>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
            TRIM
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ background: "var(--bg-tertiary)", borderRadius: 3, padding: "4px 6px" }}>
              <label style={{ fontSize: 8, color: "var(--text-secondary)" }}>START</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedClip.trim_start}
                onChange={(e) => updateClip(selectedClip.id, { trim_start: parseFloat(e.target.value) || 0 })}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  color: "var(--text-primary)", fontSize: 11, outline: "none",
                }}
              />
            </div>
            <div style={{ background: "var(--bg-tertiary)", borderRadius: 3, padding: "4px 6px" }}>
              <label style={{ fontSize: 8, color: "var(--text-secondary)" }}>END</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedClip.trim_end ?? ""}
                onChange={(e) => updateClip(selectedClip.id, {
                  trim_end: e.target.value ? parseFloat(e.target.value) : null,
                })}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  color: "var(--text-primary)", fontSize: 11, outline: "none",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Speed */}
      {selectedClip.type === "video" && (
        <div>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
            SPEED
          </div>
          <select
            value={selectedClip.speed}
            onChange={(e) => updateClip(selectedClip.id, { speed: parseFloat(e.target.value) })}
            style={{
              width: "100%", background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              borderRadius: 3, padding: "4px 6px", color: "var(--text-primary)", fontSize: 11,
            }}
          >
            {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 4.0].map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>
      )}

      {/* Image duration */}
      {selectedClip.type === "image" && (
        <div>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
            DURATION (seconds)
          </div>
          <input
            type="number"
            step={0.5}
            min={0.5}
            value={selectedClip.duration ?? 3}
            onChange={(e) => updateClip(selectedClip.id, { duration: parseFloat(e.target.value) || 3 })}
            style={{
              width: "100%", background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              borderRadius: 3, padding: "4px 6px", color: "var(--text-primary)", fontSize: 11,
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/edit/PreviewPlayer.tsx frontend/src/components/edit/PropertiesPanel.tsx
git commit -m "feat: add PreviewPlayer and PropertiesPanel for Edit mode"
```

---

### Task 14: Edit Mode — Storyboard & Timeline

**Files:**
- Create: `frontend/src/components/edit/Storyboard.tsx`
- Create: `frontend/src/components/edit/Timeline.tsx`

- [ ] **Step 1: Create Storyboard**

```tsx
// frontend/src/components/edit/Storyboard.tsx
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";

export function Storyboard() {
  const { clips, selectedClipId, selectClip, removeClip, reorderClips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const sortedClips = [...clips].sort((a, b) => a.order - b.order);

  const handleDragStart = (e: React.DragEvent, clipId: string) => {
    e.dataTransfer.setData("clipId", clipId);
  };

  const handleDrop = (e: React.DragEvent, targetOrder: number) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("clipId");
    const newClips = [...sortedClips];
    const draggedIndex = newClips.findIndex((c) => c.id === draggedId);
    if (draggedIndex === -1) return;

    const [dragged] = newClips.splice(draggedIndex, 1);
    newClips.splice(targetOrder, 0, dragged);
    reorderClips(newClips);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div style={{ display: "flex", gap: 6, padding: "4px 0", alignItems: "center" }}>
      {sortedClips.map((clip, index) => {
        const media = mediaFiles.find((m) => m.id === clip.media_id);
        const isSelected = clip.id === selectedClipId;

        return (
          <div
            key={clip.id}
            draggable
            onDragStart={(e) => handleDragStart(e, clip.id)}
            onDrop={(e) => handleDrop(e, index)}
            onDragOver={handleDragOver}
            onClick={() => selectClip(clip.id)}
            onDoubleClick={() => removeClip(clip.id)}
            title={`${media?.filename || "Unknown"} — double-click to remove`}
            style={{
              minWidth: 70,
              height: 45,
              background: clip.type === "video"
                ? `rgba(233,69,96,${isSelected ? 0.9 : 0.6})`
                : `rgba(83,52,131,${isSelected ? 0.9 : 0.6})`,
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              border: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12 }}>
              {clip.type === "video" ? "🎥" : "🖼"}
            </span>
            <span style={{ fontSize: 8, color: "#fff", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {media?.filename || "?"}
            </span>
          </div>
        );
      })}

      {/* Add button */}
      <div
        style={{
          width: 45,
          height: 45,
          background: "var(--bg-tertiary)",
          borderRadius: 4,
          border: "1px dashed var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: "var(--text-secondary)",
          cursor: "default",
          flexShrink: 0,
        }}
        title="Drag media from the browser to add"
      >
        +
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Timeline wrapper**

```tsx
// frontend/src/components/edit/Timeline.tsx
import { useTimelineStore } from "../../stores/timelineStore";
import { Storyboard } from "./Storyboard";

export function Timeline() {
  const { mode, setMode } = useTimelineStore();

  return (
    <div style={{ padding: 8, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="section-label" style={{ padding: 0 }}>Timeline</span>
          <div style={{ display: "flex", gap: 2 }}>
            <button
              className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: 9, padding: "2px 8px" }}
              onClick={() => setMode("storyboard")}
            >
              Storyboard
            </button>
            <button
              className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: 9, padding: "2px 8px" }}
              onClick={() => setMode("multitrack")}
            >
              Multi-track
            </button>
          </div>
        </div>
      </div>

      {mode === "storyboard" ? (
        <Storyboard />
      ) : (
        <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 10 }}>
          Multi-track timeline — drag clips to video/image/audio tracks.
          <div style={{ marginTop: 8 }}>
            <div style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 10 }}>
              🎥 Video Track
            </div>
            <div style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 10 }}>
              🖼 Image Overlay Track
            </div>
            <div style={{ padding: "6px 0", fontSize: 10 }}>
              🔊 Audio Track
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/edit/Storyboard.tsx frontend/src/components/edit/Timeline.tsx
git commit -m "feat: add Storyboard and Timeline components with drag-and-drop reorder"
```

---

### Task 15: Batch Mode Components

**Files:**
- Create: `frontend/src/components/batch/FileQueue.tsx`
- Create: `frontend/src/components/batch/OperationConfig.tsx`
- Create: `frontend/src/components/batch/ProgressPanel.tsx`

- [ ] **Step 1: Create FileQueue**

```tsx
// frontend/src/components/batch/FileQueue.tsx
import { useBatchStore } from "../../stores/batchStore";
import { FileDropZone } from "../shared/FileDropZone";
import { uploadMedia } from "../../api/client";

export function FileQueue() {
  const {
    files, selectedFileIds, addFiles,
    toggleFileSelection, selectAllFiles, deselectAllFiles,
  } = useBatchStore();

  const handleFilesDropped = async (droppedFiles: File[]) => {
    const uploaded = [];
    for (const file of droppedFiles) {
      try {
        const media = await uploadMedia(file);
        uploaded.push(media);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    addFiles(uploaded);
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="section-label">File Queue</div>

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button className="btn btn-primary" style={{ fontSize: 10 }}
          onClick={() => document.getElementById("batch-file-input")?.click()}>
          + Add Files
        </button>
        <input
          id="batch-file-input"
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={async (e) => {
            if (e.target.files) {
              await handleFilesDropped(Array.from(e.target.files));
            }
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {files.map((file) => (
          <div
            key={file.id}
            style={{
              background: "var(--bg-tertiary)",
              borderRadius: 4,
              padding: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderLeft: `3px solid ${file.media_type === "video" ? "var(--accent)" : "var(--purple)"}`,
            }}
          >
            <input
              type="checkbox"
              checked={selectedFileIds.has(file.id)}
              onChange={() => toggleFileSelection(file.id)}
              style={{ accentColor: "var(--accent)" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--text-primary)" }}>
                {file.filename}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
                {file.format.toUpperCase()} · {formatSize(file.file_size_bytes)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>
          {selectedFileIds.size}/{files.length} selected
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 9, color: "var(--accent)", cursor: "pointer" }} onClick={selectAllFiles}>All</span>
          <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>|</span>
          <span style={{ fontSize: 9, color: "var(--text-secondary)", cursor: "pointer" }} onClick={deselectAllFiles}>None</span>
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <FileDropZone onFilesDropped={handleFilesDropped} label="+ Drop files" compact />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create OperationConfig**

```tsx
// frontend/src/components/batch/OperationConfig.tsx
import { useBatchStore } from "../../stores/batchStore";
import { startBatchJob } from "../../api/client";
import type { BatchOperation } from "../../types";

const OPERATION_TEMPLATES: { type: BatchOperation["type"]; icon: string; label: string; description: string }[] = [
  { type: "convert", icon: "🔄", label: "Convert Format", description: "MP4, MOV, WebM, AVI" },
  { type: "crop", icon: "✂️", label: "Crop / Resize", description: "1080p, 720p, Custom" },
  { type: "watermark", icon: "💧", label: "Watermark", description: "Upload image, position, opacity" },
  { type: "trim", icon: "✂", label: "Trim", description: "Cut first/last N seconds" },
  { type: "thumbnail", icon: "📸", label: "Thumbnails", description: "Extract frame at timestamp" },
  { type: "compress", icon: "📦", label: "Compress", description: "Low, Medium, High quality" },
];

export function OperationConfig() {
  const { operations, selectedFileIds, addOperation, removeOperation, setActiveJob } = useBatchStore();

  const isEnabled = (type: string) => operations.some((op) => op.type === type);

  const toggleOperation = (type: BatchOperation["type"]) => {
    const index = operations.findIndex((op) => op.type === type);
    if (index >= 0) {
      removeOperation(index);
    } else {
      const defaults: Record<string, Partial<BatchOperation>> = {
        convert: { target_format: "mp4", codec: "libx264" },
        crop: { width: 1920, height: 1080 },
        watermark: {},
        trim: { trim_start: 0, trim_end: 10 },
        thumbnail: { thumbnail_timestamp: 1.0, thumbnail_format: "png" },
        compress: { quality: "medium" },
      };
      addOperation({ type, ...defaults[type] } as BatchOperation);
    }
  };

  const handleProcess = async () => {
    if (selectedFileIds.size === 0 || operations.length === 0) return;
    try {
      const job = await startBatchJob(
        Array.from(selectedFileIds),
        operations,
      );
      setActiveJob(job);
    } catch (err) {
      console.error("Batch start failed:", err);
    }
  };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      <div className="section-label">Choose Operations</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
        {OPERATION_TEMPLATES.map((tmpl) => (
          <div
            key={tmpl.type}
            onClick={() => toggleOperation(tmpl.type)}
            style={{
              background: "var(--bg-tertiary)",
              borderRadius: 6,
              padding: 10,
              border: `2px solid ${isEnabled(tmpl.type) ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={isEnabled(tmpl.type)}
                readOnly
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
                {tmpl.icon} {tmpl.label}
              </span>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
              {tmpl.description}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 24px", fontSize: 13 }}
          onClick={handleProcess}
          disabled={selectedFileIds.size === 0 || operations.length === 0}
        >
          🚀 Process {selectedFileIds.size} Files
        </button>
        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
          {operations.length} operation(s) selected
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProgressPanel**

```tsx
// frontend/src/components/batch/ProgressPanel.tsx
import { useEffect } from "react";
import { useBatchStore } from "../../stores/batchStore";
import { getBatchStatus } from "../../api/client";
import { ProgressBar } from "../shared/ProgressBar";

export function ProgressPanel() {
  const { activeJob, setActiveJob } = useBatchStore();

  // Poll for updates
  useEffect(() => {
    if (!activeJob || activeJob.status === "completed") return;

    const interval = setInterval(async () => {
      try {
        const updated = await getBatchStatus(activeJob.id);
        setActiveJob(updated);
      } catch (err) {
        console.error("Failed to poll batch status:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, setActiveJob]);

  if (!activeJob) {
    return (
      <div style={{ padding: 10, color: "var(--text-secondary)", fontSize: 12 }}>
        <div className="section-label">Progress</div>
        <p style={{ marginTop: 8 }}>No active job. Configure operations and click Process.</p>
      </div>
    );
  }

  const completed = activeJob.results.filter(
    (r) => r.status === "completed" || r.status === "failed"
  ).length;
  const total = activeJob.results.length;
  const overallProgress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "100%", gap: 6 }}>
      <div className="section-label">Progress</div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {activeJob.results.map((result) => (
          <div
            key={result.file_id}
            style={{ background: "var(--bg-tertiary)", borderRadius: 4, padding: 6 }}
          >
            <ProgressBar
              progress={result.progress}
              status={result.status as "processing" | "completed" | "failed"}
              label={result.filename}
            />
            {result.error && (
              <div style={{ fontSize: 8, color: "var(--error)", marginTop: 2 }}>
                {result.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ background: "var(--bg-tertiary)", borderRadius: 4, padding: 6 }}>
        <ProgressBar
          progress={overallProgress}
          status={activeJob.status === "completed" ? "completed" : "processing"}
          label={`Overall — ${completed}/${total} complete`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/batch/
git commit -m "feat: add Batch mode components — FileQueue, OperationConfig, ProgressPanel"
```

---

### Task 16: Export Mode Components

**Files:**
- Create: `frontend/src/components/export/PreviewSummary.tsx`
- Create: `frontend/src/components/export/ExportSettings.tsx`

- [ ] **Step 1: Create PreviewSummary**

```tsx
// frontend/src/components/export/PreviewSummary.tsx
import { useProjectStore } from "../../stores/projectStore";
import { useTimelineStore } from "../../stores/timelineStore";

export function PreviewSummary() {
  const { project, mediaFiles } = useProjectStore();
  const { clips } = useTimelineStore();

  const videoCount = clips.filter((c) => c.type === "video").length;
  const imageCount = clips.filter((c) => c.type === "image").length;

  const totalDuration = clips.reduce((sum, c) => {
    if (c.type === "image") return sum + (c.duration || 3);
    const start = c.trim_start || 0;
    const end = c.trim_end || 0;
    return sum + (end > start ? end - start : 0);
  }, 0);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const sourceFormats = [...new Set(
    clips.map((c) => mediaFiles.find((m) => m.id === c.media_id)?.format || "").filter(Boolean)
  )].join(", ").toUpperCase();

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-label">Preview</div>

      {/* Mini preview */}
      <div style={{
        background: "var(--bg-tertiary)", borderRadius: 6,
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          height: 160, display: "flex", alignItems: "center",
          justifyContent: "center", background: "var(--bg-primary)",
        }}>
          <span style={{ fontSize: 32, color: "var(--accent)" }}>▶</span>
        </div>
        <div style={{
          padding: 8, display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: "var(--text-primary)" }}>
            {project?.name || "Untitled"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {formatDuration(totalDuration)}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: "var(--bg-tertiary)", borderRadius: 6,
        padding: 10, border: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 6 }}>
          PROJECT SUMMARY
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Clips:</span>
          <span style={{ fontSize: 10, color: "var(--text-primary)" }}>
            {videoCount} video{videoCount !== 1 ? "s" : ""}, {imageCount} image{imageCount !== 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Duration:</span>
          <span style={{ fontSize: 10, color: "var(--text-primary)" }}>{formatDuration(totalDuration)}</span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Formats:</span>
          <span style={{ fontSize: 10, color: "var(--text-primary)" }}>{sourceFormats || "—"}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ExportSettings**

```tsx
// frontend/src/components/export/ExportSettings.tsx
import { useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { startExport, getExportStatus, startDriveAuth, uploadToDrive } from "../../api/client";
import { ProgressBar } from "../shared/ProgressBar";
import type { ExportJob } from "../../types";

const SOCIAL_PRESETS = [
  { id: "youtube", label: "YouTube", desc: "16:9 · 1080p · H.264" },
  { id: "instagram_reel", label: "Instagram Reel", desc: "9:16 · 1080p · H.264" },
  { id: "tiktok", label: "TikTok", desc: "9:16 · 1080p · H.264" },
  { id: "twitter", label: "Twitter / X", desc: "16:9 · 720p · H.264" },
  { id: "instagram_post", label: "Instagram Post", desc: "1:1 · 1080p · H.264" },
  { id: "whatsapp", label: "WhatsApp", desc: "16:9 · 720p · Compressed" },
];

const QUALITY_TIERS = [
  { id: "sd", label: "SD", desc: "480p · 2 Mbps" },
  { id: "hd", label: "HD", desc: "720p · 5 Mbps" },
  { id: "fullhd", label: "Full HD", desc: "1080p · 8 Mbps" },
  { id: "4k", label: "4K", desc: "2160p · 20 Mbps" },
];

const CONTAINERS = ["mp4", "mov", "mkv", "webm", "avi"];
const CODECS = ["libx264", "libx265", "libvpx-vp9", "libaom-av1"];
const CODEC_LABELS: Record<string, string> = {
  libx264: "H.264", libx265: "H.265", "libvpx-vp9": "VP9", "libaom-av1": "AV1",
};
const RESOLUTIONS = [
  { label: "4K", w: 3840, h: 2160 },
  { label: "1080p", w: 1920, h: 1080 },
  { label: "720p", w: 1280, h: 720 },
  { label: "480p", w: 854, h: 480 },
];
const FPS_OPTIONS = [24, 30, 60];

export function ExportSettings() {
  const { project } = useProjectStore();

  const [selectedPreset, setSelectedPreset] = useState<string | null>("youtube");
  const [qualityTier, setQualityTier] = useState<string | null>(null);
  const [container, setContainer] = useState("mp4");
  const [codec, setCodec] = useState("libx264");
  const [resolution, setResolution] = useState({ w: 1920, h: 1080 });
  const [fps, setFps] = useState(30);
  const [bitrate, setBitrate] = useState(8);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadToDriveEnabled, setUploadToDriveEnabled] = useState(false);

  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);

    try {
      const job = await startExport({
        project_id: project.id,
        preset: selectedPreset || undefined,
        quality_tier: qualityTier || undefined,
        container,
        video_codec: codec,
        audio_codec: "aac",
        width: resolution.w,
        height: resolution.h,
        bitrate: `${bitrate}M`,
        fps,
        upload_to_drive: uploadToDriveEnabled,
      });

      setExportJob(job);

      // Poll for completion
      const poll = setInterval(async () => {
        const status = await getExportStatus(job.id);
        setExportJob(status);
        if (status.status === "completed" || status.status === "failed") {
          clearInterval(poll);
          setExporting(false);

          // Upload to Drive if requested
          if (status.status === "completed" && uploadToDriveEnabled && status.output_path) {
            try {
              await uploadToDrive(status.output_path);
            } catch (err) {
              console.error("Drive upload failed:", err);
            }
          }
        }
      }, 1000);
    } catch (err) {
      console.error("Export failed:", err);
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", height: "100%" }}>
      {/* Quality Tiers */}
      <div>
        <div className="section-label">Quality</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {QUALITY_TIERS.map((tier) => (
            <button
              key={tier.id}
              className={`btn ${qualityTier === tier.id ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: 11, padding: "6px 12px", flex: 1 }}
              onClick={() => {
                setQualityTier(tier.id);
                setSelectedPreset(null);
              }}
            >
              <div style={{ fontWeight: 600 }}>{tier.label}</div>
              <div style={{ fontSize: 8, opacity: 0.8, marginTop: 2 }}>{tier.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Social Presets */}
      <div>
        <div className="section-label">Social Media Presets</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
          {SOCIAL_PRESETS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => {
                setSelectedPreset(preset.id);
                setQualityTier(null);
              }}
              style={{
                background: "var(--bg-tertiary)",
                borderRadius: 6,
                padding: 8,
                border: `2px solid ${selectedPreset === preset.id ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
                {preset.label}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
                {preset.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div>
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", cursor: "pointer",
          }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="section-label">Advanced Settings</span>
          <span style={{ fontSize: 9, color: "var(--accent)" }}>
            {showAdvanced ? "▲ Collapse" : "▼ Expand"}
          </span>
        </div>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {/* Container */}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>Container</div>
              <div style={{ display: "flex", gap: 3 }}>
                {CONTAINERS.map((c) => (
                  <button
                    key={c}
                    className={`btn ${container === c ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: 10, padding: "3px 8px", textTransform: "uppercase" }}
                    onClick={() => setContainer(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Codec */}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>Video Codec</div>
              <div style={{ display: "flex", gap: 3 }}>
                {CODECS.map((c) => (
                  <button
                    key={c}
                    className={`btn ${codec === c ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: 10, padding: "3px 8px" }}
                    onClick={() => setCodec(c)}
                  >
                    {CODEC_LABELS[c] || c}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>Resolution</div>
              <div style={{ display: "flex", gap: 3 }}>
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.label}
                    className={`btn ${resolution.w === r.w ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: 10, padding: "3px 8px" }}
                    onClick={() => setResolution({ w: r.w, h: r.h })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bitrate */}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>
                Bitrate: {bitrate} Mbps
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={bitrate}
                onChange={(e) => setBitrate(parseInt(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            {/* FPS */}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>Frame Rate</div>
              <div style={{ display: "flex", gap: 3 }}>
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    className={`btn ${fps === f ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: 10, padding: "3px 8px" }}
                    onClick={() => setFps(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drive Upload */}
      <div style={{
        background: "var(--bg-tertiary)", borderRadius: 4, padding: 8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <input
          type="checkbox"
          checked={uploadToDriveEnabled}
          onChange={(e) => setUploadToDriveEnabled(e.target.checked)}
          style={{ accentColor: "var(--accent)" }}
        />
        <div>
          <div style={{ fontSize: 11, color: "var(--text-primary)" }}>Upload to Google Drive</div>
          <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
            Save a copy to your Drive after export
          </div>
        </div>
      </div>

      {/* Export Progress */}
      {exportJob && (
        <div style={{ background: "var(--bg-tertiary)", borderRadius: 4, padding: 8 }}>
          <ProgressBar
            progress={exportJob.progress}
            status={exportJob.status as "processing" | "completed" | "failed"}
            label={exportJob.status === "completed"
              ? `Done — ${exportJob.output_path}`
              : exportJob.status === "failed"
              ? `Failed: ${exportJob.error}`
              : "Exporting..."}
          />
        </div>
      )}

      {/* Export Button */}
      <button
        className="btn btn-primary"
        style={{ padding: "12px", fontSize: 14, fontWeight: 700, width: "100%" }}
        onClick={handleExport}
        disabled={exporting || !project}
      >
        {exporting ? "Exporting..." : "🚀 Export Video"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/export/
git commit -m "feat: add Export mode — PreviewSummary, ExportSettings with quality tiers, presets, Drive upload"
```

---

### Task 17: Wire Up All Modes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update App.tsx to use real components**

```tsx
// frontend/src/App.tsx
import { useEffect } from "react";
import { TabBar } from "./components/layout/TabBar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { useProjectStore } from "./stores/projectStore";

// Edit mode
import { MediaBrowser } from "./components/edit/MediaBrowser";
import { PreviewPlayer } from "./components/edit/PreviewPlayer";
import { PropertiesPanel } from "./components/edit/PropertiesPanel";
import { Timeline } from "./components/edit/Timeline";

// Batch mode
import { FileQueue } from "./components/batch/FileQueue";
import { OperationConfig } from "./components/batch/OperationConfig";
import { ProgressPanel } from "./components/batch/ProgressPanel";

// Export mode
import { PreviewSummary } from "./components/export/PreviewSummary";
import { ExportSettings } from "./components/export/ExportSettings";

function EditMode() {
  return (
    <PanelLayout
      left={<MediaBrowser />}
      center={<PreviewPlayer />}
      right={<PropertiesPanel />}
      bottom={<Timeline />}
    />
  );
}

function BatchMode() {
  return (
    <PanelLayout
      left={<FileQueue />}
      center={<OperationConfig />}
      right={<ProgressPanel />}
    />
  );
}

function ExportMode() {
  return (
    <PanelLayout
      left={<PreviewSummary />}
      center={<ExportSettings />}
    />
  );
}

export default function App() {
  const { activeTab, project, initProject } = useProjectStore();

  useEffect(() => {
    if (!project) {
      initProject("Untitled Project");
    }
  }, [project, initProject]);

  return (
    <div className="app">
      <TabBar />
      <div className="app-body">
        {activeTab === "edit" && <EditMode />}
        {activeTab === "batch" && <BatchMode />}
        {activeTab === "export" && <ExportMode />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd /Users/fighter/VideoEditor/frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up all mode components in App.tsx — Edit, Batch, Export fully connected"
```

---

### Task 18: Proxy & Thumbnail Endpoint + Static File Serving

**Files:**
- Modify: `backend/routers/media.py` (add proxy/thumbnail endpoints)
- Modify: `backend/main.py` (serve upload files)

- [ ] **Step 1: Add proxy and thumbnail endpoints to media router**

Add to `backend/routers/media.py`:

```python
from fastapi.responses import FileResponse
from services.ffmpeg_service import generate_proxy, generate_thumbnail, probe_file

@router.get("/{media_id}/proxy")
async def get_media_proxy(media_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM media_files WHERE id = ?", (media_id,)
        )
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Media file not found")

    stored_path = row["stored_path"]
    media_type = row["media_type"]

    if media_type == "image":
        return FileResponse(stored_path)

    # Check if proxy already exists
    proxy_path = row["proxy_path"]
    if proxy_path and Path(proxy_path).exists():
        return FileResponse(proxy_path)

    # Generate proxy
    proxy_name = f"{media_id}_proxy.mp4"
    proxy_path = str(settings.proxy_dir / proxy_name)

    try:
        generate_proxy(stored_path, proxy_path)
    except ValueError:
        raise HTTPException(status_code=500, detail="Failed to generate proxy")

    # Update DB
    db = await get_db()
    try:
        await db.execute(
            "UPDATE media_files SET proxy_path = ? WHERE id = ?",
            (proxy_path, media_id),
        )
        await db.commit()
    finally:
        await db.close()

    return FileResponse(proxy_path)


@router.get("/{media_id}/thumbnail")
async def get_media_thumbnail(media_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM media_files WHERE id = ?", (media_id,)
        )
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Media file not found")

    stored_path = row["stored_path"]

    # Check if thumbnail already exists
    thumb_path = row["thumbnail_path"]
    if thumb_path and Path(thumb_path).exists():
        return FileResponse(thumb_path)

    # Generate thumbnail
    thumb_name = f"{media_id}_thumb.jpg"
    thumb_path = str(settings.thumbnail_dir / thumb_name)

    try:
        if row["media_type"] == "image":
            # For images, just serve the original scaled
            from shutil import copy2
            copy2(stored_path, thumb_path)
        else:
            generate_thumbnail(stored_path, thumb_path, timestamp=1.0)
    except ValueError:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail")

    # Update DB
    db = await get_db()
    try:
        await db.execute(
            "UPDATE media_files SET thumbnail_path = ? WHERE id = ?",
            (thumb_path, media_id),
        )
        await db.commit()
    finally:
        await db.close()

    return FileResponse(thumb_path)
```

Also add `probe_file` call to the upload endpoint to populate width/height/duration. In `upload_media()`, after saving the file, add:

```python
    # Probe file metadata
    width = None
    height = None
    duration = None
    try:
        if media_type == "video":
            probe_result = probe_file(str(stored_path))
            width = probe_result.width
            height = probe_result.height
            duration = probe_result.duration_seconds
    except (ValueError, FileNotFoundError):
        pass  # Non-critical — metadata is optional
```

And update the INSERT to include width, height, duration:

```python
    await db.execute(
        """INSERT INTO media_files
           (id, project_id, filename, original_path, stored_path,
            media_type, format, width, height, duration_seconds,
            file_size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (file_id, None, file.filename, file.filename, str(stored_path),
         media_type, ext.lstrip("."), width, height, duration, file_size, now),
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/media.py backend/main.py
git commit -m "feat: add proxy/thumbnail generation endpoints and auto-probe on upload"
```

---

### Task 19: Final Integration Test — Full Workflow

**Files:**
- Create: `tests/test_integration.py`

- [ ] **Step 1: Write integration test**

```python
# tests/test_integration.py
import pytest
import subprocess
import tempfile
import os
import asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app


def _create_test_video(path: str, duration: float = 2.0):
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            f"color=c=blue:s=320x240:d={duration}",
            "-c:v", "libx264", "-t", str(duration), path,
        ],
        capture_output=True, check=True,
    )


def _create_test_image(path: str):
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "color=c=green:s=320x240:d=1",
            "-frames:v", "1", path,
        ],
        capture_output=True, check=True,
    )


@pytest.mark.asyncio
async def test_full_edit_workflow():
    """Test: upload video + image → create project → add to timeline → export."""
    transport = ASGITransport(app=app)

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "test.mp4")
        image_path = os.path.join(tmpdir, "test.png")
        _create_test_video(video_path, duration=2.0)
        _create_test_image(image_path)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Upload video
            with open(video_path, "rb") as f:
                resp = await client.post(
                    "/api/media/upload",
                    files={"file": ("test.mp4", f, "video/mp4")},
                )
            assert resp.status_code == 200
            video_media = resp.json()

            # Upload image
            with open(image_path, "rb") as f:
                resp = await client.post(
                    "/api/media/upload",
                    files={"file": ("test.png", f, "image/png")},
                )
            assert resp.status_code == 200
            image_media = resp.json()

            # Create project
            resp = await client.post("/api/projects", json={"name": "Test Project"})
            assert resp.status_code == 200
            project = resp.json()

            # Update timeline with clips
            timeline = {
                "mode": "storyboard",
                "clips": [
                    {
                        "id": "clip-1",
                        "media_id": video_media["id"],
                        "type": "video",
                        "trim_start": 0.0,
                        "trim_end": 2.0,
                        "crop": None,
                        "speed": 1.0,
                        "duration": None,
                        "order": 0,
                    },
                    {
                        "id": "clip-2",
                        "media_id": image_media["id"],
                        "type": "image",
                        "trim_start": 0.0,
                        "trim_end": None,
                        "crop": None,
                        "speed": 1.0,
                        "duration": 3.0,
                        "order": 1,
                    },
                ],
                "overlays": [],
            }

            resp = await client.put(
                f"/api/projects/{project['id']}",
                json={"timeline": timeline},
            )
            assert resp.status_code == 200
            assert len(resp.json()["timeline"]["clips"]) == 2

            # Start export
            resp = await client.post("/api/export", json={
                "project_id": project["id"],
                "container": "mp4",
                "video_codec": "libx264",
                "audio_codec": "aac",
                "fps": 30,
                "quality_tier": "hd",
                "output_dir": tmpdir,
            })
            assert resp.status_code == 200
            export_job = resp.json()
            assert export_job["status"] == "processing"
```

- [ ] **Step 2: Run integration test**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/test_integration.py -v --timeout=60
```

Expected: PASS (may take a few seconds for FFmpeg processing)

- [ ] **Step 3: Commit**

```bash
git add tests/test_integration.py
git commit -m "test: add full workflow integration test — upload, project, timeline, export"
```

---

### Task 20: Run Script & Final Verification

**Files:**
- Create: `run.sh`

- [ ] **Step 1: Create run script**

```bash
#!/bin/bash
# ClipForge — Start both backend and frontend

set -e

echo "🎬 Starting ClipForge..."

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg not found. Install it: brew install ffmpeg"
    exit 1
fi

# Start backend
echo "🐍 Starting backend..."
cd "$(dirname "$0")/backend"
if [ ! -d "../.venv" ]; then
    python3 -m venv ../.venv
    source ../.venv/bin/activate
    pip install -r requirements.txt
else
    source ../.venv/bin/activate
fi

uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend
echo "⚛️  Starting frontend..."
cd "$(dirname "$0")/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi

npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ ClipForge is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /Users/fighter/VideoEditor/run.sh
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/fighter/VideoEditor/backend && python -m pytest ../tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 4: Start the app and verify**

```bash
cd /Users/fighter/VideoEditor && ./run.sh
```

Expected: Backend starts on :8000, frontend on :5173. Three tabs visible, all panels render.

- [ ] **Step 5: Final commit**

```bash
git add run.sh
git commit -m "feat: add run.sh launch script for backend + frontend"
```

---

## Summary

| Phase | Tasks | What it builds |
|-------|-------|---------------|
| Phase 1: Backend | Tasks 1-7 | FastAPI app, FFmpeg service, project/media/batch/export APIs, WebSocket, Drive upload |
| Phase 2: Frontend | Tasks 8-17 | React app shell, all 3 modes (Edit/Batch/Export) with full component tree |
| Phase 3: Integration | Tasks 18-20 | Proxy/thumbnail serving, integration tests, launch script |

**Total: 20 tasks, ~80 steps**
