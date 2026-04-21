# Social Media Optimization — Design Spec
**Date:** 2026-04-21  
**Status:** Approved  

---

## Goal

Add a dedicated Social tab to ClipForge that covers the full "prepare to post" workflow: metadata authoring, AI-powered hashtag suggestions, feed-mode preview, thumbnail generation, platform validation, and multi-platform batch export. No direct platform API uploads — users copy-paste or drag the exported files to their platform of choice.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Upload strategy | Export-first (no platform APIs) | No API approval friction, ships fast, works for all platforms indefinitely |
| Layout | Dedicated "Social" tab (6th tab) | Clean separation from technical Export tab; full screen for feed preview |
| Hashtag generation | Claude API + local DB fallback | Context-aware results when key is available; always works offline |
| Features | All 6 (metadata, hashtags, feed preview, thumbnail, validation, multi-export) | All identified as must-haves |

---

## Out of Scope

- Direct OAuth uploads to TikTok, Instagram, or YouTube
- Scheduling posts
- Analytics or engagement tracking
- Watermark / branding overlays (already exists in batch, not wired to social)

---

## Architecture

### Frontend

**New tab:** Add `"social"` to `TabMode` in `types/index.ts`.  
**New directory:** `frontend/src/components/social/`

| Component | Responsibility |
|---|---|
| `SocialPanel.tsx` | Root layout — two-column (left: controls, right: feed preview) |
| `MetadataPanel.tsx` | Title, description/caption, platform chip toggles |
| `HashtagPanel.tsx` | Keyword input → generate → per-platform tag sets → copy buttons |
| `ThumbnailPicker.tsx` | Video scrubber, auto-suggested frames, title overlay toggle, PNG export |
| `ValidationWarnings.tsx` | Real-time client-side limit checks with fix suggestions |
| `MultiExportPanel.tsx` | Per-platform export queue, triggers N sequential export jobs, polls status |
| `FeedPreview.tsx` | Platform switcher (TikTok / IG Reel / IG Post / YouTube), CSS mock UI with embedded video proxy |

**New store:** `frontend/src/stores/socialStore.ts`

```typescript
{
  metadata: SocialMetadata;          // title, description, platforms, thumbnailTime
  hashtags: HashtagResult[];         // per-platform tag arrays
  multiExportJobs: MultiExportJob[]; // per-platform job status
  setMetadata: (patch: Partial<SocialMetadata>) => void;
  setHashtags: (results: HashtagResult[]) => void;
  setMultiExportJobs: (jobs: MultiExportJob[]) => void;
  reset: () => void;
}
```

### Backend

**New router:** `backend/routers/social.py` — prefix `/api/social`  
**New service:** `backend/services/social_service.py`  
**New data file:** `backend/data/hashtag_db.json`

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/social/hashtags` | POST | Generate hashtag sets via Claude API → local DB fallback |
| `/api/social/thumbnail/{media_id}` | POST | Extract frame at timestamp, optional text burn-in, return PNG |
| `/api/social/multi-export` | POST | Queue N export jobs (one per selected platform) |
| `/api/social/validate` | GET | Return platform limit violations for given duration + file size |

Register `ai_router` pattern: add `from backend.routers.social import router as social_router` and `app.include_router(social_router)` in `main.py`.

---

## Data Models

Add to `frontend/src/types/index.ts`:

```typescript
export type SocialPlatform = "tiktok" | "instagram_reel" | "instagram_post" | "youtube";

export interface SocialMetadata {
  title: string;
  description: string;
  platforms: SocialPlatform[];
  thumbnailTime: number | null;
}

export interface HashtagResult {
  platform: string;
  tags: string[];
}

export interface MultiExportJob {
  platform: SocialPlatform;
  jobId: string;
  status: "pending" | "running" | "done" | "error";
  outputPath: string | null;
  error: string | null;
}
```

Platform limits (static — mirrored frontend + backend):

| Platform | Max size | Max duration | Aspect ratio | Export preset key | Max hashtags |
|---|---|---|---|---|---|
| TikTok | 287 MB | 10 min | 9:16 | `tiktok` | 30 |
| Instagram Reel | 100 MB | 90 s | 9:16 | `instagram_reel` | 30 |
| Instagram Post | 100 MB | 60 s | 1:1 | `instagram_post` | 30 |
| YouTube | 256 GB | 12 h | 16:9 | `youtube` | — |

---

## Feature Details

### 1. Metadata Panel

- Fields: **Title** (text input), **Caption / Description** (textarea), **Platforms** (chip toggles)
- Platform chips: TikTok · IG Reel · IG Post · YouTube — multi-select, toggled on/off
- State persisted in `socialStore` — survives tab switches
- Active platforms drive hashtag generation, validation, and multi-export

### 2. Hashtag Panel

- Keyword input (pre-filled with title from metadata)
- "Generate" button → POST `/api/social/hashtags` with `{ title, description, platforms, api_key? }`
- Backend tries Claude API (`claude-haiku-4-5`) first; falls back to `hashtag_db.json` category match if no key or on error
- Response: array of `HashtagResult` — one per selected platform
- UI renders per-platform sections with tag cloud + "Copy [Platform]" button
- Copy writes the full `#tag1 #tag2 …` string to clipboard
- `hashtag_db.json` structure: `{ "travel": { "tiktok": [...30 tags], "instagram": [...10 tags] }, "fitness": {...}, ... }` — ~20 categories, ~500 tags total

