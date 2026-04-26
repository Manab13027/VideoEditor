# Audio Editing Suite + Mixed Media Composition — Design Spec
**Date:** 2026-04-22  
**Status:** Approved

---

## Goal

Extend ClipForge's Edit tab with a full audio editing suite and mixed media composition capability. Users can arrange video clips and images on the timeline, overlay imported audio tracks (background music, voice-over), apply noise reduction and EQ, detect beats with auto-cut, and export everything as a single video.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audio processing location | Server-side (Python + ffmpeg + librosa) | Consistent results; fits existing backend pattern; DSP libraries unavailable in-browser |
| Voice-over input | Import audio file (no live recording) | Simpler, no mic permission complexity, works for all use cases |
| Beat detection output | Markers on timeline + "Auto-cut to Beats" button | Gives user control rather than forcing auto-cuts |
| Image duration | Global default (3 s) + per-image override | Flexible without being overwhelming |
| Layout | Audio tracks in Timeline + Audio tab in PropertiesPanel | Fits existing panel layout without compressing timeline |

---

## Out of Scope

- Live microphone recording
- Real-time audio preview processing (EQ/NR applied at export only)
- MIDI or DAW-style multi-track mixing
- Animated GIFs as timeline items
- Direct platform upload of composed output

---

## Architecture

### Frontend

**New directory:** `frontend/src/components/audio/`

| Component | Responsibility |
|---|---|
| `AudioTrackRow.tsx` | One row per audio track (Original, Music, Voice-over) — waveform canvas + mute toggle + volume slider + beat marker overlay |
| `WaveformDisplay.tsx` | Canvas rendering of normalized amplitude array |
| `BeatMarkers.tsx` | Vertical tick marks at beat timestamps, scaled to track row height |
| `AudioPropertiesTab.tsx` | EQ sliders (Bass/Mid/Presence/Treble), noise reduction strength, "Detect Beats" + "Auto-cut to Beats" buttons |

**Modified components:**
- `Timeline.tsx` — append `AudioTrackRow` rows below video/image clip rows; handle image clip rendering with duration handles
- `PropertiesPanel.tsx` — add "Audio" tab (shows `AudioPropertiesTab`); add "Duration" field when image clip selected; add global default image duration when nothing selected
- `MediaBrowser.tsx` — accept image MIME types (JPG, PNG, WEBP); badge images with photo icon

**New store:** `frontend/src/stores/audioStore.ts`

**Modified store:** `frontend/src/stores/projectStore.ts` — add `defaultImageDuration: number` to project settings

**Modified API client:** `frontend/src/api/client.ts` — add `audioImport`, `audioWaveform`, `audioBeats`, `audioNoiseReduce`, `audioEQ`, `audioSync`

### Backend

**New router:** `backend/routers/audio.py` — prefix `/api/audio`  
**New service:** `backend/services/audio_service.py`

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/audio/import` | POST | Accept music or voice-over file; return `media_id` + waveform amplitude array |
| `/api/audio/waveform/{media_id}` | GET | Return normalized amplitude array (~200 points) for canvas rendering |
| `/api/audio/beats/{media_id}` | POST | librosa `beat_track()` → return beat timestamp array |
| `/api/audio/noise-reduce` | POST | Apply ffmpeg `anlmdn` filter to original audio at export |
| `/api/audio/eq` | POST | Apply ffmpeg `equalizer` filter chain (4 bands) |
| `/api/audio/sync` | POST | Trim or loop music track to match video/composition duration |

**Modified service:** `backend/services/export_service.py` — handle mixed image+video concat; mix audio tracks via `amix`

**Modified router:** `backend/routers/media.py` — accept image MIME types in upload endpoint

Register in `backend/main.py`: `from backend.routers.audio import router as audio_router` + `app.include_router(audio_router)`

---

## Data Models

Add to `frontend/src/types/index.ts`:

```typescript
export type MediaType = "video" | "audio" | "image";

export type AudioTrackType = "original" | "music" | "voiceover";

export interface AudioTrack {
  id: string;
  type: AudioTrackType;
  mediaId: string;
  name: string;
  volume: number;       // 0.0 – 1.0
  offset: number;       // seconds from composition start
  muted: boolean;
  waveform: number[];   // normalized amplitude array (0–1), ~200 points
}

export interface BeatMarker {
  timestamp: number;    // seconds
  strength: number;     // 0–1, drives marker opacity/height
}

export interface EQSettings {
  bass: number;         // -12 to +12 dB at 80 Hz
  mid: number;          // -12 to +12 dB at 1 kHz
  presence: number;     // -12 to +12 dB at 4 kHz
  treble: number;       // -12 to +12 dB at 8 kHz
}

