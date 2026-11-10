"use client";

import { useEffect, useRef, useState } from "react";
import { addFiles } from "@/lib/media";
import { getPlayer, Player, setPlayer } from "@/lib/player";
import { canvasSize, contentDuration, fmt } from "@/lib/project";
import { overlayBounds } from "@/lib/render";
import { store, useEditor } from "@/lib/store";
import type { Project } from "@/lib/types";

export default function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const aspect = useEditor((s) => s.project.aspect);
  const duration = useEditor((s) => contentDuration(s.project));
  const empty = useEditor((s) => s.assets.length === 0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const p = new Player(canvasRef.current!);
    setPlayer(p);
    // re-register assets if the component remounts
    store.get().assets.forEach((a) => p.addAsset(a));
    return () => {
      p.destroy();
      setPlayer(null);
    };
  }, []);

  useEffect(() => {
    const el = boxRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = canvasSize(aspect);
  const scale = Math.min((box.w - 16) / w, (box.h - 16) / h) || 0;

  // drag overlays directly on the preview
  const drag = useRef<{ id: string; dx: number; dy: number; before: Project } | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const onDown = (e: React.PointerEvent) => {
    const s = store.get();
    const pt = toCanvas(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    const imgs = getPlayer()?.images ?? new Map();
    const hits = s.project.overlays.filter((o) => s.time >= o.start && s.time < o.end);
    for (let i = hits.length - 1; i >= 0; i--) {
      const o = hits[i];
      const b = overlayBounds(o, w, h, imgs, ctx);
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        drag.current = { id: o.id, dx: pt.x - o.x * w, dy: pt.y - o.y * h, before: s.project };
        store.set({ selection: { kind: "overlay", id: o.id } });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }
    getPlayer()?.toggle();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const pt = toCanvas(e);
    const x = Math.min(1, Math.max(0, (pt.x - d.dx) / w));
    const y = Math.min(1, Math.max(0, (pt.y - d.dy) / h));
    store.set((s) => ({
      project: { ...s.project, overlays: s.project.overlays.map((o) => (o.id === d.id ? { ...o, x, y } : o)) },
    }));
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.before !== store.get().project)
      store.set((s) => ({ past: [...s.past, d.before], future: [] }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={boxRef}
        className={`relative flex min-h-0 flex-1 items-center justify-center bg-[#07070c] ${dragOver ? "ring-2 ring-[var(--accent)] ring-inset" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <canvas
          ref={canvasRef}
          width={w}
          height={h}
          style={{ width: w * scale, height: h * scale, visibility: empty ? "hidden" : "visible" }}
          className="rounded-md shadow-2xl"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
        {empty && (
          <label className="absolute inset-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--line)] text-center hover:border-[var(--accent)]">
            <div className="grad grid h-14 w-14 place-items-center rounded-2xl text-2xl text-white">⬆</div>
            <div className="text-lg font-bold">Arrastra aquí tus videos en crudo</div>
            <div className="max-w-sm text-sm text-[var(--muted)]">
              También fotos (logos, imágenes) y música. Todo se procesa en tu navegador.
            </div>
            <span className="btn btn-primary mt-2">Elegir archivos</span>
            <input
              type="file"
              multiple
              accept="video/*,image/*,audio/*"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </label>
        )}
        {empty && process.env.NEXT_PUBLIC_DEMO === "1" && (
          <button
            className="btn absolute bottom-10 z-10"
            onClick={async () => {
              const blob = await (await fetch("sample.webm")).blob();
              addFiles([new File([blob], "video-de-ejemplo.webm", { type: "video/webm" })]);
            }}
          >
            ▶ Probar con un video de ejemplo
          </button>
        )}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-3 border-t border-[var(--line)] px-4">
        <button className="btn" onClick={() => getPlayer()?.seek(0)} title="Inicio">
          ⏮
        </button>
        <button className="btn btn-primary w-12 justify-center" onClick={() => getPlayer()?.toggle()} title="Reproducir (Espacio)">
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="font-mono text-sm tabular-nums">
          {fmt(time)} <span className="text-[var(--muted)]">/ {fmt(duration)}</span>
        </span>
        <div className="flex-1" />
        <span className="hidden text-xs text-[var(--muted)] lg:inline">
          Espacio: reproducir · S: dividir clip · Supr: borrar · ←/→: mover · arrastra textos e imágenes en el visor
        </span>
      </div>
    </div>
  );
}
