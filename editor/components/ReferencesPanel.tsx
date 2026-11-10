"use client";

import { useState } from "react";
import { uid } from "@/lib/project";
import { analyzeVideo, chatSend, saveReferences } from "@/lib/references";
import { store, useEditor } from "@/lib/store";
import type { StyleRef } from "@/lib/types";
import Field from "./Field";

const EMPTY: StyleRef[] = [];

export default function ReferencesPanel() {
  const refs = useEditor((s) => s.brand?.references ?? EMPTY);
  const active = useEditor((s) => s.activeRefs);
  const hasVideo = useEditor((s) => s.project.clips.length > 0);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (id: string) =>
    store.set((s) => ({ activeRefs: s.activeRefs.includes(id) ? s.activeRefs.filter((x) => x !== id) : [...s.activeRefs, id] }));

  const add = async () => {
    if (!file) return;
    setError("");
    try {
      setProgress("Mirando el video…");
      const a = await analyzeVideo(file, (p) => setProgress(`Mirando el video… ${Math.round(p * 100)}%`));
      setProgress("La IA está analizando el estilo…");
      const res = await fetch("/api/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || file.name,
          notes,
          duration: a.duration,
          aspect: a.aspect,
          cuts: a.cuts,
          avgShot: a.avgShot,
          cutTimes: a.cutTimes,
          frames: a.frames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      const ref: StyleRef = {
        id: uid(),
        name: name || file.name.replace(/\.[^.]+$/, ""),
        createdAt: new Date().toISOString(),
        thumb: a.thumb,
        duration: a.duration,
        aspect: a.aspect,
        cuts: a.cuts,
        avgShot: a.avgShot,
        profile: data.profile,
        notes,
        link,
      };
      await saveReferences([ref, ...refs]);
      store.set((s) => ({ activeRefs: [...s.activeRefs, ref.id] }));
      setFile(null);
      setName("");
      setNotes("");
      setLink("");
      setOpen(ref.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress("");
    }
  };

  const remove = async (id: string) => {
    await saveReferences(refs.filter((r) => r.id !== id));
    store.set((s) => ({ activeRefs: s.activeRefs.filter((x) => x !== id) }));
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--muted)]">
        Sube Reels o TikToks que te gusten. La IA analiza su estilo (ritmo, subtítulos, textos, colores, efectos) y lo
        imita en tus videos. Cada análisis usa 1 crédito de IA.
      </p>

      <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
        <div className="label">Nueva referencia</div>
        <label className="btn w-full cursor-pointer justify-center">
          {file ? `🎬 ${file.name}` : "⬆ Elegir video de referencia"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-[10px] text-[var(--muted)]">
          Instagram y TikTok no permiten leer el link directamente: guarda el video en tu teléfono (o grábalo con la
          grabación de pantalla) y súbelo aquí.
        </p>
        {file && (
          <>
            <Field label="Nombre">
              <input id="ref-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="¿Qué te gusta de este video? (opcional)">
              <textarea
                id="ref-notes"
                className="input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: los subtítulos grandes y los cortes rápidos"
              />
            </Field>
            <Field label="Link original (opcional)">
              <input id="ref-link" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
            </Field>
            <button className="btn btn-primary w-full justify-center" disabled={!!progress} onClick={add}>
              {progress || "✨ Analizar y guardar"}
            </button>
          </>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {refs.length > 0 && (
        <div className="space-y-2">
          <div className="label">Mis referencias ({refs.length})</div>
          <p className="text-[10px] text-[var(--muted)]">Marca las que quieras usar en este video.</p>
          {refs.map((r) => {
            const on = active.includes(r.id);
            return (
              <div key={r.id} className={`rounded-xl border p-2 ${on ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-[var(--line)]"}`}>
                <div className="flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumb} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {r.aspect} · {r.duration.toFixed(0)} s · corte cada ~{r.avgShot.toFixed(1)} s
                    </div>
                    <label className="mt-1 flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} /> Usar en este video
                    </label>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button className="btn flex-1 justify-center !py-1 text-[11px]" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "Ocultar estilo" : "Ver estilo"}
                  </button>
                  <button
                    className="btn btn-primary flex-1 justify-center !py-1 text-[11px]"
                    disabled={!hasVideo}
                    title={hasVideo ? "" : "Sube primero tu video"}
                    onClick={() => {
                      if (!on) toggle(r.id);
                      chatSend(`Edita mi video imitando el estilo de la referencia "${r.name}".`);
                    }}
                  >
                    Editar con este estilo
                  </button>
                </div>
                {open === r.id && (
                  <div className="mt-2 space-y-2">
                    <div className="max-h-64 overflow-y-auto rounded-lg bg-[#0f0f18] p-2 text-[11px] whitespace-pre-wrap text-[var(--muted)]">
                      {r.profile}
                    </div>
                    {r.link && (
                      <a href={r.link} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-[var(--accent)]">
                        {r.link}
                      </a>
                    )}
                    <button className="text-[11px] text-red-400" onClick={() => remove(r.id)}>
                      Eliminar referencia
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
