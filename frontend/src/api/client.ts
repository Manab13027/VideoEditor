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
  api.get(`/media/${id}`);

export const getMediaProxyUrl = (id: string): string =>
  `http://localhost:8000/api/media/${id}/proxy`;

export const getMediaThumbnailUrl = (id: string): string =>
  `http://localhost:8000/api/media/${id}/thumbnail`;

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
  api.post("/batch/start", { file_ids: fileIds, operations, output_dir: outputDir });

export const getBatchStatus = (jobId: string): Promise<{ data: BatchJob }> =>
  api.get(`/batch/${jobId}`);

// Export
export const startExport = (settings: ExportSettings): Promise<{ data: ExportJob }> =>
  api.post("/export/start", settings);

export const getExportStatus = (jobId: string): Promise<{ data: ExportJob }> =>
  api.get(`/export/${jobId}`);

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
