export type AssetKind = "video" | "image" | "audio";

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  file: File;
}

/** A piece of a source video placed on the main track. Clips play one after another. */
/** What is stored about a file in a saved project (the file itself stays on the device). */
export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  duration: number;
  width?: number;
  height?: number;
  size: number;
  type: string;
}

export interface Clip {
  id: string;
  assetId: string;
  in: number; // source time (s)
  out: number; // source time (s)
  volume: number; // 0..2
}

export type Animation = "none" | "fade" | "pop" | "slide_up" | "typewriter";
export type Position =
  | "center"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type TextPreset = "titulo" | "subtitulo" | "etiqueta" | "cta";

export interface Overlay {
  id: string;
  kind: "image" | "text";
  assetId?: string;
  text?: string;
  preset?: TextPreset;
  color?: string;
  start: number;
  end: number;
  /** center of the overlay, normalized 0..1 */
  x: number;
  y: number;
  /** image: width as fraction of canvas width; text: font size multiplier */
  size: number;
  /**
   * images only: "cover" fills the whole frame (crops), "contain" shows the whole photo over a blurred
   * copy of itself, "free" uses x / y / size (logos, small pictures). Missing = "free".
   */
  fill?: "cover" | "contain" | "free";
  animation: Animation;
}

export const SFX_NAMES = [
  "whoosh",
  "pop",
  "ding",
  "boom",
  "click",
  "riser",
  "tada",
  "buzzer",
  "glitch",
  "bubble",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface AudioItem {
  id: string;
  kind: "music" | "sfx";
  assetId?: string;
  sfx?: SfxName;
  name: string;
  start: number; // timeline
  duration: number;
  offset: number; // start offset inside the source
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export type SubtitlePreset = "tiktok" | "clasico" | "karaoke" | "minimal" | "neon";

export interface SubtitleStyle {
  preset: SubtitlePreset;
  fontSize: number; // px at a 720px reference
  color: string;
  highlight: string;
  position: "top" | "middle" | "bottom";
  uppercase: boolean;
  background: boolean;
  wordsPerCue: number;
  /** which audio the subtitles come from: the voice of the clips, the background song, or both */
  source?: "video" | "music" | "all";
}

export const EFFECT_TYPES = [
  "blanco_negro",
  "sepia",
  "vintage",
  "desenfoque",
  "brillo",
  "contraste",
  "saturacion",
  "vineta",
  "zoom",
  "temblor",
  "fundido_entrada",
  "fundido_salida",
  "flash",
  "glitch",
  "cine",
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const EFFECT_LABELS: Record<EffectType, string> = {
  blanco_negro: "Blanco y negro",
  sepia: "Sepia",
  vintage: "Vintage",
  desenfoque: "Desenfoque",
  brillo: "Brillo",
  contraste: "Contraste",
  saturacion: "Saturación",
  vineta: "Viñeta",
  zoom: "Zoom (punch-in)",
  temblor: "Temblor de cámara",
  fundido_entrada: "Fundido de entrada",
  fundido_salida: "Fundido de salida",
  flash: "Flash blanco",
  glitch: "Glitch",
  cine: "Barras de cine",
};

export interface Effect {
  id: string;
  type: EffectType;
  start: number;
  end: number;
  intensity: number; // 0..1
}

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
export type Fit = "cover" | "contain" | "blur";

export interface Project {
  aspect: Aspect;
  fit: Fit;
  clips: Clip[];
  overlays: Overlay[];
  audio: AudioItem[];
  cues: Cue[];
  subtitleStyle: SubtitleStyle;
  effects: Effect[];
  /** font family used for texts and subtitles (brand font) */
  font?: string;
  /** default background color for label / call-to-action texts (brand color) */
  brandColor?: string;
}

export interface BrandKit {
  name: string;
  description: string; // qué vende, a quién, tono
  tone: string;
  font: string;
  primary: string;
  secondary: string;
  text: string;
  logo: string | null; // data URL (PNG), max ~512px
  whatsapp: string;
  instagram: string;
  website: string;
  phrases: string; // una por línea: "Envíos a todo el país", "3 cuotas sin interés"
  hashtags: string;
  /** Reels the user likes, analyzed by the AI so it can imitate their style */
  references?: StyleRef[];
}

export interface StyleRef {
  id: string;
  name: string;
  createdAt: string;
  thumb: string; // small JPEG data URL
  duration: number;
  aspect: string;
  cuts: number;
  avgShot: number; // seconds between cuts
  profile: string; // style description written by the AI
  notes: string; // what the user likes about it
  link: string;
}

export interface Segment {
  start: number; // source time
  end: number;
  text: string;
}

export type Selection =
  | { kind: "clip" | "overlay" | "audio" | "cue" | "effect"; id: string }
  | null;
