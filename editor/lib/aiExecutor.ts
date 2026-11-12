"use client";

import * as A from "./actions";
import { applyBrand } from "./brand";
import { WHISPER_MODELS } from "./media";
import { getPlayer } from "./player";
import { totalDuration } from "./project";
import { store } from "./store";

type Input = Record<string, unknown>;
const ranges = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((r) => ({ start: Number(r?.start), end: Number(r?.end) }))
    .filter((r) => isFinite(r.start) && isFinite(r.end) && r.end > r.start);

export type ToolOutput =
  | string
  | ({ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } })[];

/** Frames of the edited video at the given times, labeled, ready to show the AI. */
export async function framesForAI(times: number[], maxSide = 360): Promise<Exclude<ToolOutput, string>> {
  const player = getPlayer();
  const dur = totalDuration(store.get().project);
  if (!player || dur <= 0) return [{ type: "text", text: "No hay video en la línea de tiempo." }];
  const ts = times.map((t) => Math.min(Math.max(0, t), Math.max(0, dur - 0.05)));
  const frames = await player.renderFrames(ts, maxSide);
  return frames.flatMap((f) => [
    { type: "text" as const, text: `Segundo ${f.t.toFixed(1)}:` },
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.data } },
  ]);
}

/** Evenly spaced frames covering the whole video (the "storyboard" sent with each instruction). */
export function storyboardTimes(): number[] {
  const dur = totalDuration(store.get().project);
  if (dur <= 0) return [];
  const n = Math.max(3, Math.min(8, Math.round(dur / 5)));
  return Array.from({ length: n }, (_, i) => (dur * (i + 0.5)) / n);
}

/** Runs one AI tool call against the editor and returns a result for the model (text, or frames). */
export async function executeTool(name: string, input: Input): Promise<ToolOutput> {
  switch (name) {
    case "get_transcript": {
      const p = store.get().project;
      const songs = p.audio.some((a) => a.kind === "music" && a.assetId);
      if (!p.clips.length && !songs) return "No hay videos ni música en el proyecto.";
      if (p.clips.length) await A.ensureTranscripts(undefined, "video");
      // background songs too, with the most accurate model (lyrics are hard to understand)
      if (songs) await A.ensureTranscripts(undefined, "music", A.isPhone() ? WHISPER_MODELS.equilibrado : WHISPER_MODELS.preciso);
      const t = A.transcriptForAI();
      return t || "No se detectó voz ni letra en el audio.";
    }
    case "add_subtitles": {
      const n = await A.addSubtitles(input as Parameters<typeof A.addSubtitles>[0]);
      return n ? `Listo: ${n} líneas de subtítulos creadas.` : "No se detectó voz, no se crearon subtítulos.";
    }
    case "style_subtitles":
      A.styleSubtitles(input);
      return "Estilo de subtítulos actualizado.";
    case "edit_subtitle_text": {
      const find = String(input.find ?? "");
      const rep = String(input.replace ?? "");
      if (!find) return "Falta el texto a buscar.";
      let n = 0;
      const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      store.edit((p) => ({
        ...p,
        cues: p.cues.map((c) => {
          if (!re.test(c.text)) return c;
          re.lastIndex = 0;
          n++;
          return { ...c, text: c.text.replace(re, rep) };
        }),
      }));
      return `${n} líneas corregidas.`;
    }
    case "remove_silences": {
      const r = await A.removeSilences(
        typeof input.min_silence_seconds === "number" ? input.min_silence_seconds : undefined,
        typeof input.padding_seconds === "number" ? input.padding_seconds : undefined,
      );
      return `Se hicieron ${r.cuts} cortes y se eliminaron ${r.removed.toFixed(1)}s de silencio. Nueva duración: ${r.duration.toFixed(1)}s.`;
    }
    case "cut_ranges": {
      const removed = A.cutRanges(ranges(input.ranges));
      return `Eliminados ${removed.toFixed(1)}s. Nueva duración: ${store.get().project.clips.reduce((a, c) => a + c.out - c.in, 0).toFixed(1)}s.`;
    }
    case "keep_only_ranges": {
      const d = A.keepRanges(ranges(input.ranges));
      return `Listo. Nueva duración: ${d.toFixed(1)}s.`;
    }
    case "add_image":
      A.addImage(input as Parameters<typeof A.addImage>[0]);
      return "Imagen añadida.";
    case "add_text":
      A.addText(input as Parameters<typeof A.addText>[0]);
      return "Texto añadido.";
    case "add_music":
      A.addMusic(input as Parameters<typeof A.addMusic>[0]);
      return "Música añadida.";
    case "add_sound_effect":
      A.addSfx(input as Parameters<typeof A.addSfx>[0]);
      return "Efecto de sonido añadido.";
    case "add_effect":
      A.addEffect(input as Parameters<typeof A.addEffect>[0]);
      return "Efecto añadido.";
    case "set_format":
      A.setFormat(input as Parameters<typeof A.setFormat>[0]);
      return `Formato: ${store.get().project.aspect}, encuadre ${store.get().project.fit}.`;
    case "set_video_volume":
      A.setVideoVolume(Number(input.volume ?? 1));
      return "Volumen actualizado.";
    case "apply_brand": {
      const brand = store.get().brand;
      if (!brand?.name && !brand?.logo)
        return "El cliente todavía no cargó su kit de marca. Pídele que lo complete en la pestaña 🎨 Marca.";
      await applyBrand(brand, {
        logo: input.include_logo !== false,
        logoPosition: (["top-left", "top-right", "bottom-left", "bottom-right"] as const).find((x) => x === input.logo_position),
      });
      return `Marca aplicada: tipografía ${brand.font}, color ${brand.primary}${brand.logo && input.include_logo !== false ? ", logo en la esquina" : ""}.`;
    }
    case "view_frames": {
      const times = (Array.isArray(input.times) ? input.times : []).map(Number).filter((t) => isFinite(t)).slice(0, 6);
      if (!times.length) return "Indica al menos un segundo.";
      return framesForAI(times, 480);
    }
    case "update_item":
      return A.updateItem(String(input.id ?? ""), input);
    case "delete_items": {
      const ids = (Array.isArray(input.ids) ? input.ids : []).map(String);
      const n = A.deleteItems(ids);
      return n ? `${n} elemento(s) eliminado(s).` : "No encontré esos ids.";
    }
    case "undo": {
      const steps = Math.min(20, Math.max(1, Math.round(Number(input.steps ?? 1)) || 1));
      let done = 0;
      for (let i = 0; i < steps && store.get().past.length; i++) {
        store.undo();
        done++;
      }
      return done ? `Se deshicieron ${done} cambio(s).` : "No hay cambios para deshacer.";
    }
    case "clear":
      A.clearItems(String(input.what));
      return "Eliminado.";
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
