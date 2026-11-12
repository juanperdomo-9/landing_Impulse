"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { IconUser } from "@/components/Icons";
import { withBase } from "@/lib/paths";
import { deleteProject, listProjects, renameProject, type ProjectSummary } from "@/lib/projects";

function ago(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectsList() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [where, setWhere] = useState<"cuenta" | "dispositivo">("cuenta");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    listProjects().then((r) => {
      setItems(r.projects);
      setWhere(r.where);
    });
  }, []);

  const remove = async (id: string) => {
    await deleteProject(id);
    setItems((x) => x?.filter((p) => p.id !== id) ?? null);
    setConfirm(null);
  };

  const saveName = async (id: string) => {
    const n = name.trim() || "Proyecto sin título";
    setItems((x) => x?.map((p) => (p.id === id ? { ...p, name: n } : p)) ?? null);
    setEditing(null);
    await renameProject(id, n);
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <BrandLogo size="sm" />
        <div className="flex gap-2">
          <Link href="/cuenta" className="btn">
            <IconUser /> Mi cuenta
          </Link>
          {/* full page load so the editor starts empty */}
          <a href={withBase("/")} className="btn btn-primary">
            + Nuevo proyecto
          </a>
        </div>
      </header>

      <h1 className="text-2xl font-bold">Mis proyectos</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        Los cambios se guardan solos mientras editás
        {where === "cuenta" ? " y quedan en tu cuenta" : " en este dispositivo"}. Los videos quedan guardados en el
        dispositivo donde los subiste: si abrís un proyecto en otro, te vamos a pedir que los elijas de nuevo.
      </p>

      {items === null ? (
        <p className="mt-10 text-center text-sm text-[var(--muted)]">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="panel mt-8 rounded-2xl p-10 text-center">
          <div className="text-4xl">🎬</div>
          <p className="mt-3 font-semibold">Todavía no tenés proyectos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Creá uno subiendo tu primer video.</p>
          <a href={withBase("/")} className="btn btn-primary mt-4">
            + Nuevo proyecto
          </a>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <div key={p.id} className="panel flex min-w-0 flex-col overflow-hidden rounded-xl">
              <a href={withBase(`/?p=${p.id}`)} className="grid aspect-video place-items-center bg-black">
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-3xl">🎬</span>
                )}
              </a>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                {editing === p.id ? (
                  <input
                    id={`name-${p.id}`}
                    autoFocus
                    className="input !py-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => saveName(p.id)}
                    onKeyDown={(e) => e.key === "Enter" && saveName(p.id)}
                  />
                ) : (
                  <button
                    className="truncate text-left text-sm font-semibold hover:text-[var(--accent)]"
                    title="Cambiar nombre"
                    onClick={() => {
                      setEditing(p.id);
                      setName(p.name);
                    }}
                  >
                    {p.name}
                  </button>
                )}
                <span className="text-[11px] text-[var(--muted)]">Editado {ago(p.updated_at)}</span>
                <div className="mt-auto flex gap-1.5 pt-1.5">
                  <a href={withBase(`/?p=${p.id}`)} className="btn btn-primary flex-1 justify-center !py-1 text-xs">
                    Abrir
                  </a>
                  {confirm === p.id ? (
                    <button className="btn !border-red-500/50 !py-1 text-xs text-red-300" onClick={() => remove(p.id)}>
                      ¿Borrar?
                    </button>
                  ) : (
                    <button className="btn !py-1 text-xs" title="Eliminar proyecto" onClick={() => setConfirm(p.id)}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
