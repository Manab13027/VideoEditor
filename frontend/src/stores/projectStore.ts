import { create } from "zustand";
import type { TabMode, Project, MediaFile, Timeline } from "../types";
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
  saveTimeline: (timeline: Timeline) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeTab: "edit",
  project: null,
  mediaFiles: [],

  setActiveTab: (tab) => set({ activeTab: tab }),

  initProject: async (name) => {
    const res = await createProject(name);
    set({ project: res.data });
  },

  setProject: (project) => set({ project }),

  addMediaFile: (file) =>
    set((state) => ({ mediaFiles: [...state.mediaFiles, file] })),

  removeMediaFile: (id) =>
    set((state) => ({ mediaFiles: state.mediaFiles.filter((f) => f.id !== id) })),

  saveTimeline: async (timeline) => {
    const { project } = get();
    if (!project) return;
    const res = await updateProject(project.id, { timeline });
    set({ project: res.data });
  },
}));
