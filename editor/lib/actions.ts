"use client";

import { describeBrand } from "./brand";
import { describeActiveRefs } from "./references";
import { detectSilences, transcribeTimeline, WHISPER_MODELS } from "./media";
import { getPlayer } from "./player";
import {
  buildCues,
  clipStarts,
  defaultSubSource,
  musicItems,
  type SubSource,
  fmt,
  keepOnlyRanges,
  positionToXY,
  removeRanges,
  SUBTITLE_PRESETS,
  sourceToTimeline,
  totalDuration,
  uid,
} from "./project";
import { SFX_INFO } from "./sfx";
import { store } from "./store";
import {
  EFFECT_TYPES,
  SFX_NAMES,
  type Animation,
  type Aspect,
  type Asset,
  type AssetKind,
  type EffectType,
  type Fit,
  type SfxName,
  type SubtitlePreset,
  type SubtitleStyle,
  type TextPreset,
} from "./types";

/** Editing actions shared by the UI and the AI assistant. */

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

export function findAsset(name: unknown, kind: AssetKind): Asset | undefined {
  const all = store.get().assets.filter((a) => a.kind === kind);
  if (typeof name === "string" && name) {
    const n = name.toLowerCase();
    const hit =
      all.find((a) => a.id === name) ??
      all.find((a) => a.name.toLowerCase() === n) ??
      all.find((a) => a.name.toLowerCase().includes(n) || n.includes(a.name.toLowerCase().replace(/\.[^.]+$/, "")));
    if (hit) return hit;
  }
  return all.length === 1 ? all[0] : undefined;
}

export async function ensureTranscripts(language?: string | null, source: SubSource = "video", model?: string) {
  await transcribeTimeline({ language, source, model });
}

export const isPhone = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const assetDurations = () => Object.fromEntries(store.get().assets.map((a) => [a.id, a.duration]));

export function transcriptForAI(): string {
  const s = store.get();
  const p = s.project;
  const starts = clipStarts(p);
  const lines: string[] = [];
  p.clips.forEach((c, i) => {
    for (const seg of s.transcripts[c.assetId] ?? []) {
      const a = Math.max(seg.start, c.in);
      const b = Math.min(seg.end, c.out);
      if (b - a < 0.1) continue;
      lines.push(`[${(starts[i] + a - c.in).toFixed(2)}–${(starts[i] + b - c.in).toFixed(2)}] ${seg.text}`);
    }
  });
  for (const m of musicItems(p)) {
    const segs = s.transcripts[m.assetId!];
    if (!segs?.length) continue;
    lines.push(`Letra de la canción de fondo «${m.name}» (suena desde ${m.start.toFixed(2)}s):`);
    for (const seg of segs) {
      const a = m.start - m.offset + seg.start;
      if (a < m.start || a >= m.start + m.duration) continue;
      lines.push(`  [${a.toFixed(2)}–${(m.start - m.offset + seg.end).toFixed(2)}] ${seg.text}`);
    }
  }
  return lines.join("\n");
}

export async function addSubtitles(
  opts: Partial<SubtitleStyle> & { language?: string | null; model?: string } = {},
) {
  const project = store.get().project;
  let source: SubSource = opts.source ?? defaultSubSource(project);
  // songs are harder to understand than speech: use the most accurate speech model for them
  // (on phones the biggest model can run out of memory, so they use the balanced one)
  const modelFor = (src: SubSource) =>
    opts.model ?? (src === "video" ? undefined : isPhone() ? WHISPER_MODELS.equilibrado : WHISPER_MODELS.preciso);
  await ensureTranscripts(opts.language, source, modelFor(source));
  let s = store.get();
  let style = mergeStyle(s.project.subtitleStyle, opts);
  let cues = buildCues(s.project, s.transcripts, style.wordsPerCue, source, assetDurations());
  // nothing spoken in the clips but there is a song: subtitle the song
  if (!cues.length && source === "video" && musicItems(s.project).length && !opts.source) {
    source = "music";
    await ensureTranscripts(opts.language, source, modelFor(source));
    s = store.get();
    cues = buildCues(s.project, s.transcripts, style.wordsPerCue, source, assetDurations());
  }
  style = { ...style, source };
  store.edit((p) => ({ ...p, cues, subtitleStyle: style }));
  return cues.length;
}