### 3. Feed Mode Preview (right panel)

- Platform tab switcher at top: TikTok | IG Reel | IG Post | YouTube
- Each tab renders a CSS mock of the platform UI (phone chrome for TikTok/Instagram, browser chrome for YouTube)
- Actual video proxy `<video>` element embedded inside the mock — shared across tabs so playback state is preserved on switch
- Aspect ratios match platform: 9:16 for TikTok/IG Reel, 1:1 for IG Post, 16:9 for YouTube
- Username / caption / hashtag overlay pulled from metadata panel (live binding)
- No server calls — pure CSS + the existing proxy URL

### 4. Thumbnail Picker

**Client-side preview (instant):**
- HTML5 `<video>` seekbar — dragging updates `currentTime`
- `canvas.drawImage(video)` captures the current frame for preview
- Four auto-suggested frames shown below scrubber (at 0%, 25%, 50%, 75% of duration) — extracted server-side on panel mount via `/api/social/thumbnail/{media_id}?timestamp=N&preview=true`
- Title overlay toggle — shows `metadata.title` as a bottom-center text overlay on the canvas preview

**Server-side export (full resolution):**
- "Export PNG" → POST `/api/social/thumbnail/{media_id}` with `{ timestamp, overlay_text? }`
- Backend: `ffmpeg -ss {timestamp} -i {path} -vframes 1 output.png` + optional `drawtext` filter for overlay
- Returns file path; frontend triggers browser download

### 5. Platform Validation

- Runs **client-side** on every change to metadata or export settings — no server round-trip
- Checks per selected platform: duration vs. max, estimated file size vs. max
- File size estimated from: `duration × bitrate_kbps / 8 / 1024` (MB)
- Each violation shows: warning icon + plain-English message + one-line fix suggestion
  - Duration exceeded → "Trim to Xs, or use Auto Cut to remove silence"
  - Size exceeded → "Lower bitrate in Export settings"
- Green check shown when platform passes all checks

### 6. Multi-Platform Export

- Checkbox list of selected platforms (driven by `metadata.platforms`)
- "Export Selected Platforms" button → POST `/api/social/multi-export` with `{ project_id, platforms }`
- Backend creates one export job per platform sequentially, using existing `export_service` with the matching social preset
- Output filenames: `{project_name}_{platform}.mp4` (e.g. `travel_vlog_tiktok.mp4`)
- Frontend polls each job via existing `/api/export/{jobId}/status`
- Per-job status row shown: platform name + `● Queued / Running / Done / Error`
- On completion, each row shows a "Download" link (served via `/api/media/{id}/proxy` or direct file path endpoint) — no folder opener (web app constraint)

---

## Backend Implementation Notes

### `POST /api/social/hashtags`

```python
class HashtagRequest(BaseModel):
    title: str
    description: str = ""
    platforms: list[str]
    api_key: Optional[str] = None

# 1. Try Claude API (claude-haiku-4-5-20251001) with prompt:
#    "Generate hashtag sets for a video titled '{title}'. 
#     Return JSON: { "tiktok": [...30], "instagram": [...10] }"
# 2. On ImportError / missing key / API error → load hashtag_db.json,
#    find best matching category via simple keyword overlap,
#    return that category's tags
```

### `POST /api/social/thumbnail/{media_id}`

```python
class ThumbnailRequest(BaseModel):
    timestamp: float
    overlay_text: Optional[str] = None
    preview: bool = False  # True = small JPEG for suggestions, False = full PNG

# ffmpeg: -ss {timestamp} -i {path} -vframes 1
# If overlay_text: add drawtext filter
# If preview: scale to 320px wide
```

### `POST /api/social/multi-export`

```python
class MultiExportRequest(BaseModel):
    project_id: str
    platforms: list[SocialPlatform]

# For each platform:
#   preset = SOCIAL_PRESETS[platform]  # already in export_service.py
#   Fill ExportSettings with preset width/height/bitrate/fps + sensible defaults
#   (container="mp4", video_codec="libx264", audio_codec="aac", upload_to_drive=False)
#   job = await start_export(settings)
# Return list of { platform, job_id }
```

---

## File Checklist

### New files
- `frontend/src/components/social/SocialPanel.tsx`
- `frontend/src/components/social/FeedPreview.tsx`
- `frontend/src/components/social/ThumbnailPicker.tsx`
- `frontend/src/components/social/HashtagPanel.tsx`
- `frontend/src/components/social/MetadataPanel.tsx`
- `frontend/src/components/social/ValidationWarnings.tsx`
- `frontend/src/components/social/MultiExportPanel.tsx`
- `frontend/src/stores/socialStore.ts`
- `backend/routers/social.py`
- `backend/services/social_service.py`
- `backend/data/hashtag_db.json`

### Modified files
- `frontend/src/types/index.ts` — add `SocialPlatform`, `SocialMetadata`, `HashtagResult`, `MultiExportJob`; add `"social"` to `TabMode`
- `frontend/src/api/client.ts` — add `socialHashtags`, `socialThumbnail`, `socialMultiExport`, `socialValidate`
- `frontend/src/components/layout/TabBar.tsx` — add Social tab
- `frontend/src/App.tsx` — import `SocialPanel`, wire `activeTab === "social"`
- `backend/main.py` — register `social_router`
