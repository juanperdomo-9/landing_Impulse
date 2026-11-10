"use client";

import { canvasSize, clipAt, clipStarts, contentDuration } from "./project";
import { drawFrame } from "./render";
import { sfxBuffer } from "./sfx";
import { store } from "./store";
import type { Asset, Project } from "./types";

interface VideoSlot {
  el: HTMLVideoElement;
  gain?: GainNode;
}

/**
 * Playback + export engine. Renders the project to a canvas and mixes audio with WebAudio.
 * Each video asset gets two <video> elements so the next clip can be pre-seeked while the
 * current one plays (seamless cuts).
 */
export class Player {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  videos = new Map<string, VideoSlot[]>();
  images = new Map<string, HTMLImageElement>();
  buffers = new Map<string, AudioBuffer>();
  audio: AudioContext | null = null;
  master: GainNode | null = null;
  monitor: GainNode | null = null;
  recordDest: MediaStreamAudioDestinationNode | null = null;
  scheduled: AudioScheduledSourceNode[] = [];

  playing = false;
  time = 0;
  private clockStart = 0;
  private clockT0 = 0;
  private activeIdx = -1;
  private raf = 0;
  private lastPublish = 0;
  private onEnd: (() => void) | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.loop = this.loop.bind(this);
    // make sure the canvas font is loaded (the canvas redraws every frame, so it shows up as soon as it's ready)
    document.fonts?.load('900 40px "Inter Variable"').catch(() => undefined);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    this.videos.forEach((s) => s.forEach((v) => v.el.pause()));
    this.audio?.close();
  }

  get project(): Project {
    return store.get().project;
  }

  async addAsset(a: Asset) {
    if (a.kind === "video") {
      const mk = () => {
        const el = document.createElement("video");
        el.src = a.url;
        el.preload = "auto";
        el.playsInline = true;
        el.crossOrigin = "anonymous";
        const slot: VideoSlot = { el };
        if (this.audio) this.connectVideo(slot);
        return slot;
      };
      this.videos.set(a.id, [mk(), mk()]);
    } else if (a.kind === "image") {
      const img = new Image();
      img.src = a.url;
      await img.decode().catch(() => undefined);
      this.images.set(a.id, img);
    } else if (a.kind === "audio") {
      const ctx = this.ensureAudio();
      const buf = await ctx.decodeAudioData(await a.file.arrayBuffer());
      this.buffers.set(a.id, buf);
    }
  }

  ensureAudio(): AudioContext {
    if (!this.audio) {
      this.audio = new AudioContext();
      this.master = this.audio.createGain();
      this.monitor = this.audio.createGain();
      this.master.connect(this.monitor).connect(this.audio.destination);
      this.videos.forEach((slots) => slots.forEach((s) => this.connectVideo(s)));
    }
    if (this.audio.state === "suspended") this.audio.resume();
    return this.audio;
  }

  private connectVideo(slot: VideoSlot) {
    if (!this.audio || slot.gain) return;
    const src = this.audio.createMediaElementSource(slot.el);
    slot.gain = this.audio.createGain();
    src.connect(slot.gain).connect(this.master!);
  }

  private slotFor(index: number): VideoSlot | null {
    const c = this.project.clips[index];
    if (!c) return null;
    const slots = this.videos.get(c.assetId);
    return slots ? slots[index % 2] : null;
  }

  get duration() {
    return contentDuration(this.project);
  }

  seek(t: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.time = Math.max(0, Math.min(t, this.duration));
    this.activeIdx = -1;
    store.set({ time: this.time });
    if (wasPlaying) this.play();
  }

  play() {
    if (this.playing) return;
    if (this.time >= this.duration - 0.02) this.time = 0;
    this.ensureAudio();
    this.playing = true;
    this.clockStart = performance.now();
    this.clockT0 = this.time;
    this.activeIdx = -1;
    this.scheduleAudio(this.time);
    store.set({ playing: true });
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.stopAudio();
    this.videos.forEach((s) => s.forEach((v) => v.el.pause()));
    store.set({ playing: false, time: this.time });
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  private stopAudio() {
    for (const s of this.scheduled) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = [];
  }

  private async scheduleAudio(from: number) {
    const ctx = this.audio!;
    const now = ctx.currentTime + 0.03;
    for (const item of this.project.audio) {
      const end = item.start + item.duration;
      if (end <= from) continue;
      const buf =
        item.kind === "sfx" && item.sfx ? await sfxBuffer(item.sfx) : this.buffers.get(item.assetId ?? "");
      if (!buf || !this.playing) continue;
      const delay = Math.max(0, item.start - from);
      const into = Math.max(0, from - item.start);
      const remaining = item.duration - into;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      let offset = item.offset + into;
      if (item.loop) {
        src.loop = true;
        offset = offset % buf.duration;
      } else if (offset >= buf.duration) continue;
      const g = ctx.createGain();
      const t0 = now + delay;
      const v = item.volume;
      // fades (in timeline coordinates)
      const fi = Math.max(0, item.fadeIn - into);
      g.gain.setValueAtTime(fi > 0 ? 0.0001 : v, t0);
      if (fi > 0) g.gain.linearRampToValueAtTime(v, t0 + fi);
      if (item.fadeOut > 0 && remaining > item.fadeOut) {
        g.gain.setValueAtTime(v, t0 + remaining - item.fadeOut);
        g.gain.linearRampToValueAtTime(0.0001, t0 + remaining);
      }
      src.connect(g).connect(this.master!);
      src.start(t0, offset, remaining);
      this.scheduled.push(src);
    }
  }

  private loop(now: number) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const p = this.project;
    const { w, h } = canvasSize(p.aspect);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    if (this.playing) {
      this.time = this.clockT0 + (now - this.clockStart) / 1000;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this.pause();
        this.onEnd?.();
      }
    }

    const hit = clipAt(p, this.time);
    let video: HTMLVideoElement | null = null;
    if (hit) {
      const slot = this.slotFor(hit.index);
      if (slot) {
        video = slot.el;
        const target = hit.clip.in + (this.time - hit.start);
        if (slot.gain) slot.gain.gain.value = hit.clip.volume;
        if (this.playing) {
          if (this.activeIdx !== hit.index) {
            // switch clip
            this.videos.forEach((s) => s.forEach((v) => v.el !== video && v.el.pause()));
            if (Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
            video.play().catch(() => undefined);
            this.activeIdx = hit.index;
            const next = this.slotFor(hit.index + 1);
            const nc = p.clips[hit.index + 1];
            if (next && nc && next.el !== video) {
              next.el.pause();
              next.el.currentTime = nc.in;
            }
          } else if (video.seeking || video.readyState < 3) {
            // stall: freeze the clock while the video catches up
            this.clockStart += now - (this.lastFrame || now);
            this.time = this.clockT0 + (now - this.clockStart) / 1000;
          } else if (Math.abs(video.currentTime - target) > 0.3) {
            video.currentTime = target;
          }
        } else if (Math.abs(video.currentTime - target) > 0.02 && !video.seeking) {
          video.currentTime = target;
        }
      }
    }
    this.lastFrame = now;

    if (!video || video.readyState >= 2 || !hit) {
      drawFrame(this.ctx, { project: p, t: this.time, W: w, H: h, video, images: this.images });
    }

    if (this.playing && now - this.lastPublish > 100) {
      this.lastPublish = now;
      store.set({ time: this.time });
    }
  }
  private lastFrame = 0;

  /** Real-time export: plays the whole timeline while recording canvas + mixed audio. */
  async exportVideo(onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
    this.pause();
    const ctx = this.ensureAudio();
    this.recordDest = ctx.createMediaStreamDestination();
    this.master!.connect(this.recordDest);
    this.monitor!.gain.value = 0; // mute speakers while exporting

    const mimes = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const stream = new MediaStream([
      ...this.canvas.captureStream(30).getVideoTracks(),
      ...this.recordDest.stream.getAudioTracks(),
    ]);
    const rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // prime first clip
    this.seek(0);
    const first = this.slotFor(0);
    if (first) {
      first.el.currentTime = this.project.clips[0].in;
      await new Promise((r) => setTimeout(r, 400));
    }

    const done = new Promise<void>((resolve) => {
      this.onEnd = resolve;
    });
    rec.start(500);
    this.play();
    const timer = setInterval(() => onProgress(this.time / Math.max(0.01, this.duration)), 250);
    await done;
    clearInterval(timer);
    await new Promise((r) => setTimeout(r, 300));
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.stop();
    await stopped;
    this.onEnd = null;
    this.master!.disconnect(this.recordDest);
    this.recordDest = null;
    this.monitor!.gain.value = 1;
    onProgress(1);
    const type = rec.mimeType || mime || "video/webm";
    return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" };
  }

  cancelExport() {
    if (this.onEnd) {
      this.pause();
      this.onEnd();
    }
  }

  /** Snapshot of the current frame (used to show the AI what the video looks like). */
  snapshot(maxSide = 384): string {
    const s = Math.min(1, maxSide / Math.max(this.canvas.width, this.canvas.height));
    const c = document.createElement("canvas");
    c.width = Math.round(this.canvas.width * s);
    c.height = Math.round(this.canvas.height * s);
    c.getContext("2d")!.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7).split(",")[1];
  }

  clipStarts() {
    return clipStarts(this.project);
  }
}

let instance: Player | null = null;
export const getPlayer = () => instance;
export const setPlayer = (p: Player | null) => {
  instance = p;
};