export function mergeStyle(cur: SubtitleStyle, o: Partial<SubtitleStyle>): SubtitleStyle {
  const preset = (o.preset && o.preset in SUBTITLE_PRESETS ? o.preset : cur.preset) as SubtitlePreset;
  const base = preset !== cur.preset ? { preset, ...SUBTITLE_PRESETS[preset] } : cur;
  const out: SubtitleStyle = { ...base };
  if (typeof o.color === "string") out.color = o.color;
  if (typeof o.highlight === "string") out.highlight = o.highlight;
  if (o.position === "top" || o.position === "middle" || o.position === "bottom") out.position = o.position;
  if (typeof o.uppercase === "boolean") out.uppercase = o.uppercase;
  if (typeof o.background === "boolean") out.background = o.background;
  if (typeof o.fontSize === "number") out.fontSize = Math.min(100, Math.max(14, o.fontSize));
  if (typeof o.wordsPerCue === "number") out.wordsPerCue = Math.min(15, Math.max(1, Math.round(o.wordsPerCue)));
  return out;
}

export function styleSubtitles(o: Partial<SubtitleStyle>) {
  const s = store.get();
  const style = mergeStyle(s.project.subtitleStyle, o);
  const regroup = style.wordsPerCue !== s.project.subtitleStyle.wordsPerCue && s.project.cues.length > 0;
  store.edit((p) => ({
    ...p,
    subtitleStyle: style,
    cues: regroup ? buildCues(p, s.transcripts, style.wordsPerCue, style.source ?? "video", assetDurations()) : p.cues,
  }));
}

export async function removeSilences(minSilence = 0.6, padding = 0.12) {
  const s = store.get();
  const p = s.project;
  const ranges: { start: number; end: number }[] = [];
  const ids = Array.from(new Set(p.clips.map((c) => c.assetId)));
  store.set({ busy: "Analizando silencios…" });
  try {
    for (const id of ids) {
      const a = s.assets.find((x) => x.id === id);
      if (!a) continue;
      const sil = await detectSilences(a, minSilence + 2 * padding);
      for (const r of sil) {
        ranges.push(...sourceToTimeline(p, id, r.start + padding, r.end - padding));
      }
    }
  } finally {
    store.set({ busy: null });
  }
  const before = totalDuration(p);
  store.edit((pr) => removeRanges(pr, ranges));
  const after = totalDuration(store.get().project);
  return { cuts: ranges.length, removed: before - after, duration: after };
}

export function cutRanges(ranges: { start: number; end: number }[]) {
  const before = totalDuration(store.get().project);
  store.edit((p) => removeRanges(p, ranges));
  return before - totalDuration(store.get().project);
}

export function keepRanges(ranges: { start: number; end: number }[]) {
  store.edit((p) => keepOnlyRanges(p, ranges));
  return totalDuration(store.get().project);
}

const ANIMS: Animation[] = ["none", "fade", "pop", "slide_up", "typewriter"];
const anim = (v: unknown, d: Animation): Animation => (ANIMS.includes(v as Animation) ? (v as Animation) : d);

export function addImage(o: {
  asset?: string;
  start?: number;
  end?: number;
  position?: string;
  x?: number;
  y?: number;
  size?: number;
  animation?: string;
  fill?: string;
}) {
  const a = findAsset(o.asset, "image");
  if (!a) throw new Error(`No encontré la imagen "${o.asset}". Súbela primero en Medios.`);
  const t = store.get().time;
  const start = num(o.start, t);
  const end = num(o.end, start + 3);
  const pos = positionToXY(o.position ?? "center");
  const x = typeof o.x === "number" ? Math.min(1, Math.max(0, o.x)) : pos.x;
  const y = typeof o.y === "number" ? Math.min(1, Math.max(0, o.y)) : pos.y;
  const id = uid();
  store.edit((p) => ({
    ...p,
    overlays: [
      ...p.overlays,
      {
        id,
        kind: "image",
        assetId: a.id,
        start,
        end: Math.max(end, start + 0.2),
        x,
        y,
        size: Math.min(1, Math.max(0.05, num(o.size, 0.4))),
        animation: anim(o.animation, "pop"),
        fill: imageFill(o.fill, o.size !== undefined || o.position !== undefined || o.x !== undefined ? "free" : "cover"),
      },
    ],
  }));
  return id;
}

const FILLS = ["cover", "contain", "free"] as const;
const imageFill = (v: unknown, d: (typeof FILLS)[number]) =>
  (FILLS as readonly string[]).includes(v as string) ? (v as (typeof FILLS)[number]) : d;

const PRESETS: TextPreset[] = ["titulo", "subtitulo", "etiqueta", "cta"];

