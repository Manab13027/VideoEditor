import axios from "axios";
import type {
  MediaFile,
  Project,
  Timeline,
  BatchOperation,
  BatchJob,
  ExportSettings,
  ExportJob,
} from "../types";

export const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

// Media
export const uploadMedia = (file: File): Promise<{ data: MediaFile }> => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/media/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getMediaInfo = (id: string): Promise<{ data: MediaFile }> =>
  api.get(`/media/${id}/info`);

export const applyCrop = (
  id: string,
  crop: { x: number; y: number; w: number; h: number }
): Promise<{ data: MediaFile }> => api.post(`/media/${id}/crop`, crop);

export const mergeClips = (
  clips: Array<{ media_id: string; trim_start: number; trim_end: number | null }>
): Promise<{ data: MediaFile }> =>
  api.post("/media/merge", {
    clips: clips.map((c) => ({ ...c, media_id: Number(c.media_id) })),
  });

export const getMediaProxyUrl = (id: string, bust?: number): string =>
  `http://localhost:8000/api/media/${id}/proxy${bust ? `?t=${bust}` : ""}`;

export const getMediaThumbnailUrl = (id: string): string =>
  `http://localhost:8000/api/media/${id}/thumbnail`;

export const getMediaDownloadUrl = (id: string): string =>
  `http://localhost:8000/api/media/${id}/download`;

// Projects
export const createProject = (name: string): Promise<{ data: Project }> =>
  api.post("/projects", { name });

export const getProject = (id: string): Promise<{ data: Project }> =>
  api.get(`/projects/${id}`);

export const updateProject = (
  id: string,
  update: Partial<{ name: string; timeline: Timeline }>
): Promise<{ data: Project }> => api.put(`/projects/${id}`, update);

export const deleteProject = (id: string): Promise<{ data: void }> =>
  api.delete(`/projects/${id}`);

// Batch
export const startBatchJob = (
  fileIds: string[],
  operations: BatchOperation[],
  outputDir?: string
): Promise<{ data: BatchJob }> =>
  api.post("/batch", { file_ids: fileIds, operations, output_dir: outputDir });

export const getBatchStatus = (jobId: string): Promise<{ data: BatchJob }> =>
  api.get(`/batch/${jobId}/status`);

// Export
export const startExport = (settings: ExportSettings): Promise<{ data: ExportJob }> =>
  api.post("/export", settings);

export const getExportStatus = (jobId: string): Promise<{ data: ExportJob }> =>
  api.get(`/export/${jobId}/status`);

// Drive
export const getDriveStatus = (): Promise<{ data: { authenticated: boolean; email?: string } }> =>
  api.get("/drive/status");

export const startDriveAuth = (): Promise<{ data: { auth_url: string } }> =>
  api.post("/drive/auth");

export const uploadToDrive = (
  filePath: string,
  folderId?: string
): Promise<{ data: { file_id: string; web_view_link: string } }> =>
  api.post("/drive/upload", { file_path: filePath, folder_id: folderId });

// AI
export const aiTranscribe = (mediaId: string, language?: string) =>
  api.post(`/ai/captions/${mediaId}`, { language });

export const aiBurnSubtitles = (mediaId: string, style?: string) =>
  api.post(`/ai/captions/${mediaId}/burn`, { style });

export const aiRemoveBg = (mediaId: string) =>
  api.post(`/ai/remove-bg/${mediaId}`);

export const aiAutoCut = (mediaId: string, thresholdDb?: number, minDuration?: number) =>
  api.post(`/ai/auto-cut/${mediaId}`, { threshold_db: thresholdDb, min_duration: minDuration });

export const aiReframe = (mediaId: string, targetWidth?: number, targetHeight?: number) =>
  api.post(`/ai/reframe/${mediaId}`, { target_width: targetWidth, target_height: targetHeight });

export const aiEnhanceFace = (mediaId: string) =>
  api.post(`/ai/enhance/${mediaId}`);

export const aiTrackObject = (mediaId: string, bbox: [number, number, number, number]) =>
  api.post(`/ai/track/${mediaId}`, { bbox });

export const aiGenerateVideo = (prompt: string, duration?: number, apiToken?: string) =>
  api.post(`/ai/generate`, { prompt, duration, api_token: apiToken });

// WebSocket
export const connectProgressWS = (
  jobId: string,
  onMessage: (data: unknown) => void
): WebSocket => {
  const ws = new WebSocket(`ws://localhost:8000/ws/progress/${jobId}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      onMessage(event.data);
    }
  };
  return ws;
};

// Social
export const socialHashtags = (body: {
  title: string;
  description?: string;
  platforms: string[];
  api_key?: string;
}) => api.post("/social/hashtags", body);

export const socialThumbnail = (
  mediaId: string,
  timestamp: number,
  overlayText?: string
): string =>
  `http://localhost:8000/api/social/thumbnail/${mediaId}?timestamp=${timestamp}${overlayText ? `&overlay_text=${encodeURIComponent(overlayText)}` : ""}`;

export const socialThumbnailSuggest = (mediaId: string) =>
  api.get(`/social/thumbnail/${mediaId}/suggestions`);

export const socialMultiExport = (body: {
  project_id: string;
  platforms: string[];
}) => api.post("/social/multi-export", body);

export const socialValidate = () => api.get("/social/limits");

// Audio
export const audioImport = (
  file: File,
  trackType: "music" | "voiceover"
): Promise<{ data: { media_id: string; filename: string; waveform: number[]; duration: number } }> => {
  const form = new FormData();
  form.append("file", file);
  form.append("track_type", trackType);
  return api.post("/audio/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const audioWaveform = (
  mediaId: string
): Promise<{ data: { waveform: number[] } }> =>
  api.get(`/audio/waveform/${mediaId}`);

export const audioBeats = (
  mediaId: string
): Promise<{ data: { beats: number[] } }> =>
  api.post(`/audio/beats/${mediaId}`);

export const audioSync = (body: {
  media_id: string;
  target_duration: number;
}): Promise<{ data: { output_media_id: string } }> =>
  api.post("/audio/sync", body);
