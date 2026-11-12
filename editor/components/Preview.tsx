"use client";

import { useEffect, useRef, useState } from "react";
import { addFiles } from "@/lib/media";
import { getPlayer, Player, setPlayer } from "@/lib/player";
import AddMenu from "./AddMenu";
import { canvasSize, contentDuration, fmt } from "@/lib/project";
import { overlayBounds } from "@/lib/render";
import { store, useEditor } from "@/lib/store";
import { IconUpload } from "./Icons";
import type { Project } from "@/lib/types";

export default function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const aspect = useEditor((s) => s.project.aspect);
  const duration = useEditor((s) => contentDuration(s.project));
  const empty = useEditor((s) => s.assets.length === 0 && s.missingAssets.length === 0);
  const waitingFiles = useEditor((s) => s.assets.length === 0 && s.missingAssets.length > 0);
  const picking = useEditor((s) => !!s.eyedropper);
  const [hoverColor, setHoverColor] = useState<string | null>(null);

  useEffect(() => {
    if (!picking) return;
    getPlayer()?.pause();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && store.set({ eyedropper: null });
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [picking]);
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
    // eyedropper: take the color of the tapped pixel
    if (s.eyedropper) {
      const px = canvasRef.current!
        .getContext("2d")!
        .getImageData(Math.max(0, Math.min(w - 1, Math.round(pt.x))), Math.max(0, Math.min(h - 1, Math.round(pt.y))), 1, 1).data;
      const hex = `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      s.eyedropper.apply(hex);
      store.set({ eyedropper: null });
      return;
    }
    const ctx = canvasRef.current!.getContext("2d")!;
    const imgs = getPlayer()?.images ?? new Map();
    // full-screen photos are not dragged (they always fill the frame); a tap there plays/pauses
    const hits = s.project.overlays.filter(
      (o) => s.time >= o.start && s.time < o.end && !(o.kind === "image" && (o.fill === "cover" || o.fill === "contain")),
    );
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
    if (store.get().eyedropper) {
      const pt = toCanvas(e);
      const px = canvasRef.current!
        .getContext("2d")!
        .getImageData(Math.max(0, Math.min(w - 1, Math.round(pt.x))), Math.max(0, Math.min(h - 1, Math.round(pt.y))), 1, 1).data;
      setHoverColor(`rgb(${px[0]},${px[1]},${px[2]})`);
      return;
    }
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
          style={{ width: w * scale, height: h * scale, visibility: empty ? "hidden" : "visible", touchAction: "none" }}
          className={`rounded-md shadow-2xl ${picking ? "cursor-crosshair ring-2 ring-[var(--accent)]" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
        {waitingFiles && (
          <p className="absolute max-w-xs px-4 text-center text-sm text-[var(--muted)]">
            Elegí de nuevo los archivos del proyecto (arriba) para ver el video.
          </p>
        )}
        {picking && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            <span className="h-4 w-4 rounded-full border border-white/50" style={{ background: hoverColor ?? "transparent" }} />
            💧 Tocá el video para tomar un color
            <button
              className="pointer-events-auto ml-1 rounded-full bg-white/15 px-2 text-xs hover:bg-white/25"
              onClick={() => store.set({ eyedropper: null })}
            >
              Cancelar
            </button>
          </div>
        )}
        {empty && (
          <label className="absolute inset-3 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--line)] text-center hover:border-[var(--sun)] md:inset-6">
            <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--bg)] sm:grid">
              <IconUpload size={26} />
            </div>
            <div className="text-lg font-bold">
              <span className="hidden md:inline">Arrastra aquí tus videos en crudo</span>
              <span className="md:hidden">Subí tus videos en crudo</span>
            </div>
            <div className="hidden max-w-sm text-sm text-[var(--muted)] sm:block">
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
      {/* seek bar: drag to move back and forth through the video */}
      <div className="shrink-0 border-t border-[var(--line)] px-3 pt-2 md:px-4">
        <input
          id="seek"
          type="range"
          aria-label="Moverse por el video"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(time, duration)}
          disabled={duration <= 0}
          onChange={(e) => getPlayer()?.seek(Number(e.target.value))}
          className="seek w-full"
        />
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 md:gap-3 md:px-4">
        <button className="btn" onClick={() => getPlayer()?.seek(0)} title="Inicio">
          ⏮
        </button>
        <button className="btn btn-primary w-12 justify-center" onClick={() => getPlayer()?.toggle()} title="Reproducir (Espacio)">
          {playing ? "❚❚" : "▶"}
        </button>
        <AddMenu />
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