export function addText(o: {
  text?: string;
  start?: number;
  end?: number;
  position?: string;
  preset?: string;
  color?: string;
  animation?: string;
  size?: number;
  x?: number;
  y?: number;
}) {
  const t = store.get().time;
  const start = num(o.start, t);
  const end = num(o.end, start + 3);
  const pos = positionToXY(o.position ?? "center");
  const x = typeof o.x === "number" ? Math.min(1, Math.max(0, o.x)) : pos.x;
  const y = typeof o.y === "number" ? Math.min(1, Math.max(0, o.y)) : pos.y;
  const id = uid();
  store.edit((p) => ({
    ...p,
    overlays: [
      ...p.overlays,
      {
        id,
        kind: "text",
        text: o.text || "Tu texto",
        preset: PRESETS.includes(o.preset as TextPreset) ? (o.preset as TextPreset) : "titulo",
        color: o.color,
        start,
        end: Math.max(end, start + 0.2),
        x,
        y,
        size: Math.min(3, Math.max(0.3, num(o.size, 1))),
        animation: anim(o.animation, "pop"),
      },
    ],
  }));
  return id;
}

export function addMusic(o: {
  asset?: string;
  start?: number;
  end?: number;
  volume?: number;
  fade_in?: number;
  fade_out?: number;
}) {
  const a = findAsset(o.asset, "audio");
  if (!a) throw new Error(`No encontré el audio "${o.asset}". Súbelo primero en Medios.`);
  const total = Math.max(totalDuration(store.get().project), a.duration);
  const start = num(o.start, 0);
  const end = num(o.end, totalDuration(store.get().project) || start + a.duration);
  const id = uid();
  store.edit((p) => ({
    ...p,
    audio: [
      ...p.audio,
      {
        id,
        kind: "music",
        assetId: a.id,
        name: a.name,
        start,
        duration: Math.max(0.2, Math.min(end, total) - start),
        offset: 0,
        volume: Math.min(2, Math.max(0, num(o.volume, 0.25))),
        fadeIn: num(o.fade_in, 1),
        fadeOut: num(o.fade_out, 2),
        loop: true,
      },
    ],
  }));
  return id;
}

export function addSfx(o: { effect?: string; at?: number; volume?: number }) {
  const name = (SFX_NAMES as readonly string[]).includes(o.effect ?? "") ? (o.effect as SfxName) : "whoosh";
  const at = num(o.at, store.get().time);
  const id = uid();
  store.edit((p) => ({
    ...p,
    audio: [
      ...p.audio,
      {
        id,
        kind: "sfx",
        sfx: name,
        name: SFX_INFO[name].label,
        start: Math.max(0, at),
        duration: SFX_INFO[name].duration,
        offset: 0,
        volume: Math.min(2, Math.max(0, num(o.volume, 0.8))),
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      },
    ],
  }));
  return id;
}

export function addEffect(o: { effect?: string; start?: number; end?: number; intensity?: number }) {
  const type = (EFFECT_TYPES as readonly string[]).includes(o.effect ?? "")
    ? (o.effect as EffectType)
    : "zoom";
  const dur = totalDuration(store.get().project);
  let start = num(o.start, store.get().time);
  let end = num(o.end, start + 2);
  if (type === "fundido_salida" && o.start === undefined) {
    end = dur;
    start = Math.max(0, dur - 1);
  }
  if (type === "fundido_entrada" && o.start === undefined) {
    start = 0;
    end = 1;
  }
  const id = uid();
  store.edit((p) => ({
    ...p,
    effects: [
      ...p.effects,
      { id, type, start, end: Math.max(end, start + 0.1), intensity: Math.min(1, Math.max(0, num(o.intensity, 0.7))) },
    ],
  }));
  return id;
}

export function setFormat(o: { aspect?: string; fit?: string }) {
  store.edit((p) => ({
    ...p,
    aspect: (["16:9", "9:16", "1:1", "4:5"].includes(o.aspect ?? "") ? o.aspect : p.aspect) as Aspect,
    fit: (["cover", "contain", "blur"].includes(o.fit ?? "") ? o.fit : p.fit) as Fit,
  }));
}

export function setVideoVolume(volume: number) {
  store.edit((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, volume: Math.min(2, Math.max(0, volume)) })) }));
}

