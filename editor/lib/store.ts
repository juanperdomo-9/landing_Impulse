"use client";

import { useSyncExternalStore } from "react";
import { emptyProject } from "./project";
import type { Asset, AssetMeta, BrandKit, Project, Segment, Selection } from "./types";

export interface EditorState {
  project: Project;
  assets: Asset[];
  transcripts: Record<string, Segment[]>;
  selection: Selection;
  time: number;
  playing: boolean;
  busy: string | null; // long-running task message
  brand: BrandKit | null;
  /** ids of the style references chosen for the current video */
  activeRefs: string[];
  /** when set, the next tap on the video preview picks a color for this field */
  eyedropper: { id: string; apply: (hex: string) => void } | null;
  /** saved project currently open */
  projectId: string | null;
  projectName: string;
  saveState: "idle" | "saving" | "saved" | "local" | "error";
  /** files of an opened project that are not on this device (must be chosen again) */
  missingAssets: AssetMeta[];
  /** short notice shown at the bottom of the editor */
  toast: string | null;
  past: Project[];
  future: Project[];
}

let state: EditorState = {
  project: emptyProject(),
  assets: [],
  transcripts: {},
  selection: null,
  time: 0,
  playing: false,
  busy: null,
  brand: null,
  activeRefs: [],
  eyedropper: null,
  projectId: null,
  projectName: "Proyecto sin título",
  saveState: "idle",
  missingAssets: [],
  toast: null,
  past: [],
  future: [],
};

const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Change the project and record an undo step. */
  edit(fn: (p: Project) => Project) {
    const prev = state.project;
    const next = fn(prev);
    if (next === prev) return;
    store.set({ project: next, past: [...state.past.slice(-80), prev], future: [] });
  },
  undo() {
    const past = state.past;
    if (!past.length) return;
    const prev = past[past.length - 1];
    store.set({
      project: prev,
      past: past.slice(0, -1),
      future: [state.project, ...state.future],
      selection: null,
    });
  },
  redo() {
    const [next, ...rest] = state.future;
    if (!next) return;
    store.set({ project: next, past: [...state.past, state.project], future: rest, selection: null });
  },
  asset(id?: string) {
    return state.assets.find((a) => a.id === id);
  },
};

export function useEditor<T>(sel: (s: EditorState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => sel(state),
    () => sel(state),
  );
}

// handy for debugging from the browser console
if (typeof window !== "undefined") (window as unknown as { __impulsa: typeof store }).__impulsa = store;
