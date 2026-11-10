"use client";

import { getPlayer } from "./player";
import { store } from "./store";
import type { Asset, Project, Segment } from "./types";

/**
 * Keeps the current project in the browser (IndexedDB) so a reload, a crash or closing the tab does not
 * lose the work. The media files are stored too: they never leave the user's computer.
 */

const DB_NAME = "impulsa-editor";
const DB_VERSION = 1;
const MEDIA = "media";
const SESSION = "session";
const SESSION_KEY = "current";
const SAVE_DELAY = 800;

type AssetMeta = Omit<Asset, "url" | "file">;

interface SavedMedia {
  id: string;
  file: Blob;
  name: string;
  type: string;
}

interface SavedSession {
  project: Project;
  assets: AssetMeta[];
  transcripts: Record<string, Segment[]>;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA, { keyPath: "id" });
        if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const meta = ({ url: _url, file: _file, ...rest }: Asset): AssetMeta => rest;

/** Media ids already written to IndexedDB in this tab. */
const stored = new Set<string>();

async function save() {
  const s = store.get();
  const db = await openDb();

  // new media files first, then the project that references them
  const fresh = s.assets.filter((a) => !stored.has(a.id));
  if (fresh.length) {
    const tx = db.transaction(MEDIA, "readwrite");
    for (const a of fresh) {
      const media: SavedMedia = { id: a.id, file: a.file, name: a.file.name, type: a.file.type };
      tx.objectStore(MEDIA).put(media);
    }
    await done(tx);
    fresh.forEach((a) => stored.add(a.id));
  }

  const tx = db.transaction([SESSION, MEDIA], "readwrite");
  const session: SavedSession = {
    project: s.project,
    assets: s.assets.map(meta),
    transcripts: s.transcripts,
    savedAt: Date.now(),
  };
  tx.objectStore(SESSION).put(session, SESSION_KEY);
  // forget media that is no longer in the project
  const keep = new Set(s.assets.map((a) => a.id));
  const keys = await request(tx.objectStore(MEDIA).getAllKeys());
  for (const k of keys) if (!keep.has(String(k))) tx.objectStore(MEDIA).delete(k);
  await done(tx);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let failed = false;

/** Starts saving the project automatically after every change. Returns a function that stops it. */
export function startAutosave(): () => void {
  let last = store.get();
  const unsubscribe = store.subscribe(() => {
    const s = store.get();
    if (s.project === last.project && s.assets === last.assets && s.transcripts === last.transcripts) return;
    last = s;
    if (failed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      save().catch((e) => {
        // usually the browser is out of space (very large videos): keep editing, just without autosave
        failed = true;
        console.warn("No se pudo guardar el proyecto en el navegador", e);
        window.dispatchEvent(new CustomEvent("impulsa-autosave-error", { detail: (e as Error)?.message }));
      });
    }, SAVE_DELAY);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** The project saved in this browser, if there is one with content. */
export async function savedSession(): Promise<{ savedAt: number; clips: number } | null> {
  try {
    const db = await openDb();
    const session = await request<SavedSession | undefined>(
      db.transaction(SESSION).objectStore(SESSION).get(SESSION_KEY),
    );
    if (!session || !session.assets.length) return null;
    return { savedAt: session.savedAt, clips: session.project.clips.length };
  } catch {
    return null;
  }
}

/** Loads the saved project into the editor. Returns false when its files are no longer available. */
export async function restoreSession(): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction([SESSION, MEDIA]);
  const session = await request<SavedSession | undefined>(tx.objectStore(SESSION).get(SESSION_KEY));
  if (!session) return false;
  const medias = await Promise.all(
    session.assets.map((a) => request<SavedMedia | undefined>(tx.objectStore(MEDIA).get(a.id))),
  );
  if (medias.some((m) => !m)) return false;

  const assets: Asset[] = session.assets.map((a, i) => {
    const m = medias[i]!;
    const file = m.file instanceof File ? m.file : new File([m.file], m.name, { type: m.type });
    return { ...a, file, url: URL.createObjectURL(file) };
  });
  const player = getPlayer();
  for (const a of assets) await player?.addAsset(a);
  assets.forEach((a) => stored.add(a.id));
  store.set({
    project: session.project,
    assets,
    transcripts: session.transcripts ?? {},
    selection: null,
    time: 0,
    past: [],
    future: [],
  });
  return true;
}

/** Deletes the saved project (when the user chooses to start over). */
export async function clearSession() {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSION, MEDIA], "readwrite");
    tx.objectStore(SESSION).delete(SESSION_KEY);
    tx.objectStore(MEDIA).clear();
    await done(tx);
    stored.clear();
  } catch {
    /* nothing saved */
  }
}