export function clearItems(what: string) {
  store.edit((p) => {
    switch (what) {
      case "subtitles":
        return { ...p, cues: [] };
      case "effects":
        return { ...p, effects: [] };
      case "overlays":
        return { ...p, overlays: [] };
      case "texts":
        return { ...p, overlays: p.overlays.filter((o) => o.kind !== "text") };
      case "images":
        return { ...p, overlays: p.overlays.filter((o) => o.kind !== "image") };
      case "music":
        return { ...p, audio: p.audio.filter((a) => a.kind !== "music") };
      case "sound_effects":
        return { ...p, audio: p.audio.filter((a) => a.kind !== "sfx") };
      default:
        return p;
    }
  });
}

export function removeItem(id: string) {
  store.edit((p) => ({
    ...p,
    overlays: p.overlays.filter((o) => o.id !== id),
    audio: p.audio.filter((o) => o.id !== id),
    effects: p.effects.filter((o) => o.id !== id),
    cues: p.cues.filter((o) => o.id !== id),
  }));
}

/** Changes one existing item (text/image, effect, sound/music or subtitle line) by id. */
export function updateItem(id: string, o: Record<string, unknown>): string {
  const p = store.get().project;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);
  const clamp = (v: number | undefined, a: number, b: number) => (v === undefined ? undefined : Math.min(b, Math.max(a, v)));
  const times = (x: { start: number; end: number }) => {
    const start = n(o.start) ?? x.start;
    const end = n(o.end) ?? (n(o.start) !== undefined ? start + (x.end - x.start) : x.end);
    return { start: Math.max(0, start), end: Math.max(start + 0.1, end) };
  };
  const ov = p.overlays.find((x) => x.id === id);
  if (ov) {
    const xy = typeof o.position === "string" ? positionToXY(o.position) : null;
    store.edit((pr) => ({
      ...pr,
      overlays: pr.overlays.map((x) =>
        x.id !== id
          ? x
          : {
              ...x,
              ...times(x),
              text: typeof o.text === "string" ? o.text : x.text,
              color: typeof o.color === "string" ? o.color : x.color,
              preset: PRESETS.includes(o.preset as TextPreset) ? (o.preset as TextPreset) : x.preset,
              animation: anim(o.animation, x.animation),
              fill: x.kind === "image" ? imageFill(o.fill, x.fill ?? "free") : x.fill,
              size: clamp(n(o.size), x.kind === "image" ? 0.05 : 0.3, x.kind === "image" ? 1 : 3) ?? x.size,
              x: clamp(n(o.x), 0, 1) ?? xy?.x ?? x.x,
              y: clamp(n(o.y), 0, 1) ?? xy?.y ?? x.y,
            },
      ),
    }));
    return "Elemento actualizado.";
  }
  const fx = p.effects.find((x) => x.id === id);
  if (fx) {
    store.edit((pr) => ({
      ...pr,
      effects: pr.effects.map((x) =>
        x.id !== id
          ? x
          : {
              ...x,
              ...times(x),
              type: (EFFECT_TYPES as readonly string[]).includes(o.effect as string) ? (o.effect as EffectType) : x.type,
              intensity: clamp(n(o.intensity), 0, 1) ?? x.intensity,
            },
      ),
    }));
    return "Efecto actualizado.";
  }
  const au = p.audio.find((x) => x.id === id);
  if (au) {
    store.edit((pr) => ({
      ...pr,
      audio: pr.audio.map((x) => {
        if (x.id !== id) return x;
        const start = Math.max(0, n(o.start) ?? x.start);
        const end = n(o.end);
        return {
          ...x,
          start,
          duration: end !== undefined && x.kind === "music" ? Math.max(0.2, end - start) : x.duration,
          volume: clamp(n(o.volume), 0, 2) ?? x.volume,
        };
      }),
    }));
    return "Audio actualizado.";
  }
  const cue = p.cues.find((x) => x.id === id);
  if (cue) {
    store.edit((pr) => ({
      ...pr,
      cues: pr.cues.map((x) => (x.id !== id ? x : { ...x, ...times(x), text: typeof o.text === "string" ? o.text : x.text })),
    }));
    return "Subtítulo actualizado.";
  }
  throw new Error(`No existe ningún elemento con id ${id}. Revisa los ids en el estado del proyecto.`);
}

export function deleteItems(ids: string[]): number {
  const set = new Set(ids);
  const p = store.get().project;
  const count =
    p.overlays.filter((x) => set.has(x.id)).length +
    p.effects.filter((x) => set.has(x.id)).length +
    p.audio.filter((x) => set.has(x.id)).length +
    p.cues.filter((x) => set.has(x.id)).length;
  if (count)
    store.edit((pr) => ({
      ...pr,
      overlays: pr.overlays.filter((x) => !set.has(x.id)),
      effects: pr.effects.filter((x) => !set.has(x.id)),
      audio: pr.audio.filter((x) => !set.has(x.id)),
      cues: pr.cues.filter((x) => !set.has(x.id)),
    }));
  return count;
}

