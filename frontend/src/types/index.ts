export interface MediaFile {
  id: string;
  project_id?: string | null;
  filename: string;
  media_type: "video" | "image" | "audio";
  format: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  proxy_path: string | null;
  thumbnail_path: string | null;
  created_at?: string;
}

export interface ClipColor {
  brightness: number; // 0–2, 1 = normal
  contrast: number;   // 0–2, 1 = normal
  saturation: number; // 0–2, 1 = normal
  hue: number;        // degrees, 0–360
}

export type FilterPreset =
  | "grayscale" | "sepia" | "vintage" | "vivid" | "cool" | "warm"
  | "teal_orange" | "matte" | "film_noir" | "golden" | "cyberpunk" | "faded";

export interface CurvePoint { x: number; y: number; }  // 0–255

export interface ColorCurves {
  rgb: CurvePoint[];
  r:   CurvePoint[];
  g:   CurvePoint[];
  b:   CurvePoint[];
}

export interface ColorRange { r: number; g: number; b: number; }  // –0.5 to 0.5

export interface ColorWheels {
  shadows:    ColorRange;
  midtones:   ColorRange;
  highlights: ColorRange;
}

export interface ClipEffects {
  motion_blur: number;  // 0–1
  glow:        number;  // 0–1
  shake:       number;  // 0–1
}

export type TransitionType =
  | "none"
  | "fade"
  | "crossfade"
  | "wipe_left"
  | "wipe_right"
  | "wipe_up"
  | "wipe_down"
  | "slide_left"
  | "slide_right"
  | "zoom_in"
  | "zoom_out"
  | "blur"
  | "flash"
  | "glitch"
  | "pixelate"
  | "film_burn"
  | "radial"
  | "circle"
  | "reveal"
  | "fade_black"
  | "fade_white";

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
  color?: ClipColor | null;
  filter?: FilterPreset | null;
  rotate?: 0 | 90 | 180 | 270;
  reversed?: boolean;
  fade_in?: number;
  fade_out?: number;
  curves?: ColorCurves | null;
  wheels?: ColorWheels | null;
  effects?: Partial<ClipEffects> | null;
  transition_in?: TransitionType;
  transition_dur?: number;
  captions?: Caption[];
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
  audioTracks?: AudioTrack[];
  muteOriginal?: boolean;
}

export interface Project {
  id: string;
  name: string;
  timeline: Timeline;
  created_at: string;
  updated_at: string;
}

export interface BatchOperation {
  type: string;
  target_format?: string;
  codec?: string;
  width?: number;
  height?: number;
  quality?: number;
  [key: string]: unknown;
}

export interface BatchFileResult {
  file_id: string;
  filename: string;
  status: string;
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
  bitrate?: number;
  fps: number;
  quality_tier?: string;
  output_dir?: string;
  upload_to_drive: boolean;
  drive_folder_id?: string;
  audio_settings?: AudioExportSettings;
}

export interface ExportJob {
  id: string;
  status: string;
  progress: number;
  output_path: string | null;
  error: string | null;
  created_at: string;
}

export type TabMode = "edit" | "batch" | "export" | "ai" | "social" | "help";

export type CaptionTransition = "none" | "fade" | "slide-up" | "slide-down" | "pop" | "bounce";
export type CaptionPosition   = "bottom" | "middle" | "top";

export interface CaptionStyle {
  fontSize:   number;          // px, 12–72
  fontFamily: string;
  bold:       boolean;
  italic:     boolean;
  color:      string;          // hex
  bgOpacity:  number;          // 0–1
  transition: CaptionTransition;
  position:   CaptionPosition;
}

export interface Caption {
  start: number;
  end:   number;
  text:  string;
  style?: Partial<CaptionStyle>;
}

export interface AIJob {
  type:     string;
  mediaId:  string;
  status:   "idle" | "running" | "done" | "error";
  result?:  unknown;
  error?:   string;
}

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

export type AudioTrackType = "original" | "music" | "voiceover";

export interface AudioTrack {
  id: string;
  type?: AudioTrackType;
  mediaId?: string;
  name: string;
  volume: number;         // 0.0 – 1.0
  offset?: number;        // seconds from composition start
  time_start?: number;    // alias for offset used in AudioTrack component
  trim_start?: number;    // seconds into the audio file to start playing
  trim_end?: number | null; // seconds into the audio file to stop playing
  muted: boolean;
  waveform: number[];     // normalized amplitude array (0–1), ~200 points
  duration?: number | null; // seconds to play; null = full duration
  fade_in?: number;       // seconds, 0 = no fade
  fade_out?: number;      // seconds, 0 = no fade
}

export interface BeatMarker {
  id?: string;
  time?: number;        // seconds (alias for timestamp)
  timestamp?: number;   // seconds
  strength: number;     // 0–1
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

export interface AudioExportTrack {
  mediaId: string;
  volume: number;
  offset: number;
}

export interface AudioExportSettings {
  tracks: AudioExportTrack[];
  eq: EQSettings;
  noiseReductionStrength: number;
}
