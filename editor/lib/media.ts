"use client";

import { withBase } from "@/lib/paths";
import { idbPut, MEDIA, persistStorage } from "./idb";
import { getPlayer } from "./player";
import { fmt, nextPhotoSlot, totalDuration, uid } from "./project";
import { store } from "./store";
import type { Asset, AssetKind, Segment } from "./types";

function kindOf(file: File): AssetKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
  return null;
}

export async function probeFile(file: File, id?: string, forceKind?: AssetKind, name?: string): Promise<Asset | null> {
  // forceKind "audio" lets a video file be used only for its sound
  const kind = forceKind ?? kindOf(file);
  if (!kind) return null;
  const url = URL.createObjectURL(file);
  const base = { id: id ?? uid(), kind, name: name ?? file.name, url, file, duration: 0 };
  if (kind === "video" || kind === "audio") {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.src = url;
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error(`No se pudo leer ${file.name}`));
    });
    let duration = el.duration;
    if (!isFinite(duration)) {
      // some webm files report Infinity until seeked to the end
      el.currentTime = 1e9;
      await new Promise((r) => (el.ontimeupdate = r));
      duration = el.duration;
      el.currentTime = 0;
    }
    const v = el as HTMLVideoElement;
    return {
      ...base,
      duration,
      width: kind === "video" ? v.videoWidth : undefined,
      height: kind === "video" ? v.videoHeight : undefined,
    };
  }
  const img = new Image();
  img.src = url;
  await img.decode();
  return { ...base, width: img.naturalWidth, height: img.naturalHeight };
}

// ---------- audio analysis ----------

const monoCache = new Map<string, Promise<Float32Array>>();

/** Decode an asset's audio track as 16 kHz mono (what Whisper expects). */
export function mono16k(asset: Asset): Promise<Float32Array> {
  let p = monoCache.get(asset.id);
  if (!p) {
    p = (async () => {
      const ctx = new OfflineAudioContext(1, 16000, 16000);
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(await asset.file.arrayBuffer());
      } catch {
        throw new Error(`"${asset.name}" no tiene pista de audio legible.`);
      }
      if (buf.numberOfChannels === 1) return buf.getChannelData(0);
      const out = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
      }
      return out;
    })();
    monoCache.set(asset.id, p);
    p.catch(() => monoCache.delete(asset.id));
  }
  return p;
}

/** Returns silent ranges in source time. Threshold adapts to the clip's loudness. */
export async function detectSilences(
  asset: Asset,
  minSilence = 0.5,
  thresholdDb?: number,
): Promise<{ start: number; end: number }[]> {
  const data = await mono16k(asset);
  const win = 320; // 20ms
  const n = Math.floor(data.length / win);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win; j < (i + 1) * win; j++) s += data[j] * data[j];
    db[i] = 10 * Math.log10(s / win + 1e-10);
  }
  let thr = thresholdDb;
  if (thr === undefined) {
    const sorted = Array.from(db).sort((a, b) => a - b);
    const noise = sorted[Math.floor(n * 0.1)] ?? -60;
    const speech = sorted[Math.floor(n * 0.9)] ?? -20;
    thr = Math.max(noise + 8, Math.min(speech - 18, -35));
  }
  const out: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const silent = i < n && db[i] < thr;
    if (silent && runStart < 0) runStart = i;
    if (!silent && runStart >= 0) {
      const s = (runStart * win) / 16000;
      const e = (i * win) / 16000;
      if (e - s >= minSilence) out.push({ start: s, end: e });
      runStart = -1;
    }
  }
  return out;
}

// ---------- transcription (Whisper in the browser) ----------

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<
  number,
  { resolve: (v: Segment[]) => void; reject: (e: Error) => void; onStatus: (s: string) => void }
>();

