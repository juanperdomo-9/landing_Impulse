"use client";

import { emptyBrand, saveBrand } from "./brand";
import { store } from "./store";
import type { StyleRef } from "./types";

export interface VideoAnalysis {
  duration: number;
  width: number;
  height: number;
  aspect: string;
  cuts: number;
  cutTimes: number[];
  avgShot: number;
  thumb: string;
  frames: { t: number; data: string }[];
}

function aspectLabel(w: number, h: number) {
  const r = w / h;
  if (r < 0.65) return "9:16 (vertical)";
  if (r < 0.9) return "4:5";
  if (r < 1.15) return "1:1 (cuadrado)";
  return "16:9 (horizontal)";
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      res();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    setTimeout(done, 2000); // never hang on a bad frame
  });
}

/**
 * Looks at a reference video in the browser: duration, format, how often it cuts (scene changes)
 * and a handful of frames for the AI to describe the visual style.
 */
export async function analyzeVideo(file: File, onProgress?: (p: number) => void): Promise<VideoAnalysis> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("No se pudo leer el video. Prueba con un MP4 o WebM."));
    });
    const duration = Math.min(v.duration || 0, 180);
    const W = v.videoWidth;
    const H = v.videoHeight;

    // scene changes: compare tiny grayscale frames every ~0.25 s
    const small = document.createElement("canvas");
    small.width = 32;
    small.height = 32;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const step = Math.max(0.25, duration / 360);
    let prev: Float32Array | null = null;
    const diffs: { t: number; d: number }[] = [];
    for (let t = 0; t < duration; t += step) {
      await seek(v, t);
      sctx.drawImage(v, 0, 0, 32, 32);
      const px = sctx.getImageData(0, 0, 32, 32).data;
      const g = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) g[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
      if (prev) {
        let d = 0;
        for (let i = 0; i < 1024; i++) d += Math.abs(g[i] - prev[i]);
        diffs.push({ t, d: d / 1024 });
      }
      prev = g;
      onProgress?.(Math.min(0.85, (t / duration) * 0.85));
    }
    const sorted = diffs.map((x) => x.d).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const thr = Math.max(0.12, median * 3);
    const cutTimes: number[] = [];
    for (const x of diffs) if (x.d > thr && (!cutTimes.length || x.t - cutTimes[cutTimes.length - 1] > 0.4)) cutTimes.push(x.t);

    // frames for the AI: the hook (first second) plus evenly spaced moments
    const big = document.createElement("canvas");
    const s = Math.min(1, 384 / Math.max(W, H));
    big.width = Math.round(W * s);
    big.height = Math.round(H * s);
    const bctx = big.getContext("2d")!;
    const times = [Math.min(0.5, duration / 10)];
    const n = 7;
    for (let i = 1; i <= n; i++) times.push((duration * i) / (n + 1));
    const frames: { t: number; data: string }[] = [];
    for (const t of times) {
      await seek(v, t);
      bctx.drawImage(v, 0, 0, big.width, big.height);
      frames.push({ t, data: big.toDataURL("image/jpeg", 0.7).split(",")[1] });
    }
    onProgress?.(0.95);

    // thumbnail
    await seek(v, Math.min(1, duration / 3));
    const tc = document.createElement("canvas");
    const ts = 160 / Math.max(W, H);
    tc.width = Math.round(W * ts);
    tc.height = Math.round(H * ts);
    tc.getContext("2d")!.drawImage(v, 0, 0, tc.width, tc.height);

    return {
      duration,
      width: W,
      height: H,
      aspect: aspectLabel(W, H),
      cuts: cutTimes.length,
      cutTimes,
      avgShot: duration / (cutTimes.length + 1),
      thumb: tc.toDataURL("image/jpeg", 0.7),
      frames,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves the reference list together with the brand kit (same storage). */
export async function saveReferences(refs: StyleRef[]) {
  const brand = { ...(store.get().brand ?? emptyBrand()), references: refs };
  store.set({ brand });
  return saveBrand(brand);
}

export function chatSend(text: string) {
  window.dispatchEvent(new CustomEvent("impulsa-chat", { detail: text }));
}

/** Text for the AI about the references chosen for this video. */
export function describeActiveRefs(): string {
  const s = store.get();
  const refs = (s.brand?.references ?? []).filter((r) => s.activeRefs.includes(r.id));
  if (!refs.length) return "";
  return [
    "Referencias de estilo elegidas por el cliente para este video (imita su estilo con las herramientas disponibles):",
    ...refs.map(
      (r) =>
        `--- "${r.name}" (${r.aspect}, ${r.duration.toFixed(0)}s, ${r.cuts} cortes, un corte cada ~${r.avgShot.toFixed(1)}s)${r.notes ? `\nLo que le gusta al cliente: ${r.notes}` : ""}\n${r.profile}`,
    ),
  ].join("\n");
}
