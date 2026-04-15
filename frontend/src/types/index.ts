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
