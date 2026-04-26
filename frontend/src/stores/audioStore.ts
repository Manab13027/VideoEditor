import { create } from "zustand";
import type { AudioTrack, BeatMarker, EQSettings, NoiseReductionSettings } from "../types";

const DEFAULT_EQ: EQSettings = { bass: 0, mid: 0, presence: 0, treble: 0 };
const DEFAULT_NR: NoiseReductionSettings = { enabled: false, strength: 0 };

interface AudioState {
  tracks: AudioTrack[];
  beatMarkers: BeatMarker[];
  eq: EQSettings;
  noiseReduction: NoiseReductionSettings;
  muteOriginal: boolean;
  addTrack: (track: AudioTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<AudioTrack>) => void;
  setBeatMarkers: (markers: BeatMarker[]) => void;
  setEQ: (patch: Partial<EQSettings>) => void;
  setNoiseReduction: (patch: Partial<NoiseReductionSettings>) => void;
  setMuteOriginal: (v: boolean) => void;
  reset: () => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  tracks: [],
  beatMarkers: [],
  eq: DEFAULT_EQ,
  noiseReduction: DEFAULT_NR,
  muteOriginal: false,

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

  setMuteOriginal: (v) => set({ muteOriginal: v }),

  reset: () => set({ tracks: [], beatMarkers: [], eq: DEFAULT_EQ, noiseReduction: DEFAULT_NR, muteOriginal: false }),
}));
