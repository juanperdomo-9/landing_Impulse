import type {
  Aspect,
  Clip,
  Cue,
  Project,
  Segment,
  SubtitlePreset,
  SubtitleStyle,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const SUBTITLE_PRESETS: Record<SubtitlePreset, Omit<SubtitleStyle, "preset">> = {
  tiktok: {
    fontSize: 54,
    color: "#ffffff",
    highlight: "#ffe14d",
    position: "middle",
    uppercase: true,
    background: false,
    wordsPerCue: 3,
  },
  clasico: {
    fontSize: 34,
    color: "#ffffff",
    highlight: "#ffffff",
    position: "bottom",
    uppercase: false,
    background: true,
    wordsPerCue: 8,
  },
  karaoke: {
    fontSize: 44,
    color: "#ffffff",
    highlight: "#22c55e",
    position: "bottom",
    uppercase: false,
    background: false,
    wordsPerCue: 5,
  },
  minimal: {
    fontSize: 30,
    color: "#ffffff",
    highlight: "#ffffff",
    position: "bottom",
    uppercase: false,
    background: false,
    wordsPerCue: 7,
  },
  neon: {
    fontSize: 48,
    color: "#67e8f9",
    highlight: "#f0abfc",
    position: "middle",
    uppercase: true,
    background: false,
    wordsPerCue: 3,
  },
};

export function subtitleStyle(preset: SubtitlePreset): SubtitleStyle {
  return { preset, ...SUBTITLE_PRESETS[preset] };
}

export function emptyProject(): Project {
  return {
    aspect: "16:9",
    fit: "blur",
    clips: [],
    overlays: [],
    audio: [],
    cues: [],
    subtitleStyle: subtitleStyle("tiktok"),
    effects: [],
  };
}

export function canvasSize(aspect: Aspect): { w: number; h: number } {
  switch (aspect) {
    case "9:16":
      return { w: 720, h: 1280 };
    case "1:1":
      return { w: 960, h: 960 };
    case "4:5":
      return { w: 864, h: 1080 };
    default:
      return { w: 1280, h: 720 };
  }
}

export const clipDur = (c: Clip) => Math.max(0, c.out - c.in);

export function totalDuration(p: Project): number {
  const main = p.clips.reduce((a, c) => a + clipDur(c), 0);
  return main;
}

/** Duration including overlays/audio that extend past the last clip (used when there is no video). */
export function contentDuration(p: Project): number {
  let d = totalDuration(p);
  if (p.clips.length === 0) {
    for (const o of p.overlays) d = Math.max(d, o.end);
    for (const a of p.audio) d = Math.max(d, a.start + a.duration);
  }
  return d;
}

export function clipStarts(p: Project): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const c of p.clips) {
    starts.push(t);
    t += clipDur(c);
  }
  return starts;
}

export function clipAt(
  p: Project,
  t: number,
): { clip: Clip; index: number; start: number } | null {
  let s = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const d = clipDur(p.clips[i]);
    if (t < s + d || (i === p.clips.length - 1 && t <= s + d)) {
      return { clip: p.clips[i], index: i, start: s };
    }
    s += d;
  }
  return null;
}

type Range = { start: number; end: number };

export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .map((r) => ({ ...r }))
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

/**
 * Removes the given timeline ranges ("ripple delete"): clips are split/trimmed and every
 * other timed item is shifted so everything stays in sync.
 */
