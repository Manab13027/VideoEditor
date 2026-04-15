# ClipForge — Video Editor Design Spec

## Overview

ClipForge is a hybrid video editing application: a React web UI served locally with a Python FastAPI backend that delegates heavy processing to FFmpeg. It targets two primary use cases: **quick social media edits** (trim, crop, insert images, stitch clips) and **batch processing** (bulk format conversion, watermarking, compression, etc.).

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18+ (Vite build), TypeScript |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Processing | FFmpeg (via `ffmpeg-python` bindings) |
| Database | SQLite (project state, job queue) |
| Communication | REST API + WebSocket (progress updates) |
| File handling | Local filesystem, Google Drive API (export) |

### System Diagram

```
┌─────────────────────────────────┐
│         React Frontend          │
│  (Vite dev server / static)     │
│                                 │
│  ┌──────┐ ┌──────┐ ┌────────┐  │
│  │ Edit │ │Batch │ │ Export │  │
│  │ Mode │ │ Mode │ │  Mode  │  │
│  └──┬───┘ └──┬───┘ └───┬────┘  │
│     │        │          │       │
└─────┼────────┼──────────┼───────┘
      │  REST + WebSocket │
      ▼        ▼          ▼
┌─────────────────────────────────┐
│        FastAPI Backend          │
│                                 │
│  ┌──────────┐ ┌──────────────┐  │
│  │ Project  │ │  Job Queue   │  │
│  │ Manager  │ │  (async)     │  │
│  └────┬─────┘ └──────┬───────┘  │
│       │              │          │
│  ┌────▼──────────────▼───────┐  │
│  │    FFmpeg Processor       │  │
│  │  (concurrent.futures)     │  │
│  └───────────┬───────────────┘  │
│              │                  │
│  ┌───────────▼───────────────┐  │
│  │   SQLite (state/jobs)     │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Key Design Decisions

- **Monolith architecture** — single FastAPI process with async background workers for FFmpeg jobs. No microservices overhead for a local app.
- **FFmpeg for all processing** — handles virtually every video/image format. No need for separate libraries per format.
- **WebSocket for progress** — real-time progress bars during processing and export.
- **SQLite for state** — lightweight, zero-config, sufficient for project metadata and job queues.

## UI Design

### Layout Structure (Tab-Based)

```
┌──────────────────────────────────────────────────┐
│  🎬 ClipForge   [Edit] [Batch] [Export]   ⚙      │
├────────┬─────────────────────────┬───────────────┤
│        │                         │               │
│ Left   │     Center Panel        │  Right Panel  │
│ Panel  │   (context-dependent)   │  (context)    │
│        │                         │               │
├────────┴─────────────────────────┴───────────────┤
│  Bottom Panel (timeline / progress)              │
└──────────────────────────────────────────────────┘
```

Three modes via top tabs. Each mode repurposes the four panel zones.

---

## Mode 1: Edit Mode

**Purpose:** Single-project creative editing — trim, crop, reorder clips, insert images.

### Panel Layout

| Panel | Content |
|-------|---------|
| Left | **Media Browser** — imported files with thumbnails, metadata (duration, resolution, format). Filter by All/Video/Image. Drag-and-drop import zone. |
| Center | **Preview Player** — video playback with play/pause/skip/seek controls, timecode, volume. Interactive crop handles overlay (drag corners). |
| Right | **Properties Panel** — context-sensitive controls for the selected clip: crop coordinates (X/Y/W/H), aspect ratio presets (16:9, 9:16, 1:1, 4:3, Free), trim start/end, speed adjustment, "Insert image at playhead" button. |
| Bottom | **Timeline** — toggle between Storyboard view (simple drag-and-drop cards) and Multi-track view (layered horizontal tracks for video + image overlay + audio). Zoom control. Drop zone for adding clips. |

### Edit Features

1. **Import media** — drag-and-drop or file picker. Accepts all FFmpeg-supported formats (MP4, MOV, AVI, MKV, WebM, FLV, WMV, MPEG, 3GP, PNG, JPG, JPEG, BMP, TIFF, GIF, WebP).
2. **Preview playback** — real-time video preview via HTML5 `<video>` element. Backend generates browser-compatible proxy files (H.264/MP4) for formats the browser can't play natively.
3. **Crop** — interactive crop handles on the preview. Aspect ratio lock presets. Manual coordinate entry in properties panel.
4. **Trim** — set in/out points via properties panel or by dragging handles on timeline clips.
5. **Insert images** — add images between video segments. Set duration (how long the image shows). Images appear as clips on the timeline.
6. **Stitch/reorder** — drag clips on the storyboard/timeline to reorder. Clips play sequentially in the final output.
7. **Speed control** — 0.25x to 4x per clip.
8. **Multi-track mode** — video track, image overlay track (picture-in-picture), audio track. Overlay positioning via drag in preview.

### Timeline Details

**Storyboard view (default):**
- Each clip is a card showing thumbnail, filename, duration
- Drag to reorder
- Click to select (loads in preview + properties panel)
- "+" button to add from media browser

**Multi-track view (advanced toggle):**
- Track 1: Video — primary video clips
- Track 2: Image overlay — pictures overlaid on video (position/size adjustable)
- Track 3: Audio — extracted audio, mute/volume per clip
- Playhead scrubber with frame-accurate seeking
- Clip handles for trim-in-place

---

## Mode 2: Batch Mode

**Purpose:** Apply operations to multiple files simultaneously.

### Panel Layout

| Panel | Content |
|-------|---------|
| Left | **File Queue** — add files or folders. Checkboxes for select/deselect. File metadata (format, resolution, duration, size). Select all/none. |
| Center | **Operation Config** — 6 operation cards, each toggleable. Multiple operations can be stacked and run sequentially on each file. |
| Right | **Progress Panel** — per-file progress bars with status (✓ done, % in progress, queued, ✗ error). Overall progress bar with time remaining. "Open Output Folder" button. |

### Batch Operations

| Operation | Config Options |
|-----------|---------------|
| **Convert Format** | Target: MP4, MOV, WebM, AVI, MKV. Codec selection. |
| **Crop / Resize** | Target resolution: 4K, 1080p, 720p, 480p, custom. Aspect ratio. |
| **Watermark** | Upload image, position (9-point grid), opacity slider, scale. |
| **Trim** | Cut first N seconds, cut last N seconds, or keep range. |
| **Thumbnail Extract** | Timestamp (specific time, or auto: 25% mark). Output format: PNG/JPG. |
| **Compress** | Quality levels: Low (small file), Medium (balanced), High (near-original). |

### Batch Processing Engine

- Jobs run via `concurrent.futures.ProcessPoolExecutor` — parallel processing of multiple files.
- Max concurrent jobs configurable (default: CPU cores - 1).
- Each job is an FFmpeg command pipeline.
- Progress reported via WebSocket per-file.
- Failed jobs logged with error message, don't block remaining files.
- Output files written to user-specified directory with configurable naming pattern (e.g., `{original}_converted.mp4`).

---

## Mode 3: Export Mode

**Purpose:** Final export of the edited project from Edit mode.

### Panel Layout

| Panel | Content |
|-------|---------|
| Left | **Preview Summary** — mini preview player, project summary (clip count, duration, source formats, estimated output size). |
| Right | **Export Settings** — quick presets + advanced controls. |

### Quality Presets

| Tier | Resolution | Bitrate | Use Case |
|------|-----------|---------|----------|
| SD | 480p | 2 Mbps | Small file, messaging apps |
| HD | 720p | 5 Mbps | Good quality, moderate size |
| Full HD | 1080p | 8 Mbps | High quality, standard |
| 4K | 2160p | 20 Mbps | Maximum quality, large file |

### Social Media Presets

| Preset | Aspect Ratio | Resolution | Codec | Notes |
|--------|-------------|-----------|-------|-------|
| YouTube | 16:9 | 1080p | H.264 | Standard upload |
| Instagram Reel | 9:16 | 1080p | H.264 | Vertical video |
| TikTok | 9:16 | 1080p | H.264 | Vertical video |
| Twitter / X | 16:9 | 720p | H.264 | Compressed |
| Instagram Post | 1:1 | 1080p | H.264 | Square video |
| WhatsApp | 16:9 | 720p | H.264 | Highly compressed |

### Advanced Export Controls

- **Container:** MP4, MOV, MKV, WebM, AVI
- **Video codec:** H.264, H.265 (HEVC), VP9, AV1
- **Audio codec:** AAC, MP3, Opus (auto-selected based on container)
- **Resolution:** 4K, 1080p, 720p, 480p, Custom (W×H)
- **Bitrate:** Slider from 1 Mbps to 50 Mbps, with quality label
- **Frame rate:** 24, 30, 60 fps
- **Output location:** Local folder picker + **Google Drive** upload option

### Save to Drive

- OAuth2 flow to authenticate with Google Drive
- Upload directly after export completes
- Choose Drive folder destination
- Shows upload progress bar
- Fallback: always saves locally first, Drive upload is secondary

### Export Pipeline

1. User clicks "Export Video"
2. Backend receives project definition (clip order, trim points, crop settings, overlays)
3. FFmpeg constructs a filter_complex graph:
   - Decode each source clip
   - Apply per-clip transforms (crop, trim, speed)
   - Concatenate clips in timeline order
   - Apply image overlays at specified positions/times
   - Encode to target format/codec/resolution
4. Progress streamed via WebSocket (FFmpeg progress parsing)
5. Output written to local path
6. If Drive selected: upload via Google Drive API
7. Completion notification with file size and path

---

## Backend API Design

### REST Endpoints

```
POST   /api/projects                    — Create new project
GET    /api/projects/{id}               — Get project state
PUT    /api/projects/{id}               — Update project (timeline, settings)
DELETE /api/projects/{id}               — Delete project