function getWorker() {
  if (!worker) {
    worker = new Worker(withBase("/whisper-worker.js"), { type: "module" });
    // the worker could not start (e.g. the speech model library failed to download)
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      const err = new Error("No se pudo cargar el reconocimiento de voz. Revisa tu conexión a internet e inténtalo de nuevo.");
      pending.forEach((p) => p.reject(err));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker.onmessage = (e) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      if (m.type === "progress") {
        const pct = m.progress?.progress;
        if (m.progress?.status === "progress" && typeof pct === "number")
          p.onStatus(`Descargando modelo de voz… ${Math.round(pct)}%`);
      } else if (m.type === "status") p.onStatus(m.status);
      else if (m.type === "result") {
        pending.delete(m.id);
        const chunks: { text: string; timestamp: [number, number | null] }[] = m.result.chunks ?? [];
        p.resolve(
          chunks
            .map((c) => ({
              start: c.timestamp[0] ?? 0,
              end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2,
              text: c.text.trim(),
            }))
            .filter((s) => s.text),
        );
      } else if (m.type === "error") {
        pending.delete(m.id);
        p.reject(new Error(m.error));
      }
    };
  }
  return worker;
}

export const WHISPER_MODELS = {
  rapido: "Xenova/whisper-tiny",
  equilibrado: "Xenova/whisper-base",
  preciso: "Xenova/whisper-small",
} as const;

export async function transcribeAsset(
  asset: Asset,
  opts: { language?: string | null; model?: string } = {},
): Promise<Segment[]> {
  const existing = store.get().transcripts[asset.id];
  if (existing) return existing;
  store.set({ busy: `Extrayendo audio de "${asset.name}"…` });
  try {
    const audio = await mono16k(asset);
    const id = ++reqId;
    const segs = await new Promise<Segment[]>((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
        onStatus: (s) => store.set({ busy: `${s} (${asset.name})` }),
      });
      // copy so the cached buffer is not transferred away
      const copy = new Float32Array(audio);
      getWorker().postMessage(
        {
          id,
          audio: copy,
          language: opts.language === undefined ? "spanish" : opts.language,
          model: opts.model ?? WHISPER_MODELS.equilibrado,
        },
        [copy.buffer],
      );
    });
    store.set((s) => ({ transcripts: { ...s.transcripts, [asset.id]: segs } }));
    return segs;
  } finally {
    store.set({ busy: null });
  }
}

/** Transcribe the audio used for subtitles: the voice of the clips and/or the background songs. */
export async function transcribeTimeline(opts?: {
  language?: string | null;
  model?: string;
  source?: "video" | "music" | "all";
}) {
  const s = store.get();
  const source = opts?.source ?? "video";
  const ids = new Set<string>();
  if (source !== "music") s.project.clips.forEach((c) => ids.add(c.assetId));
  if (source !== "video")
    s.project.audio.forEach((a) => {
      if (a.kind === "music" && a.assetId) ids.add(a.assetId);
    });
  for (const id of ids) {
    const a = s.assets.find((x) => x.id === id);
    if (a) await transcribeAsset(a, opts);
  }
}

/**
 * Adds files to the project. Videos go to the end of the video track; photos are placed on the video
 * at the playhead (3 s each, one after another); music goes under the whole video.
 */
