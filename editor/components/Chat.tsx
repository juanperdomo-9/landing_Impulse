"use client";

import { useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { describeProject } from "@/lib/actions";
import { executeTool, framesForAI, storyboardTimes } from "@/lib/aiExecutor";
import { imageThumb } from "@/lib/media";
import { getPlayer } from "@/lib/player";
import { store, useEditor } from "@/lib/store";
import { withBase } from "@/lib/paths";
import { IconBrandBars } from "./Icons";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

interface UiItem {
  role: "user" | "assistant" | "action" | "error";
  text: string;
}

const SUGGESTIONS = [
  "Hazlo vertical para TikTok y pon subtítulos estilo TikTok",
  "Quita los silencios y las pausas largas",
  "Añade un título llamativo en los primeros 3 segundos",
  "Pon zoom y un whoosh en los momentos más importantes",
  "Agrega la música de fondo bajita con fundido al final",
  "Haz un clip de 30 segundos con lo mejor",
  "Pon mi marca y un cartel con mi WhatsApp al final",
  "Escribime el texto para publicarlo en Instagram",
];

const TOOL_LABELS: Record<string, string> = {
  get_transcript: "Leyendo lo que se dice en el video",
  add_subtitles: "Generando subtítulos",
  style_subtitles: "Ajustando estilo de subtítulos",
  edit_subtitle_text: "Corrigiendo subtítulos",
  remove_silences: "Eliminando silencios",
  cut_ranges: "Cortando tramos",
  keep_only_ranges: "Seleccionando los mejores momentos",
  add_image: "Añadiendo imagen",
  add_text: "Añadiendo texto",
  add_music: "Añadiendo música",
  add_sound_effect: "Añadiendo efecto de sonido",
  add_effect: "Añadiendo efecto visual",
  set_format: "Cambiando formato",
  set_video_volume: "Ajustando volumen",
  apply_brand: "Aplicando tu marca",
  view_frames: "Mirando el video",
  update_item: "Ajustando un elemento",
  delete_items: "Quitando elementos",
  undo: "Deshaciendo cambios",
  clear: "Limpiando elementos",
};

const MAX_STEPS = 14;
// request size budget (the server accepts up to ~8 MB; this keeps requests fast and cheap)
const MAX_BYTES = 3_200_000;

/** Instructions (with their tool steps) kept in what is sent to the AI. */
const KEEP_INSTRUCTIONS = 8;
/** Instructions whose images (video storyboard, uploaded photos) are still sent: older storyboards are out of date. */
const KEEP_IMAGES_FOR = 1;
/** Most images sent in one request (newest first); the server rejects more than 60. */
const MAX_SENT_IMAGES = 50;
/** New uploaded photos shown to the AI per instruction. */
const MAX_NEW_IMAGES = 6;
/** Tool results of earlier instructions are trimmed to this many characters. */
const OLD_RESULT_CHARS = 2000;

const isInstruction = (m: Msg) =>
  m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "text");

/**
 * What is actually sent to the AI: the last few instructions only, with images and the project state
 * kept just where they matter. Older turns keep their text, so the AI still remembers the conversation,
 * and every request stays small and cheap however long the session gets.
 */
function compactHistory(history: Msg[]): Msg[] {
  const starts = history.flatMap((m, i) => (isInstruction(m) ? [i] : []));
  const from = starts.length > KEEP_INSTRUCTIONS ? starts[starts.length - KEEP_INSTRUCTIONS] : 0;
  const keepImagesFrom = starts.length > KEEP_IMAGES_FOR ? starts[starts.length - KEEP_IMAGES_FOR] : 0;
  const latest = starts[starts.length - 1] ?? 0;

  const compacted = history.slice(from).map((m, k) => {
    const i = from + k;
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    if (!isInstruction(m)) {
      // tool results of earlier instructions (e.g. a long transcript): a short excerpt is enough
      if (i >= latest) return m;
      const content = m.content.map((b) =>
        b.type === "tool_result" && typeof b.content === "string" && b.content.length > OLD_RESULT_CHARS
          ? { ...b, content: `${b.content.slice(0, OLD_RESULT_CHARS)}… [recortado]` }
          : b,
      );
      return { ...m, content };
    }
    const content = m.content.map((b) => {
      if (b.type === "image" && i < keepImagesFrom) return { type: "text" as const, text: "[imagen anterior omitida]" };
      if (b.type === "text" && i < latest && b.text.startsWith("<estado_del_proyecto>"))
        return { type: "text" as const, text: "[estado anterior del proyecto omitido]" };
      return b;
    });
    return { ...m, content };
  });

  return capImages(compacted);
}