export function removeRanges(p: Project, rangesIn: Range[]): Project {
  const dur = totalDuration(p);
  const ranges = mergeRanges(
    rangesIn.map((r) => ({ start: Math.max(0, r.start), end: Math.min(dur, r.end) })),
  );
  if (ranges.length === 0) return p;

  const map = (t: number) => {
    let removed = 0;
    for (const r of ranges) {
      if (t >= r.end) removed += r.end - r.start;
      else if (t > r.start) removed += t - r.start;
    }
    return t - removed;
  };

  const clips: Clip[] = [];
  const starts = clipStarts(p);
  p.clips.forEach((c, i) => {
    const s = starts[i];
    const e = s + clipDur(c);
    let pieces: Range[] = [{ start: s, end: e }];
    for (const r of ranges) {
      const next: Range[] = [];
      for (const pc of pieces) {
        if (r.end <= pc.start || r.start >= pc.end) next.push(pc);
        else {
          if (r.start > pc.start) next.push({ start: pc.start, end: r.start });
          if (r.end < pc.end) next.push({ start: r.end, end: pc.end });
        }
      }
      pieces = next;
    }
    pieces.forEach((pc, k) => {
      if (pc.end - pc.start < 0.04) return;
      clips.push({
        ...c,
        id: k === 0 ? c.id : uid(),
        in: c.in + (pc.start - s),
        out: c.in + (pc.end - s),
      });
    });
  });

  const span = <T extends { start: number; end: number }>(items: T[]) =>
    items
      .map((it) => ({ ...it, start: map(it.start), end: map(it.end) }))
      .filter((it) => it.end - it.start > 0.05);

  const audio = p.audio
    .map((a) => {
      if (a.kind === "sfx") {
        const inside = ranges.some((r) => a.start >= r.start && a.start < r.end);
        return inside ? null : { ...a, start: map(a.start) };
      }
      const s = map(a.start);
      const e = map(a.start + a.duration);
      return e - s > 0.05 ? { ...a, start: s, duration: e - s } : null;
    })
    .filter(Boolean) as Project["audio"];

  return {
    ...p,
    clips,
    overlays: span(p.overlays),
    cues: span(p.cues),
    effects: span(p.effects),
    audio,
  };
}

export function keepOnlyRanges(p: Project, keep: Range[]): Project {
  const dur = totalDuration(p);
  const k = mergeRanges(keep);
  const remove: Range[] = [];
  let t = 0;
  for (const r of k) {
    if (r.start > t) remove.push({ start: t, end: r.start });
    t = Math.max(t, r.end);
  }
  if (t < dur) remove.push({ start: t, end: dur });
  return removeRanges(p, remove);
}

export function splitClipAt(p: Project, t: number): Project {
  const hit = clipAt(p, t);
  if (!hit) return p;
  const local = t - hit.start;
  if (local < 0.05 || clipDur(hit.clip) - local < 0.05) return p;
  const a: Clip = { ...hit.clip, out: hit.clip.in + local };
  const b: Clip = { ...hit.clip, id: uid(), in: hit.clip.in + local };
  const clips = [...p.clips];
  clips.splice(hit.index, 1, a, b);
  return { ...p, clips };
}

/** Maps a source time range of an asset to timeline ranges (an asset may appear in many clips). */
export function sourceToTimeline(
  p: Project,
  assetId: string,
  s: number,
  e: number,
): Range[] {
  const out: Range[] = [];
  const starts = clipStarts(p);
  p.clips.forEach((c, i) => {
    if (c.assetId !== assetId) return;
    const a = Math.max(s, c.in);
    const b = Math.min(e, c.out);
    if (b > a) out.push({ start: starts[i] + (a - c.in), end: starts[i] + (b - c.in) });
  });
  return out;
}

interface Word {
  text: string;
  start: number;
  end: number;
}

/** Split whisper segments into words with proportional timing (source time). */
export function segmentsToWords(segs: Segment[]): Word[] {
  const words: Word[] = [];
  for (const s of segs) {
    const parts = s.text.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const total = parts.reduce((a, w) => a + w.length + 1, 0);
    let acc = 0;
    const d = Math.max(0.05, s.end - s.start);
    for (const w of parts) {
      const ws = s.start + (acc / total) * d;
      acc += w.length + 1;
      const we = s.start + (acc / total) * d;
      words.push({ text: w, start: ws, end: we });
    }
  }
  return words;
}

/** Build subtitle cues on the timeline from the transcripts of the clips' source videos. */
export type SubSource = "video" | "music" | "all";

export const musicItems = (p: Project) => p.audio.filter((a) => a.kind === "music" && a.assetId);

/** Background song when the clips are muted (or there is no video), otherwise the voice of the clips. */
export function defaultSubSource(p: Project): "video" | "music" {
  const audible = p.clips.some((c) => c.volume > 0.05);
  return !audible && musicItems(p).length ? "music" : "video";
}