export async function addFiles(files: FileList | File[], opts: { autoPlace?: boolean } = {}) {
  const autoPlace = opts.autoPlace !== false;
  const player = getPlayer();
  const placed: string[] = [];
  for (const f of Array.from(files)) {
    store.set({ busy: `Cargando ${f.name}…` });
    try {
      const a = await probeFile(f);
      if (!a) continue;
      await player?.addAsset(a);
      store.set((s) => ({ assets: [...s.assets, a] }));
      // keep the file on this device so the project can be reopened later
      idbPut(MEDIA, a.id, f).catch(() => undefined);
      persistStorage();
      if (a.kind === "video") {
        const first = store.get().project.clips.length === 0;
        store.edit((p) => ({
          ...p,
          aspect:
            first && a.width && a.height
              ? a.height > a.width * 1.2
                ? "9:16"
                : Math.abs(a.width - a.height) < a.width * 0.1
                  ? "1:1"
                  : "16:9"
              : p.aspect,
          clips: [...p.clips, { id: uid(), assetId: a.id, in: 0, out: a.duration, volume: 1 }],
        }));
      } else if (autoPlace && a.kind === "image") {
        const slot = nextPhotoSlot(store.get().project, store.get().time);
        store.edit((p) => ({
          ...p,
          overlays: [
            ...p.overlays,
            { id: uid(), kind: "image", assetId: a.id, start: slot.start, end: slot.end, x: 0.5, y: 0.5, size: 1, animation: "fade", fill: "cover" },
          ],
        }));
        placed.push(`🖼 ${a.name}: ${fmt(slot.start)}–${fmt(slot.end)}${slot.full ? " (ya no quedaba lugar libre, se superpone)" : ""}`);
      } else if (autoPlace && a.kind === "audio") {
        const p = store.get().project;
        const dur = totalDuration(p);
        const hasMusic = p.audio.some((x) => x.kind === "music");
        const start = hasMusic ? store.get().time : 0;
        const length = dur > 0 ? Math.max(0.5, dur - start) : a.duration;
        store.edit((pr) => ({
          ...pr,
          audio: [
            ...pr.audio,
            {
              id: uid(),
              kind: "music",
              assetId: a.id,
              name: a.name,
              start,
              duration: length,
              offset: 0,
              // quieter when the video has a voice track
              volume: pr.clips.length ? 0.25 : 0.8,
              fadeIn: 1,
              fadeOut: 2,
              loop: true,
            },
          ],
        }));
        placed.push(`♪ ${a.name}: de fondo desde ${fmt(start)}`);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      store.set({ busy: null });
    }
  }
  if (placed.length) {
    store.set({ toast: `Agregado al video — ${placed.join(" · ")}. Podés moverlo en la línea de tiempo.` });
  }
}

export async function imageThumb(asset: Asset, max = 384): Promise<string> {
  const img = getPlayer()?.images.get(asset.id) ?? Object.assign(new Image(), { src: asset.url });
  if (!img.complete) await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75).split(",")[1];
}

/**
 * Uses the sound of a video (e.g. a saved Reel with a trending audio) as background music.
 * `replace` mutes the original sound of the user's clips.
 */
export async function addVideoSound(file: File, opts: { replace: boolean }) {
  const player = getPlayer();
  store.set({ busy: `Extrayendo el sonido de ${file.name}…` });
  try {
    const a = await probeFile(file, undefined, "audio", `Sonido de ${file.name.replace(/\.[^.]+$/, "")}`);
    if (!a) throw new Error("Ese archivo no es un video válido.");
    try {
      await player?.addAsset(a);
    } catch {
      throw new Error("No pudimos leer el sonido de ese video. Probá con otro archivo (MP4 o MOV).");
    }
    store.set((s) => ({ assets: [...s.assets, a] }));
    idbPut(MEDIA, a.id, file).catch(() => undefined);
    const dur = totalDuration(store.get().project);
    store.edit((p) => ({
      ...p,
      clips: opts.replace ? p.clips.map((c) => ({ ...c, volume: 0 })) : p.clips,
      audio: [
        ...p.audio,
        {
          id: uid(),
          kind: "music",
          assetId: a.id,
          name: a.name,
          start: 0,
          duration: dur > 0 ? dur : a.duration,
          offset: 0,
          volume: opts.replace ? 1 : 0.3,
          fadeIn: opts.replace ? 0 : 1,
          fadeOut: 1.5,
          loop: true,
        },
      ],
    }));
    store.set({
      toast: opts.replace
        ? `Listo: ahora suena «${a.name}» y el sonido original de tu video quedó en silencio.`
        : `Listo: «${a.name}» suena de fondo junto con el sonido de tu video.`,
    });
  } catch (e) {
    alert((e as Error).message);
  } finally {
    store.set({ busy: null });
  }
}
