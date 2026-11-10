"use client";

import { useRef, useState } from "react";
import { getPlayer } from "@/lib/player";
import { clipDur, clipStarts, contentDuration } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import type { Project, Selection } from "@/lib/types";
import { EFFECT_LABELS } from "@/lib/types";

type Kind = NonNullable<Selection>["kind"];
const LABEL_W = 92;

interface Item {
  id: string;
  kind: Kind;
  start: number;
  end: number;
  label: string;
  color: string;
}

export default function Timeline() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const [pps, setPps] = useState(40); // pixels per second
  const scrollRef = useRef<HTMLDivElement>(null);

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
      title: "Textos/Fotos",
      items: project.overlays.map((o) => ({
        id: o.id,
        kind: "overlay",
        start: o.start,
        end: o.end,
        label: o.kind === "text" ? `T  ${o.text}` : `🖼 ${name(o.assetId)}`,
        color: o.kind === "text" ? "#b4367a" : "#a1531f",
      })),
    },
    {
      title: "Subtítulos",
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

  const startDrag = (e: React.PointerEvent, it: Item, mode: "move" | "resize") => {
    e.stopPropagation();
    store.set({ selection: { kind: it.kind, id: it.id } });
    if (it.kind === "clip") return;
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
    <div className="flex h-[19rem] shrink-0 flex-col border-t border-[var(--line)] bg-[var(--panel)]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 text-xs">
        <span className="label">Línea de tiempo</span>
        <div className="flex-1" />
        <span className="text-[var(--muted)]">Zoom</span>
        <input type="range" min={6} max={160} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
      </div>
      <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: width + LABEL_W }} className="relative min-h-full">
          <div className="sticky top-0 z-20 flex h-6 bg-[var(--panel)]">
            <div style={{ width: LABEL_W }} className="sticky left-0 z-10 shrink-0 bg-[var(--panel)]" />
            <div className="relative flex-1 cursor-ew-resize border-b border-[var(--line)]" onPointerDown={scrub}>
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
              <div className="relative flex-1" onPointerDown={scrub}>
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
            <div className="absolute -top-0 -left-1.5 h-3 w-3 rotate-45 bg-[#ff4d6d]" />
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
