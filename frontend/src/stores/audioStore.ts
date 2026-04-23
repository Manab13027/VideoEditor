import { create } from "zustand";
import type { AudioTrack, BeatMarker, EQSettings, NoiseReductionSettings } from "../types";

const DEFAULT_EQ: EQSettings = { bass: 0, mid: 0, presence: 0, treble: 0 };
const DEFAULT_NR: NoiseReductionSettings = { enabled: false, strength: 0 };

interface AudioState {
  tracks: AudioTrack[];
  beatMarkers: BeatMarker[];
  eq: EQSettings;
  noiseReduction: NoiseReductionSettings;
  addTrack: (track: AudioTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<AudioTrack>) => void;
  setBeatMarkers: (markers: BeatMarker[]) => void;
  setEQ: (patch: Partial<EQSettings>) => void;
  setNoiseReduction: (patch: Partial<NoiseReductionSettings>) => void;
  reset: () => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  tracks: [],
  beatMarkers: [],
  eq: DEFAULT_EQ,
  noiseReduction: DEFAULT_NR,

  addTrack: (track) =>
    set((s) => ({ tracks: [...s.tracks, track] })),

  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),

  updateTrack: (id, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  setBeatMarkers: (markers) => set({ beatMarkers: markers }),

  setEQ: (patch) =>
    set((s) => ({ eq: { ...s.eq, ...patch } })),

  setNoiseReduction: (patch) =>
    set((s) => ({ noiseReduction: { ...s.noiseReduction, ...patch } })),

  reset: () => set({ tracks: [], beatMarkers: [], eq: DEFAULT_EQ, noiseReduction: DEFAULT_NR }),
}));