export function buildCues(
  p: Project,
  transcripts: Record<string, Segment[]>,
  wordsPerCue: number,
  source: SubSource = "video",
  durations: Record<string, number> = {},
): Cue[] {
  const starts = clipStarts(p);
  const timelineWords: Word[] = [];
  if (source !== "music")
    p.clips.forEach((c, i) => {
      const segs = transcripts[c.assetId];
      if (!segs) return;
      for (const w of segmentsToWords(segs)) {
        const mid = (w.start + w.end) / 2;
        if (mid < c.in || mid >= c.out) continue;
        timelineWords.push({
          text: w.text,
          start: starts[i] + Math.max(0, w.start - c.in),
          end: starts[i] + Math.min(c.out - c.in, w.end - c.in),
        });
      }
    });
  if (source !== "video")
    for (const m of musicItems(p)) {
      const segs = transcripts[m.assetId!];
      if (!segs?.length) continue;
      const words = segmentsToWords(segs);
      const length = durations[m.assetId!] || Math.max(...segs.map((x) => x.end));
      const itemEnd = m.start + m.duration;
      // a looping song repeats its lyrics
      for (let k = 0; k < 50; k++) {
        const base = m.start - m.offset + k * length;
        if (base >= itemEnd || (!m.loop && k > 0)) break;
        for (const w of words) {
          const start = base + w.start;
          if (start < m.start || start >= itemEnd) continue;
          timelineWords.push({ text: w.text, start, end: Math.min(itemEnd, base + w.end) });
        }
      }
    }
  timelineWords.sort((a, b) => a.start - b.start);

  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({
      id: uid(),
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((w) => w.text).join(" "),
    });
    cur = [];
  };
  for (const w of timelineWords) {
    const prev = cur[cur.length - 1];
    if (prev && w.start - prev.end > 0.6) flush();
    cur.push(w);
    if (cur.length >= wordsPerCue || /[.!?,;:]$/.test(w.text)) flush();
  }
  flush();
  // avoid a lone trailing word: merge it into the previous line of the same phrase
  for (let i = cues.length - 1; i > 0; i--) {
    const c = cues[i];
    const prev = cues[i - 1];
    if (!c.text.includes(" ") && c.start - prev.end < 0.05 && !/[.!?,;:]$/.test(prev.text)) {
      prev.text = `${prev.text} ${c.text}`;
      prev.end = c.end;
      cues.splice(i, 1);
    }
  }
  // close small gaps so text doesn't flicker
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].end;
    if (gap > 0 && gap < 0.3) cues[i].end = cues[i + 1].start;
  }
  return cues;
}

export const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export function positionToXY(pos: string): { x: number; y: number } {
  switch (pos) {
    case "top":
      return { x: 0.5, y: 0.15 };
    case "bottom":
      return { x: 0.5, y: 0.82 };
    case "top-left":
      return { x: 0.2, y: 0.15 };
    case "top-right":
      return { x: 0.8, y: 0.15 };
    case "bottom-left":
      return { x: 0.2, y: 0.82 };
    case "bottom-right":
      return { x: 0.8, y: 0.82 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

export type SlotKind = "image" | "text" | "effect" | "sfx";

/**
 * Where the next item of a kind goes: right after the last item of that kind already in the video
 * (or at the playhead when there are none). Logos that cover almost the whole video don't count.
 * `full` is true when there was no room left and the item had to overlap another one.
 */
export function nextSlot(
  p: Project,
  kind: SlotKind,
  playhead: number,
  len = 3,
): { start: number; end: number; full: boolean } {
  const dur = totalDuration(p);
  const ends =
    kind === "effect"
      ? p.effects.map((e) => e.end)
      : kind === "sfx"
        ? p.audio.filter((a) => a.kind === "sfx").map((a) => a.start + a.duration)
        : p.overlays
            .filter((o) => (kind === "image" ? o.kind === "image" : o.kind === "text"))
            .filter((o) => !(dur > 0 && o.end - o.start >= dur * 0.9))
            .map((o) => o.end);
  let start = ends.length ? Math.max(...ends) : playhead;
  if (dur <= 0) return { start, end: start + len, full: false };
  if (start + Math.min(len, 1) > dur) {
    start = Math.max(0, Math.min(playhead, dur - len));
    return { start, end: Math.min(dur, start + len), full: true };
  }
  return { start, end: Math.min(dur, start + len), full: false };
}

export function nextPhotoSlot(p: Project, playhead: number, len = 3) {
  return nextSlot(p, "image", playhead, len);
}
