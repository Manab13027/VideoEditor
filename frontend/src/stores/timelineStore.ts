import { create } from "zustand";
import type { Clip, Overlay } from "../types";

interface TimelineState {
  mode: "storyboard" | "multitrack";
  clips: Clip[];
  overlays: Overlay[];
  selectedClipId: string | null;
  selectedClipIds: string[];
  cropMode: boolean;
  currentPreviewTime: number;
  setMode: (mode: "storyboard" | "multitrack") => void;
  setCropMode: (on: boolean) => void;
  setCurrentPreviewTime: (t: number) => void;
  addClip: (clip: Omit<Clip, "order">) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  reorderClips: (clips: Clip[]) => void;
  selectClip: (id: string | null) => void;
  toggleClipSelection: (id: string, addToSelection: boolean) => void;
  clearClipSelection: () => void;
  splitClipAt: (id: string, time: number) => void;
  addOverlay: (overlay: Overlay) => void;
  removeOverlay: (mediaId: string) => void;
  clearTimeline: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  mode: "storyboard",
  clips: [],
  overlays: [],
  selectedClipId: null,
  selectedClipIds: [],
  cropMode: false,
  currentPreviewTime: 0,

  setMode: (mode) => set({ mode }),
  setCropMode: (on) => set({ cropMode: on }),
  setCurrentPreviewTime: (t) => set({ currentPreviewTime: t }),

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
      selectedClipIds: state.selectedClipIds.filter((x) => x !== id),
    })),

  updateClip: (id, patch) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  reorderClips: (clips) => set({ clips }),

  selectClip: (id) => set({ selectedClipId: id }),

  toggleClipSelection: (id, addToSelection) =>
    set((state) => {
      if (addToSelection) {
        const already = state.selectedClipIds.includes(id);
        return {
          selectedClipIds: already
            ? state.selectedClipIds.filter((x) => x !== id)
            : [...state.selectedClipIds, id],
        };
      }
      return { selectedClipIds: [id], selectedClipId: id };
    }),

  clearClipSelection: () => set({ selectedClipIds: [] }),

  splitClipAt: (id, time) => {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;

    const start = clip.trim_start ?? 0;
    const end = clip.trim_end ?? null;
    // time must be within the clip's active range
    if (time <= start || (end !== null && time >= end)) return;

    const clipA: Clip = { ...clip, trim_end: time };
    const clipB: Clip = {
      ...clip,
      id: `${clip.id}_split_${Date.now()}`,
      trim_start: time,
      trim_end: end,
    };

    set((state) => {
      const others = state.clips.filter((c) => c.id !== id);
      const before = others.filter((c) => c.order < clip.order);
      const after = others.filter((c) => c.order >= clip.order);
      const newClips = [
        ...before,
        { ...clipA, order: clip.order },
        { ...clipB, order: clip.order + 0.5 },
        ...after,
      ].map((c, i) => ({ ...c, order: i }));
      return { clips: newClips, selectedClipId: clipA.id };
    });
  },

  addOverlay: (overlay) =>
    set((state) => ({ overlays: [...state.overlays, overlay] })),

  removeOverlay: (mediaId) =>
    set((state) => ({
      overlays: state.overlays.filter((o) => o.media_id !== mediaId),
    })),

  clearTimeline: () =>
    set({ clips: [], overlays: [], selectedClipId: null }),
}));