POST   /api/media/upload                — Upload media file(s)
GET    /api/media/{id}/thumbnail        — Get thumbnail for media file
GET    /api/media/{id}/proxy            — Get browser-playable proxy
GET    /api/media/{id}/info             — Get file metadata (ffprobe)

POST   /api/export                      — Start export job
GET    /api/export/{job_id}/status      — Get export progress

POST   /api/batch                       — Start batch job
GET    /api/batch/{job_id}/status       — Get batch progress

POST   /api/drive/auth                  — Initiate Google Drive OAuth
POST   /api/drive/upload                — Upload file to Drive
```

### WebSocket

```
WS /ws/progress/{job_id}               — Real-time progress updates
```

Message format:
```json
{
  "job_id": "abc123",
  "file": "vacation_01.mp4",
  "progress": 67.5,
  "status": "processing",
  "eta_seconds": 45
}
```

### Data Models

**Project:**
```json
{
  "id": "uuid",
  "name": "My Project",
  "created_at": "2026-04-15T10:00:00Z",
  "timeline": {
    "mode": "storyboard",
    "clips": [
      {
        "id": "clip-1",
        "media_id": "media-uuid",
        "type": "video",
        "trim_start": 0.0,
        "trim_end": 32.5,
        "crop": {"x": 0, "y": 0, "w": 1920, "h": 1080},
        "speed": 1.0,
        "order": 0
      },
      {
        "id": "clip-2",
        "media_id": "media-uuid-2",
        "type": "image",
        "duration": 3.0,
        "order": 1
      }
    ],
    "overlays": [
      {
        "media_id": "media-uuid-3",
        "position": {"x": 50, "y": 50},
        "size": {"w": 200, "h": 200},
        "time_start": 5.0,
        "time_end": 10.0
      }
    ]
  }
}
```

**BatchJob:**
```json
{
  "id": "uuid",
  "files": ["path1.mp4", "path2.mov"],
  "operations": [
    {"type": "convert", "target_format": "mp4", "codec": "h264"},
    {"type": "compress", "quality": "medium"}
  ],
  "output_dir": "/Users/user/Desktop/output",
  "naming_pattern": "{original}_{operation}",
  "status": "processing",
  "results": [
    {"file": "path1.mp4", "status": "completed", "output": "path1_converted.mp4"},
    {"file": "path2.mov", "status": "processing", "progress": 45.2}
  ]
}
```

---

## File & Format Support

### Video Formats (Input)

MP4, MOV, AVI, MKV, WebM, FLV, WMV, MPEG, MPG, 3GP, M4V, TS, VOB, OGV, ASF, RM, RMVB — any format FFmpeg can decode.

### Image Formats (Input)

PNG, JPG, JPEG, BMP, TIFF, GIF (first frame or animated), WebP, SVG (rasterized), ICO, TGA, PSD (flattened).

### Output Formats

MP4 (H.264/H.265), MOV (H.264/ProRes), MKV (H.264/H.265/VP9), WebM (VP9/AV1), AVI (MPEG-4).

### Proxy Generation

For formats the browser can't play natively (AVI, MKV, FLV, WMV, etc.), the backend auto-generates a low-res H.264/MP4 proxy for preview playback. The proxy is cached and reused.

---

## Project Structure

```
VideoEditor/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Settings, paths, defaults
│   ├── models/
│   │   ├── project.py           # Project data model
│   │   ├── media.py             # Media file model
│   │   └── job.py               # Export/batch job model
│   ├── routers/
│   │   ├── projects.py          # Project CRUD endpoints
│   │   ├── media.py             # Media upload/info endpoints
│   │   ├── export.py            # Export endpoints
│   │   ├── batch.py             # Batch processing endpoints
│   │   └── drive.py             # Google Drive endpoints
│   ├── services/
│   │   ├── ffmpeg_service.py    # FFmpeg command builder
│   │   ├── proxy_service.py     # Proxy generation
│   │   ├── export_service.py    # Export pipeline
│   │   ├── batch_service.py     # Batch pipeline
│   │   └── drive_service.py     # Google Drive upload
│   ├── workers/
│   │   └── task_runner.py       # Background job executor
│   ├── database.py              # SQLite connection
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root component, tab routing
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── TabBar.tsx
│   │   │   │   └── PanelLayout.tsx
│   │   │   ├── edit/
│   │   │   │   ├── MediaBrowser.tsx
│   │   │   │   ├── PreviewPlayer.tsx
│   │   │   │   ├── PropertiesPanel.tsx
│   │   │   │   ├── Timeline.tsx
│   │   │   │   ├── Storyboard.tsx
│   │   │   │   └── MultiTrack.tsx
│   │   │   ├── batch/
│   │   │   │   ├── FileQueue.tsx
│   │   │   │   ├── OperationConfig.tsx
│   │   │   │   └── ProgressPanel.tsx
│   │   │   ├── export/
│   │   │   │   ├── PreviewSummary.tsx
│   │   │   │   ├── QuickPresets.tsx
│   │   │   │   ├── AdvancedSettings.tsx
│   │   │   │   ├── QualityTier.tsx
│   │   │   │   └── DriveUpload.tsx
│   │   │   └── shared/
│   │   │       ├── VideoPlayer.tsx
│   │   │       ├── ProgressBar.tsx
│   │   │       ├── FileDropZone.tsx
│   │   │       └── AspectRatioSelector.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useProject.ts
│   │   │   └── useMediaUpload.ts
│   │   ├── stores/
│   │   │   ├── projectStore.ts  # Zustand — project state
│   │   │   ├── timelineStore.ts # Timeline state
│   │   │   └── batchStore.ts    # Batch job state
│   │   ├── api/
│   │   │   └── client.ts        # Axios/fetch API client
│   │   └── types/
│   │       └── index.ts         # TypeScript interfaces
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── data/                        # Runtime data (gitignored)
│   ├── uploads/                 # Uploaded media files
│   ├── proxies/                 # Generated proxy files
│   ├── exports/                 # Export output
│   └── clipforge.db             # SQLite database
├── docs/
│   └── superpowers/
│       └── specs/
├── .gitignore
└── README.md
```

---

## Error Handling

- **Upload failures** — validate file type on upload, return clear error if unsupported
- **FFmpeg errors** — parse stderr, surface human-readable error in UI (e.g., "Codec not supported" rather than raw FFmpeg output)
- **Batch failures** — per-file error tracking, failed files don't block others, error log viewable in progress panel
- **Drive upload failures** — retry with exponential backoff (max 3 attempts), fallback message: "Saved locally, Drive upload failed"
- **Proxy generation failures** — fallback to showing file metadata without preview, with "Preview unavailable" message

---

## Performance Considerations

- **Proxy files** — low-res H.264 proxies for smooth preview playback regardless of source format
- **Thumbnail caching** — generated once per media file, cached to disk
- **Concurrent batch processing** — `ProcessPoolExecutor` with `max_workers = cpu_count - 1`
- **Chunked uploads** — large files uploaded in chunks to prevent timeout
- **FFmpeg hardware acceleration** — detect and use NVENC/VideoToolbox/VAAPI when available for faster encoding

---

## Testing Strategy

- **Backend unit tests** — pytest for each service (FFmpeg command building, project CRUD, batch logic)
- **API integration tests** — test each endpoint with httpx test client
- **Frontend component tests** — React Testing Library for key components
- **E2E tests** — Playwright for critical flows (import → edit → export)

---

## Non-Goals (Out of Scope for V1)

- Audio editing (waveform editor, audio effects)
- Video effects/filters (color grading, transitions)
- Text/title overlays
- Cloud-based processing
- Multi-user collaboration
- Mobile responsive design (desktop-first)
