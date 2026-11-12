"use client";

import { withBase } from "./paths";
import { idbAll, idbDelete, idbGet, idbPut, MEDIA, PROJECTS } from "./idb";
import { probeFile } from "./media";
import { getPlayer } from "./player";
import { emptyProject } from "./project";
import { store } from "./store";
import type { Asset, AssetMeta, Project, Segment } from "./types";

/**
 * Saved projects. The edit (timeline, texts, subtitles, transcripts…) is saved to the account when
 * accounts are set up, and always to this device as well. Media files stay on the device (IndexedDB).
 */

export interface ProjectData {
  version: 1;
  project: Project;
  assets: AssetMeta[];
  transcripts: Record<string, Segment[]>;
  activeRefs: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumb: string | null;
  updated_at: string;
}

interface LocalRecord extends ProjectSummary {
  data: ProjectData;
}

const meta = (a: Asset): AssetMeta => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  duration: a.duration,
  width: a.width,
  height: a.height,
  size: a.file.size,
  type: a.file.type,
});

export function newProjectId() {
  return crypto.randomUUID();
}

function currentData(): ProjectData {
  const s = store.get();
  return {
    version: 1,
    project: s.project,
    assets: [...s.assets.map(meta), ...s.missingAssets],
    transcripts: s.transcripts,
    activeRefs: s.activeRefs,
  };
}

/** Saves the open project (account + this device). Returns where it ended up. */
export async function saveCurrentProject(): Promise<"cuenta" | "dispositivo"> {
  const s = store.get();
  const id = s.projectId ?? newProjectId();
  if (!s.projectId) store.set({ projectId: id });
  const data = currentData();
  let thumb: string | null = null;
  try {
    const shot = getPlayer()?.snapshot(240);
    if (shot && s.project.clips.length) thumb = `data:image/jpeg;base64,${shot}`;
  } catch {
    /* canvas not ready */
  }
  const record: LocalRecord = { id, name: s.projectName, thumb, updated_at: new Date().toISOString(), data };
  await idbPut(PROJECTS, id, record).catch(() => undefined);
  try {
    const res = await fetch(withBase(`/api/projects/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.projectName, data, thumb }),
    });
    if (res.ok) return "cuenta";
  } catch {
    /* offline or accounts not configured */
  }
  return "dispositivo";
}

/** Projects of the account, or of this device when accounts are not available. */
export async function listProjects(): Promise<{ projects: ProjectSummary[]; where: "cuenta" | "dispositivo" }> {
  try {
    const res = await fetch(withBase("/api/projects"), { cache: "no-store" });
    if (res.ok) return { projects: (await res.json()).projects, where: "cuenta" };
  } catch {
    /* fall back to this device */
  }
  const local = await idbAll<LocalRecord>(PROJECTS).catch(() => []);
  return {
    projects: local
      .map(({ id, name, thumb, updated_at }) => ({ id, name, thumb, updated_at }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    where: "dispositivo",
  };
}

export async function deleteProject(id: string) {
  await idbDelete(PROJECTS, id).catch(() => undefined);
  await fetch(withBase(`/api/projects/${id}`), { method: "DELETE" }).catch(() => undefined);
}

export async function renameProject(id: string, name: string) {
  const local = await idbGet<LocalRecord>(PROJECTS, id).catch(() => undefined);
  if (local) await idbPut(PROJECTS, id, { ...local, name }).catch(() => undefined);
  // the account copy needs the data too: load it, then save with the new name
  try {
    const res = await fetch(withBase(`/api/projects/${id}`));
    if (res.ok) {
      const { project } = await res.json();
      await fetch(withBase(`/api/projects/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: project.data, thumb: local?.thumb ?? null }),
      });
    }
  } catch {
    /* offline */
  }
}

async function fetchProject(id: string): Promise<{ name: string; data: ProjectData; cloud: boolean } | null> {
  try {
    const res = await fetch(withBase(`/api/projects/${id}`), { cache: "no-store" });
    if (res.ok) {
      const { project } = await res.json();
      return { name: project.name, data: project.data, cloud: true };
    }
  } catch {
    /* try this device */
  }
  const local = await idbGet<LocalRecord>(PROJECTS, id).catch(() => undefined);
  return local ? { name: local.name, data: local.data, cloud: false } : null;
}

/** Opens a saved project in the editor; files missing on this device are listed in missingAssets. */
export async function openProject(id: string): Promise<boolean> {
  store.set({ busy: "Abriendo proyecto…" });
  try {
    const rec = await fetchProject(id);
    if (!rec) return false;
    const player = getPlayer();
    const assets: Asset[] = [];
    const missing: AssetMeta[] = [];
    for (const m of rec.data.assets ?? []) {
      const blob = await idbGet<Blob>(MEDIA, m.id).catch(() => undefined);
      if (!blob) {
        missing.push(m);
        continue;
      }
      const file = blob instanceof File ? blob : new File([blob], m.name, { type: m.type });
      const a = await probeFile(file, m.id, m.kind, m.name).catch(() => null);
      if (!a) {
        missing.push(m);
        continue;
      }
      await player?.addAsset(a);
      assets.push(a);
    }
    store.set({
      projectId: id,
      projectName: rec.name,
      project: { ...emptyProject(), ...rec.data.project },
      assets,
      missingAssets: missing,
      transcripts: rec.data.transcripts ?? {},
      activeRefs: rec.data.activeRefs ?? [],
      selection: null,
      past: [],
      future: [],
      time: 0,
      saveState: rec.cloud ? "saved" : "local",
    });
    return true;
  } finally {
    store.set({ busy: null });
  }
}

/** Re-attaches a file chosen by the user to a missing asset of the open project. */
export async function relinkAsset(m: AssetMeta, file: File) {
  const a = await probeFile(file, m.id, m.kind, m.name);
  if (!a) throw new Error("Ese archivo no es un video, imagen o audio válido.");
  await getPlayer()?.addAsset(a);
  await idbPut(MEDIA, a.id, file).catch(() => undefined);
  store.set((s) => ({ assets: [...s.assets, a], missingAssets: s.missingAssets.filter((x) => x.id !== m.id) }));
}