export function deleteSelection() {
  const sel = store.get().selection;
  if (!sel) return;
  if (sel.kind === "clip") store.edit((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== sel.id) }));
  else removeItem(sel.id);
  store.set({ selection: null });
}

/** Text snapshot of the project that is sent to the AI with every instruction. */
export function describeProject(): string {
  const s = store.get();
  const p = s.project;
  const starts = clipStarts(p);
  const name = (id?: string) => s.assets.find((a) => a.id === id)?.name ?? "?";
  const L: string[] = [];
  L.push(describeBrand(s.brand));
  const refs = describeActiveRefs();
  if (refs) L.push(refs);
  L.push(`Formato: ${p.aspect} (encuadre: ${p.fit}). Duración total: ${totalDuration(p).toFixed(2)}s. Cabezal en ${s.time.toFixed(2)}s.`);
  L.push("\nMedios subidos:");
  if (!s.assets.length) L.push("  (ninguno)");
  for (const a of s.assets) {
    const extra =
      a.kind === "video"
        ? `${a.duration.toFixed(1)}s, ${a.width}x${a.height}, transcrito: ${s.transcripts[a.id] ? "sí" : "no"}`
        : a.kind === "audio"
          ? `${a.duration.toFixed(1)}s`
          : `${a.width}x${a.height}`;
    L.push(`  - ${a.kind} "${a.name}" (${extra})`);
  }
  L.push("\nPista de video (clips en orden):");
  if (!p.clips.length) L.push("  (vacía)");
  p.clips.forEach((c, i) =>
    L.push(
      `  ${i + 1}. [${starts[i].toFixed(2)}–${(starts[i] + c.out - c.in).toFixed(2)}] "${name(c.assetId)}" fuente ${c.in.toFixed(2)}–${c.out.toFixed(2)}, volumen ${Math.round(c.volume * 100)}%`,
    ),
  );
  L.push(`\nSubtítulos: ${p.cues.length} líneas, estilo ${p.subtitleStyle.preset} (${p.subtitleStyle.position}, color ${p.subtitleStyle.color}, resaltado ${p.subtitleStyle.highlight}, ${p.subtitleStyle.wordsPerCue} palabras por línea).`);
  if (p.overlays.length) {
    L.push("Textos e imágenes superpuestos (posición x,y de 0 a 1 desde arriba a la izquierda):");
    for (const o of p.overlays)
      L.push(
        `  - [${o.id}] ${o.kind === "text" ? `texto "${o.text}" (${o.preset}${o.color ? `, color ${o.color}` : ""})` : `imagen "${name(o.assetId)}"`} ${o.start.toFixed(2)}–${o.end.toFixed(2)}s, ${o.kind === "image" && (o.fill === "cover" || o.fill === "contain") ? `pantalla completa (${o.fill})` : `x=${o.x.toFixed(2)} y=${o.y.toFixed(2)}, tamaño ${o.size.toFixed(2)}`}, animación ${o.animation}`,
      );
  }
  if (p.audio.length) {
    L.push("Audio añadido:");
    for (const a of p.audio)
      L.push(`  - [${a.id}] ${a.kind === "music" ? "música" : "efecto de sonido"} "${a.name}" en ${a.start.toFixed(2)}s, dura ${a.duration.toFixed(2)}s, volumen ${Math.round(a.volume * 100)}%`);
  }
  if (p.effects.length) {
    L.push("Efectos visuales:");
    for (const e of p.effects) L.push(`  - [${e.id}] ${e.type} ${e.start.toFixed(2)}–${e.end.toFixed(2)}s, intensidad ${e.intensity}`);
  }
  if (p.cues.length) {
    L.push(`Líneas de subtítulos (${p.cues.length}):`);
    for (const c of p.cues.slice(0, 120)) L.push(`  - [${c.id}] ${c.start.toFixed(2)}–${c.end.toFixed(2)}s "${c.text}"`);
    if (p.cues.length > 120) L.push(`  … y ${p.cues.length - 120} más`);
  }
  return L.join("\n");
}

export function exportFileName(ext: string) {
  const first = store.get().assets.find((a) => a.kind === "video");
  const base = first ? first.name.replace(/\.[^.]+$/, "") : "video";
  return `${base}-impulsa.${ext}`;
}

export { getPlayer };
