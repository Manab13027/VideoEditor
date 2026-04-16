import { create } from "zustand";
import type { MediaFile, BatchOperation, BatchJob } from "../types";

interface BatchState {
  files: MediaFile[];
  selectedFileIds: Set<string>;
  operations: BatchOperation[];
  activeJob: BatchJob | null;
  addFiles: (files: MediaFile[]) => void;
  removeFile: (id: string) => void;
  toggleFileSelection: (id: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;
  addOperation: (op: BatchOperation) => void;
  removeOperation: (index: number) => void;
  updateOperation: (index: number, patch: Partial<BatchOperation>) => void;
  setActiveJob: (job: BatchJob | null) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>((set) => ({
  files: [],
  selectedFileIds: new Set(),
  operations: [],
  activeJob: null,

  addFiles: (files) =>
    set((state) => {
      const existing = new Set(state.files.map((f) => f.id));
      const newFiles = files.filter((f) => !existing.has(f.id));
      const newIds = new Set([
        ...state.selectedFileIds,
        ...newFiles.map((f) => f.id),
      ]);
      return {
        files: [...state.files, ...newFiles],
        selectedFileIds: newIds,
      };
    }),

  removeFile: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedFileIds);
      newIds.delete(id);
      return {
        files: state.files.filter((f) => f.id !== id),
        selectedFileIds: newIds,
      };
    }),

  toggleFileSelection: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedFileIds);
      if (newIds.has(id)) {
        newIds.delete(id);
      } else {
        newIds.add(id);
      }
      return { selectedFileIds: newIds };
    }),

  selectAllFiles: () =>
    set((state) => ({
      selectedFileIds: new Set(state.files.map((f) => f.id)),
    })),

  deselectAllFiles: () => set({ selectedFileIds: new Set() }),

  addOperation: (op) =>
    set((state) => ({ operations: [...state.operations, op] })),

  removeOperation: (index) =>
    set((state) => ({
      operations: state.operations.filter((_, i) => i !== index),
    })),

  updateOperation: (index, patch) =>
    set((state) => ({
      operations: state.operations.map((op, i) =>
        i === index ? { ...op, ...patch } : op
      ),
    })),

  setActiveJob: (job) => set({ activeJob: job }),

  clearBatch: () =>
    set({ files: [], selectedFileIds: new Set(), operations: [], activeJob: null }),
}));
