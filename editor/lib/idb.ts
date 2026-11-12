"use client";

/** Tiny IndexedDB wrapper: big files (videos) stay on this device, keyed by asset id. */

const DB = "impulsa-studio";
const VERSION = 1;
export const MEDIA = "media";
export const PROJECTS = "projects";

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(MEDIA)) d.createObjectStore(MEDIA);
        if (!d.objectStoreNames.contains(PROJECTS)) d.createObjectStore(PROJECTS);
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      }),
  );
}

export const idbGet = <T>(store: string, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: string, key: string, value: unknown) => run<IDBValidKey>(store, "readwrite", (s) => s.put(value, key));
export const idbDelete = (store: string, key: string) => run<undefined>(store, "readwrite", (s) => s.delete(key));
export const idbAll = <T>(store: string) => run<T[]>(store, "readonly", (s) => s.getAll());

/** Ask the browser not to evict our files when space runs low (best effort). */
export function persistStorage() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
