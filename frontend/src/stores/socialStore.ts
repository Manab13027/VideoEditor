import { create } from "zustand";
import type { HashtagResult, MultiExportJob, SocialMetadata, SocialPlatform } from "../types";

interface SocialState {
  metadata: SocialMetadata;
  hashtags: HashtagResult[];
  multiExportJobs: MultiExportJob[];
  setMetadata: (patch: Partial<SocialMetadata>) => void;
  setHashtags: (results: HashtagResult[]) => void;
  setMultiExportJobs: (jobs: MultiExportJob[] | ((prev: MultiExportJob[]) => MultiExportJob[])) => void;
  reset: () => void;
}

const DEFAULT_METADATA: SocialMetadata = {
  title: "",
  description: "",
  platforms: ["tiktok", "instagram_reel"] as SocialPlatform[],
  thumbnailTime: null,
};

export const useSocialStore = create<SocialState>((set) => ({
  metadata: DEFAULT_METADATA,
  hashtags: [],
  multiExportJobs: [],

  setMetadata: (patch) =>
    set((s) => ({ metadata: { ...s.metadata, ...patch } })),

  setHashtags: (results) => set({ hashtags: results }),

  setMultiExportJobs: (jobs) =>
    set((s) => ({
      multiExportJobs: typeof jobs === "function" ? jobs(s.multiExportJobs) : jobs,
    })),

  reset: () => set({ metadata: DEFAULT_METADATA, hashtags: [], multiExportJobs: [] }),
}));