export interface NoiseReductionSettings {
  enabled: boolean;
  strength: number;     // 0.0 – 1.0
}

export interface AudioStoreState {
  tracks: AudioTrack[];
  beatMarkers: BeatMarker[];
  eq: EQSettings;
  noiseReduction: NoiseReductionSettings;
}

export interface ProjectSettings {
  defaultImageDuration: number;  // seconds, default 3
}
```

Extend existing `TimelineClip` (or equivalent) with:
```typescript
mediaType: MediaType;       // "video" | "image"
duration?: number;          // required for image clips; optional override for video
```

---

## Feature Details

### 1. Background Music Sync
- Import audio file → `POST /api/audio/import` → music track added to Timeline
- "Sync to Video" button → `POST /api/audio/sync` — trims or loops music to match total composition duration
- Per-track volume slider (0–100%) — mixed at export via ffmpeg `amix` with `weights` parameter

### 2. Voice-over Import
- Import audio file typed as `"voiceover"` — same import endpoint, `type` param distinguishes
- Track offset is draggable on Timeline (snaps to beat markers if detected)
- Superimposed over images and video clips identically — position is just a time offset

### 3. Noise Reduction
- Strength slider (0–100%) in AudioPropertiesTab, targets `"original"` track only
- Applied at export via ffmpeg `anlmdn` filter: slider 0–100 mapped linearly to `anlmdn` `s` parameter range 0.00001–10 (log scale recommended in implementation)
- No real-time preview — export-time only

### 4. Audio Equalizer
- 4-band EQ sliders in AudioPropertiesTab: Bass (80 Hz), Mid (1 kHz), Presence (4 kHz), Treble (8 kHz)
- Range: -12 to +12 dB per band
- Applied at export via ffmpeg `equalizer` filter chain (one filter per non-zero band)
- Targets the final mixed audio output

### 5. Beat Detection + Auto-cut
- "Detect Beats" → `POST /api/audio/beats/{media_id}` (targets music track)
- Backend: `librosa.beat_track(y, sr)` → returns beat timestamps in seconds
- Frontend: `setBeatMarkers()` in audioStore → `BeatMarkers` component renders ticks on music track row
- "Auto-cut to Beats" → iterates beat timestamps, inserts cut points into `timelineStore` at each timestamp
- User can then delete unwanted cuts manually

### 6. Mixed Media Timeline (Images + Video)
- MediaBrowser accepts images (JPG, PNG, WEBP) via `POST /api/media/upload` (extend accepted MIME types)
- Images dropped onto Timeline create clips with `mediaType: "image"` and `duration = defaultImageDuration`
- Drag right edge of image clip to set per-image duration
- PropertiesPanel "Duration" field when image clip selected (number input, seconds)
- Global default duration in PropertiesPanel footer when nothing selected (persisted in projectStore)

### 7. Mixed Export (ffmpeg concat + amix)
Build ffmpeg command dynamically:
1. For each timeline clip in order:
   - Video clip: `-i {path} -ss {start} -to {end}`
   - Image clip: `-loop 1 -t {duration} -i {path}`
2. `concat` filter: `[0:v][1:v]...[n:v]concat=n={count}:v=1:a=0[outv]`
3. Audio tracks mixed: `[a0][a1][a2]amix=inputs=3:weights={vol0} {vol1} {vol2}[outa]`
4. Noise reduction applied to original audio input before amix
5. EQ applied to final `[outa]` output

---

## File Checklist

### New files
- `frontend/src/components/audio/AudioTrackRow.tsx`
- `frontend/src/components/audio/WaveformDisplay.tsx`
- `frontend/src/components/audio/BeatMarkers.tsx`
- `frontend/src/components/audio/AudioPropertiesTab.tsx`
- `frontend/src/stores/audioStore.ts`
- `backend/routers/audio.py`
- `backend/services/audio_service.py`

### Modified files
- `frontend/src/types/index.ts` — new types above
- `frontend/src/api/client.ts` — audio API calls
- `frontend/src/components/edit/Timeline.tsx` — audio track rows + image clip support
- `frontend/src/components/edit/PropertiesPanel.tsx` — Audio tab + image duration fields
- `frontend/src/components/edit/MediaBrowser.tsx` — image MIME type support
- `frontend/src/stores/projectStore.ts` — `defaultImageDuration` in project settings
- `backend/main.py` — register `audio_router`
- `backend/routers/media.py` — accept image MIME types
- `backend/services/export_service.py` — mixed concat + amix export pipeline
