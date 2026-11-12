"use client";

import { useEffect, useRef, useState } from "react";
import { getPlayer } from "@/lib/player";
import { clipDur, clipStarts, contentDuration } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import type { Project, Selection } from "@/lib/types";
import { EFFECT_LABELS } from "@/lib/types";

type Kind = NonNullable<Selection>["kind"];
const LABEL_W_DESKTOP = 92;
const LABEL_W_MOBILE = 64;

interface Item {
  id: string;
  kind: Kind;
  start: number;
  end: number;
  label: string;
  color: string;
}

export default function Timeline({ mobile = false }: { mobile?: boolean }) {
  const LABEL_W = mobile ? LABEL_W_MOBILE : LABEL_W_DESKTOP;
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const [pps, setPps] = useState(mobile ? 24 : 40); // pixels per second
  const scrollRef = useRef<HTMLDivElement>(null);

  // follow the playhead (while playing or dragging) so it never leaves the screen
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = LABEL_W + time * pps;
    const left = el.scrollLeft + LABEL_W + 16;
    const right = el.scrollLeft + el.clientWidth - 24;
    if (x < left) el.scrollLeft = Math.max(0, x - LABEL_W - 40);
    else if (x > right) el.scrollLeft = x - el.clientWidth + 80;
  }, [time, pps, LABEL_W]);

  const duration = Math.max(contentDuration(project), 10);
  const width = duration * pps + 200;
  const name = (id?: string) => assets.find((a) => a.id === id)?.name ?? "";

  const starts = clipStarts(project);
  const rows: { title: string; items: Item[] }[] = [
    {
      title: "Video",
      items: project.clips.map((c, i) => ({
        id: c.id,
        kind: "clip",
        start: starts[i],
        end: starts[i] + clipDur(c),
        label: name(c.assetId),
        color: i % 2 ? "#4c3a99" : "#5b45b8",
      })),
    },
    {
      title: "Fotos",
      items: project.overlays
        .filter((o) => o.kind === "image")
        .map((o) => ({
          id: o.id,
          kind: "overlay" as const,
          start: o.start,
          end: o.end,
          label: `🖼 ${name(o.assetId)}`,
          color: "#a1531f",
        })),
    },
    {
      title: "Textos",
      items: project.overlays
        .filter((o) => o.kind === "text")
        .map((o) => ({
          id: o.id,
          kind: "overlay" as const,
          start: o.start,
          end: o.end,
          label: `T  ${o.text}`,
          color: "#b4367a",
        })),
    },
    {
      title: mobile ? "Subs" : "Subtítulos",
      items: project.cues.map((c) => ({
        id: c.id,
        kind: "cue",
        start: c.start,
        end: c.end,
        label: c.text,
        color: "#1f6f8b",
      })),
    },
    {
      title: "Efectos",
      items: project.effects.map((e) => ({
        id: e.id,
        kind: "effect",
        start: e.start,
        end: e.end,
        label: `✨ ${EFFECT_LABELS[e.type]}`,
        color: "#2f7a4a",
      })),
    },
    {
      title: "Música",
      items: project.audio
        .filter((a) => a.kind === "music")
        .map((a) => ({ id: a.id, kind: "audio", start: a.start, end: a.start + a.duration, label: `♪ ${a.name}`, color: "#7a6a1f" })),
    },
    {
      title: "Sonidos",
      items: project.audio
        .filter((a) => a.kind === "sfx")
        .map((a) => ({ id: a.id, kind: "audio", start: a.start, end: a.start + a.duration, label: `🔊 ${a.sfx}`, color: "#8a3b3b" })),
    },
  ];

  const tFromEvent = (e: { clientX: number }) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left + el.scrollLeft - LABEL_W) / pps);
  };

  const scrub = (e: React.PointerEvent) => {
    getPlayer()?.seek(tFromEvent(e));
    const move = (ev: PointerEvent) => getPlayer()?.seek(tFromEvent(ev));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // on touch screens rows scroll natively; a tap moves the playhead
  const rowDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    scrub(e);
  };

  const startDrag = (e: React.PointerEvent, it: Item, mode: "move" | "resize") => {
    e.stopPropagation();
    store.set({ selection: { kind: it.kind, id: it.id } });
    // with a finger, tapping selects (times are edited in "Editar"); dragging would fight scrolling
    if (it.kind === "clip" || e.pointerType === "touch") return;
    const before = store.get().project;
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps;
      store.set({ project: shiftItem(before, it, mode, dt) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (store.get().project !== before) store.set((s) => ({ past: [...s.past, before], future: [] }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ruler ticks
  const step = pps > 80 ? 1 : pps > 30 ? 2 : pps > 12 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 4; t += step) ticks.push(t);

  return (
    <div className={`flex shrink-0 flex-col bg-[var(--panel)] ${mobile ? "h-full" : "h-[19rem] border-t border-[var(--line)]"}`}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 text-xs">
        <span className="label">Línea de tiempo</span>
        <div className="flex-1" />
        <span className="text-[var(--muted)]">Zoom</span>
        <input type="range" min={6} max={160} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
      </div>
      <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: width + LABEL_W }} className="relative min-h-full">
          <div className={`sticky top-0 z-20 flex bg-[var(--panel)] ${mobile ? "h-9" : "h-6"}`}>
            <div style={{ width: LABEL_W }} className="sticky left-0 z-10 shrink-0 bg-[var(--panel)]" />
            <div className="relative flex-1 cursor-ew-resize border-b border-[var(--line)]" style={{ touchAction: "none" }} onPointerDown={scrub}>
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-[var(--line)] pl-1 text-[10px] text-[var(--muted)]" style={{ left: t * pps }}>
                  {Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div key={row.title} className="flex h-9 border-b border-[#1c1c29]">
              <div
                style={{ width: LABEL_W }}
                className="sticky left-0 z-10 flex shrink-0 items-center bg-[var(--panel)] px-2 text-[11px] font-semibold text-[var(--muted)]"
              >
                {row.title}
              </div>
              <div
                className="relative flex-1"
                onPointerDown={rowDown}
                onClick={(e) => mobile && getPlayer()?.seek(tFromEvent(e))}
              >
                {row.items.map((it) => {
                  const sel = selection?.id === it.id;
                  return (
                    <div
                      key={it.id}
                      onPointerDown={(e) => startDrag(e, it, "move")}
                      className={`absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md px-1.5 text-[11px] leading-7 whitespace-nowrap text-white ${sel ? "ring-2 ring-white" : ""}`}
                      style={{ left: it.start * pps, width: Math.max(4, (it.end - it.start) * pps - 1), background: it.color }}
                      title={it.label}
                    >
                      {it.label}
                      {it.kind !== "clip" && (
                        <span
                          className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-white/30"
                          onPointerDown={(e) => startDrag(e, it, "resize")}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-[#ff4d6d]" style={{ left: LABEL_W + time * pps }}>
            {/* big grab handle: drag the playhead back and forth */}
            <div
              className="pointer-events-auto absolute -top-0.5 -left-4 grid h-8 w-8 cursor-ew-resize place-items-start justify-center"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                scrub(e);
              }}
              title="Arrastrá para moverte por el video"
            >
              <div className={`rotate-45 rounded-sm bg-[#ff4d6d] shadow ${mobile ? "mt-1 h-4 w-4" : "mt-0.5 h-3 w-3"}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shiftItem(p: Project, it: Item, mode: "move" | "resize", dt: number): Project {
  const mv = <T extends { id: string; start: number; end: number }>(x: T): T => {
    if (x.id !== it.id) return x;
    if (mode === "move") {
      const s = Math.max(0, x.start + dt);
      return { ...x, start: s, end: s + (x.end - x.start) };
    }
    return { ...x, end: Math.max(x.start + 0.1, x.end + dt) };
  };
  switch (it.kind) {
    case "overlay":
      return { ...p, overlays: p.overlays.map(mv) };
    case "cue":
      return { ...p, cues: p.cues.map(mv) };
    case "effect":
      return { ...p, effects: p.effects.map(mv) };
    case "audio":
      return {
        ...p,
        audio: p.audio.map((a) => {
          if (a.id !== it.id) return a;
          if (mode === "move") return { ...a, start: Math.max(0, a.start + dt) };
          return { ...a, duration: Math.max(0.1, a.duration + dt) };
        }),
      };
    default:
      return p;
  }
}
