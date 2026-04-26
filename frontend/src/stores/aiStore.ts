import { create } from "zustand";
import type { Caption } from "../types";

interface AIState {
  // Per-media captions
  captions: Record<string, Caption[]>;      // mediaId → segments
  showCaptions: boolean;

  // Job tracking (one active job at a time per feature)
  jobs: Record<string, { status: "idle" | "running" | "done" | "error"; result?: unknown; error?: string }>;

  // Generated video URL
  generatedVideoUrl: string | null;

  // Actions
  setCaptions: (mediaId: string, captions: Caption[]) => void;
  toggleCaptions: () => void;
  setJobStatus: (key: string, status: "idle" | "running" | "done" | "error", result?: unknown, error?: string) => void;
  setGeneratedVideo: (url: string | null) => void;
  clearJob: (key: string) => void;
}

export const useAIStore = create<AIState>((set) => ({
  captions: {},
  showCaptions: true,
  jobs: {},
  generatedVideoUrl: null,

  setCaptions: (mediaId, captions) =>
    set((s) => ({ captions: { ...s.captions, [mediaId]: captions } })),

  toggleCaptions: () => set((s) => ({ showCaptions: !s.showCaptions })),

  setJobStatus: (key, status, result, error) =>
    set((s) => ({ jobs: { ...s.jobs, [key]: { status, result, error } } })),

  setGeneratedVideo: (url) => set({ generatedVideoUrl: url }),

  clearJob: (key) =>
    set((s) => {
      const { [key]: _, ...rest } = s.jobs;
      return { jobs: rest };
    }),
}));