const IMAGE_OMITTED = { type: "text" as const, text: "[imagen anterior omitida]" };

/** Keeps only the newest MAX_SENT_IMAGES images (storyboard, photos and frames the AI asked to see). */
function capImages(history: Msg[]): Msg[] {
  let left = MAX_SENT_IMAGES;
  const out: Msg[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user" || !Array.isArray(m.content)) {
      out.unshift(m);
      continue;
    }
    const content = [...m.content].reverse().map((b) => {
      if (b.type === "image") return left-- > 0 ? b : IMAGE_OMITTED;
      if (b.type === "tool_result" && Array.isArray(b.content)) {
        const inner = [...b.content].reverse().map((c) => (c.type === "image" ? (left-- > 0 ? c : IMAGE_OMITTED) : c));
        return { ...b, content: inner.reverse() };
      }
      return b;
    });
    out.unshift({ ...m, content: content.reverse() } as Msg);
  }
  return out;
}

export default function Chat({ usage: initialUsage }: { usage?: { used: number; limit: number } }) {
  const [usage, setUsage] = useState(initialUsage);
  const [items, setItems] = useState<UiItem[]>([
    {
      role: "assistant",
      text: "¡Hola! Soy tu editor con IA. Sube tus videos y dime qué quieres: subtítulos, cortes, fotos, música, sonidos o efectos. Yo me encargo.",
    },
  ]);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const history = useRef<Msg[]>([]);
  const sentImages = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement>(null);
  const hasVideo = useEditor((s) => s.project.clips.length > 0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  // other panels (e.g. "Editar con este estilo") can send a message to the assistant
  const sendRef = useRef<(t: string) => void>(() => undefined);
  sendRef.current = (t) => void send(t);
  useEffect(() => {
    const on = (e: Event) => sendRef.current((e as CustomEvent<string>).detail);
    window.addEventListener("impulsa-chat", on);
    return () => window.removeEventListener("impulsa-chat", on);
  }, []);

  const push = (it: UiItem) => setItems((x) => [...x, it]);

  async function send(text: string) {
    if (!text.trim() || working) return;
    setInput("");
    push({ role: "user", text });
    setWorking(true);
    getPlayer()?.pause();
    const snapshot = history.current.length;
    const undoMark = store.get().past.length;

    try {
      if (process.env.NEXT_PUBLIC_DEMO === "1")
        throw new Error(
          "En esta vista previa el asistente IA no está conectado. Cuando la web esté instalada con tu clave de Claude, aquí la IA hará los cambios por ti. Mientras tanto, prueba las herramientas del panel izquierdo.",
        );
      // project state + any new images the AI hasn't seen yet + a frame of the current video
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: "text", text: `<estado_del_proyecto>\n${describeProject()}\n</estado_del_proyecto>` },
      ];
      let newImages = 0;
      for (const a of store.get().assets) {
        if (a.kind !== "image" || sentImages.current.has(a.id)) continue;
        if (newImages++ >= MAX_NEW_IMAGES) break;
        try {
          content.push({ type: "text", text: `Imagen subida "${a.name}":` });
          content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imageThumb(a) } });
          sentImages.current.add(a.id);
        } catch {
          /* ignore unreadable image */
        }
      }
      // storyboard: frames across the whole edited video so the AI knows what it contains
      if (store.get().project.clips.length) {
        try {
          const frames = await framesForAI(storyboardTimes(), 320);
          content.push({ type: "text", text: "Tira de fotogramas del video editado (segundos de la línea de tiempo):" });
          content.push(...frames);
        } catch {
          /* continue without frames */
        }
      }
      content.push({ type: "text", text });
      // keep requests under the hosting limit: when the conversation gets heavy (many images),
      // start a fresh one. Every instruction carries the full project state, so nothing is lost.
      if (history.current.length && JSON.stringify(history.current).length + JSON.stringify(content).length > MAX_BYTES) {
        history.current = [];
      }
      history.current.push({ role: "user", content });

      for (let step = 0; step < MAX_STEPS; step++) {
        if (JSON.stringify(compactHistory(history.current)).length > MAX_BYTES + 600_000) {
          push({ role: "error", text: "La instrucción se hizo demasiado larga. Pedila de nuevo en partes más chicas." });
          break;
        }
        const res = await fetch(withBase("/api/assistant"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: compactHistory(history.current) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        if (data.usage) setUsage(data.usage);
        const blocks: Block[] = data.content;
        history.current.push({ role: "assistant", content: blocks as Anthropic.Beta.BetaContentBlockParam[] });

        for (const b of blocks) if (b.type === "text" && b.text.trim()) push({ role: "assistant", text: b.text.trim() });

        const uses = blocks.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (data.stop_reason !== "tool_use" || !uses.length) {
          if (data.stop_reason === "max_tokens") push({ role: "error", text: "La respuesta se cortó. Intenta con una petición más concreta." });
          break;
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const u of uses) {
          push({ role: "action", text: TOOL_LABELS[u.name] ?? u.name });
          try {
            const input = u.input && typeof u.input === "object" ? (u.input as Record<string, unknown>) : {};
            const out = await executeTool(u.name, input);
            results.push({ type: "tool_result", tool_use_id: u.id, content: out });
          } catch (e) {
            results.push({ type: "tool_result", tool_use_id: u.id, content: (e as Error).message, is_error: true });
          }
        }
        history.current.push({ role: "user", content: results });
        if (step === MAX_STEPS - 1) push({ role: "error", text: "Se alcanzó el límite de pasos para esta instrucción." });
      }
    } catch (e) {
      // keep the conversation valid: drop this unfinished exchange
      history.current = history.current.slice(0, snapshot);
      push({ role: "error", text: (e as Error).message });
    } finally {
      setWorking(false);
      const changes = store.get().past.length - undoMark;
      if (changes > 0) push({ role: "action", text: `✓ ${changes} cambio${changes > 1 ? "s" : ""} aplicado${changes > 1 ? "s" : ""} — puedes deshacerlos con ↶` });
    }
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--panel)] md:h-auto md:w-[360px] md:border-l md:border-[var(--line)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--line)] px-4">
        <span className="brand-mark h-7 w-7">
          <IconBrandBars size={15} />
        </span>
        <span className="font-bold">Asistente IA</span>
        {usage && (
          <span className="ml-auto text-[11px] text-[var(--muted)] tabular-nums" title="Instrucciones a la IA usadas este mes">
            {usage.used}/{usage.limit} este mes
          </span>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {items.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "action" ? (
              <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
                <span className="text-[var(--accent)]">●</span> {m.text}
              </div>
            ) : (
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "grad text-white"
                    : m.role === "error"
                      ? "border border-red-500/40 bg-red-500/10 text-red-300"
                      : "bg-[var(--panel-2)]"
                }`}
              >
                {m.text}
              </div>
            )}
          </div>
        ))}
        {working && (
          <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Pensando y editando…
          </div>
        )}
        <div ref={endRef} />
      </div>
      {hasVideo && items.length < 3 && (
        <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 md:flex-wrap md:overflow-visible">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-left text-[11px] whitespace-nowrap text-[var(--muted)] hover:border-[var(--accent)] hover:text-white md:shrink md:whitespace-normal"
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="border-t border-[var(--line)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[44px] resize-none"
            rows={2}
            placeholder={hasVideo ? "Ej: pon subtítulos amarillos y quita los silencios" : "Primero sube un video…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="btn btn-primary h-[44px]" disabled={working || !input.trim()}>
            ➤
          </button>
        </div>
      </form>
    </aside>
  );
}
