"use client";

import * as A from "./actions";
import { applyBrand } from "./brand";
import { store } from "./store";

type Input = Record<string, unknown>;
const ranges = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((r) => ({ start: Number(r?.start), end: Number(r?.end) }))
    .filter((r) => isFinite(r.start) && isFinite(r.end) && r.end > r.start);

/** Runs one AI tool call against the editor and returns a short text result for the model. */
export async function executeTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "get_transcript": {
      if (!store.get().project.clips.length) return "No hay videos en la línea de tiempo.";
      await A.ensureTranscripts();
      const t = A.transcriptForAI();
      return t || "No se detectó voz en los videos.";
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
    case "clear":
      A.clearItems(String(input.what));
      return "Eliminado.";
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
