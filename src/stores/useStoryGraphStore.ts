import { create } from "zustand";
import type { GraphDocument } from "../lib/storyTypes";
interface StoryUI {
  selectedId: string | null;
  past: GraphDocument[];
  future: GraphDocument[];
  select: (id: string | null) => void;
  record: (document: GraphDocument) => void;
  reset: () => void;
}
export const useStoryGraphStore = create<StoryUI>((set) => ({
  selectedId: null,
  past: [],
  future: [],
  select: (selectedId) => set({ selectedId }),
  record: (document) =>
    set((s) => ({
      past: [...s.past.slice(-99), structuredClone(document)],
      future: [],
    })),
  reset: () => set({ selectedId: null, past: [], future: [] }),
}));
