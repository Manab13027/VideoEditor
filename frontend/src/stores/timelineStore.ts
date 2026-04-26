import { create } from "zustand";
import type { Clip, Overlay } from "../types";

interface TimelineState {
  mode: "storyboard" | "multitrack";
  clips: Clip[];
  overlays: Overlay[];
  selectedClipId: string | null;
  setMode: (mode: "storyboard" | "multitrack") => void;
  addClip: (clip: Omit<Clip, "order">) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  reorderClips: (clips: Clip[]) => void;
  insertClipAt: (clip: Omit<Clip, "order">, index: number) => void;
  selectClip: (id: string | null) => void;
  addOverlay: (overlay: Overlay) => void;
  removeOverlay: (mediaId: string) => void;
  clearTimeline: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  mode: "storyboard",
  clips: [],
  overlays: [],
  selectedClipId: null,

  setMode: (mode) => set({ mode }),

  addClip: (clip) =>
    set((state) => ({
      clips: [...state.clips, { ...clip, order: state.clips.length }],
    })),

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order: i })),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    })),

  updateClip: (id, patch) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  reorderClips: (clips) => set({ clips }),

  insertClipAt: (clip, index) =>
    set((state) => {
      const sorted = [...state.clips].sort((a, b) => a.order - b.order);
      sorted.splice(index, 0, { ...clip, order: index });
      return { clips: sorted.map((c, i) => ({ ...c, order: i })) };
    }),

  selectClip: (id) => set({ selectedClipId: id }),

  addOverlay: (overlay) =>
    set((state) => ({ overlays: [...state.overlays, overlay] })),

  removeOverlay: (mediaId) =>
    set((state) => ({
      overlays: state.overlays.filter((o) => o.media_id !== mediaId),
    })),

  clearTimeline: () =>
    set({ clips: [], overlays: [], selectedClipId: null }),
}));
