"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deleteSelection, setFormat } from "@/lib/actions";
import { loadBrand, loadFont } from "@/lib/brand";
import { getPlayer } from "@/lib/player";
import { openProject, saveCurrentProject } from "@/lib/projects";
import { splitClipAt } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import type { Aspect, Fit } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";
import { withBase } from "@/lib/paths";
import Chat from "./Chat";
import ExportButton from "./ExportButton";
import BrandLogo from "./BrandLogo";
import { IconFolder, IconGift, IconRedo, IconSliders, IconSparkle, IconTimeline, IconUndo, IconUser } from "./Icons";
import MissingFiles from "./MissingFiles";
import Toast from "./Toast";
import Preview from "./Preview";
import SidePanel from "./SidePanel";
import Timeline from "./Timeline";
import TrialWelcome from "./TrialWelcome";

export interface EditorAccount {
  email: string;
  used: number;
  limit: number;
  /** days left of the free trial, or null when the user pays */
  trialDaysLeft?: number | null;
}

const DEFAULT_NAME = "Proyecto sin título";

export default function Editor({ account, projectId }: { account?: EditorAccount; projectId?: string }) {
  const busy = useEditor((s) => s.busy);
  const aspect = useEditor((s) => s.project.aspect);
  const fit = useEditor((s) => s.project.fit);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasAssets = useEditor((s) => s.assets.length > 0);
  const [chatOpen, setChatOpen] = useState(true);
  const isMobile = useIsMobile();
  // phone layout: one panel at a time under the video
  const [mTab, setMTab] = useState<"ia" | "tools" | "timeline">("ia");
  const selection = useEditor((s) => s.selection);
  const picking = useEditor((s) => !!s.eyedropper);
  const projectName = useEditor((s) => s.projectName);
  const saveState = useEditor((s) => s.saveState);
  const opened = useRef(false);
  const hasContent = useEditor((s) => s.assets.length > 0 || s.project.clips.length > 0);
  const saveLabel =
    saveState === "saving"
      ? "Guardando…"
      : saveState === "saved"
        ? "✓ Guardado en tu cuenta"
        : saveState === "local"
          ? "✓ Guardado en este dispositivo"
          : saveState === "error"
            ? "⚠ No se pudo guardar"
            : hasContent
              ? "Se guarda solo"
              : "Se guarda solo cuando subas un video";

  // open a saved project (?p=id) once the player exists
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (projectId) {
      openProject(projectId).then((ok) => {
        if (!ok) {
          store.set({ projectId: null, saveState: "idle" });
          window.history.replaceState(null, "", withBase("/"));
          alert("No encontramos ese proyecto. Empezamos uno nuevo.");
        }
      });
    }
  }, [projectId]);

  // autosave a couple of seconds after each change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = store.get();
    const unsub = store.subscribe(() => {
      const s = store.get();
      const changed =
        s.project !== last.project ||
        s.transcripts !== last.transcripts ||
        s.assets !== last.assets ||
        s.missingAssets !== last.missingAssets ||
        s.activeRefs !== last.activeRefs ||
        s.projectName !== last.projectName;
      last = s;
      if (!changed || (!s.assets.length && !s.project.clips.length)) return;
      if (s.busy === "Abriendo proyecto…") return;
      if (timer) clearTimeout(timer);
      if (s.saveState !== "saving") store.set({ saveState: "saving" });
      timer = setTimeout(async () => {
        timer = null;
        const st = store.get();
        if (st.projectName === DEFAULT_NAME) {
          const first = st.assets.find((a) => a.kind === "video") ?? st.assets[0];
          if (first) store.set({ projectName: first.name.replace(/\.[^.]+$/, "").slice(0, 60) });
        }
        const isNew = !store.get().projectId;
        try {
          const where = await saveCurrentProject();
          store.set({ saveState: where === "cuenta" ? "saved" : "local" });
          if (isNew) window.history.replaceState(null, "", withBase(`/?p=${store.get().projectId}`));
        } catch {
          store.set({ saveState: "error" });
        }
      }, 2000);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (selection) setMTab("tools");
  }, [selection]);

  useEffect(() => {
    const open = () => {
      setChatOpen(true);
      setMTab("ia");
    };
    window.addEventListener("impulsa-chat", open);
    return () => window.removeEventListener("impulsa-chat", open);
  }, []);

  useEffect(() => {
    loadBrand().then((brand) => {
      if (!brand) return;
      store.set({ brand });
      loadFont(brand.font);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") {
        e.preventDefault();
        getPlayer()?.toggle();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key.toLowerCase() === "s" && !mod) {
        store.edit((p) => splitClipAt(p, store.get().time));
      } else if (e.key === "ArrowLeft") {
        getPlayer()?.seek(store.get().time - (e.shiftKey ? 1 : 1 / 30));
      } else if (e.key === "ArrowRight") {
        getPlayer()?.seek(store.get().time + (e.shiftKey ? 1 : 1 / 30));
      }
    };
    window.addEventListener("keydown", onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.get().saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {account && <TrialWelcome account={account} />}
      <Toast />
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-2 md:gap-3 md:px-4">
        <span className="hidden md:inline-flex">
          <BrandLogo size="sm" />
        </span>
        {/* plain link (full reload) so the editor starts clean when coming back */}
        <a href={withBase("/proyectos")} className="btn !px-2.5 md:!px-3" title="Mis proyectos" aria-label="Mis proyectos">
          <IconFolder /> <span className="hidden lg:inline">Proyectos</span>
        </a>
        <div className="hidden min-w-0 flex-col md:flex">
          <input
            id="project-name"
            aria-label="Nombre del proyecto"
            className="w-44 truncate rounded bg-transparent px-1 text-sm font-semibold outline-none hover:bg-[var(--panel-2)] focus:bg-[var(--panel-2)] lg:w-56"
            value={projectName}
            onChange={(e) => store.set({ projectName: e.target.value || DEFAULT_NAME })}
          />
          <span className={`px-1 text-[10px] ${saveState === "error" ? "text-red-300" : "text-[var(--muted)]"}`}>{saveLabel}</span>
        </div>
        <div className="mx-1 hidden h-6 w-px bg-[var(--line)] md:block" />
        <button className="btn !px-2.5 md:!px-3" disabled={!canUndo} onClick={() => store.undo()} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
          <IconUndo />
        </button>
        <button className="btn !px-2.5 md:!px-3" disabled={!canRedo} onClick={() => store.redo()} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer">
          <IconRedo />
        </button>
        <select
          className="input !w-auto max-w-[96px] md:max-w-none"
          value={aspect}
          onChange={(e) => setFormat({ aspect: e.target.value as Aspect })}
          title="Formato"
        >
          <option value="16:9">{isMobile ? "16:9" : "16:9 · YouTube"}</option>
          <option value="9:16">{isMobile ? "9:16" : "9:16 · Reels/TikTok"}</option>
          <option value="1:1">{isMobile ? "1:1" : "1:1 · Cuadrado"}</option>
          <option value="4:5">{isMobile ? "4:5" : "4:5 · Feed"}</option>
        </select>
        <select
          className="input !hidden !w-auto md:!block"
          value={fit}
          onChange={(e) => setFormat({ fit: e.target.value as Fit })}
          title="Encuadre"
        >
          <option value="blur">Fondo desenfocado</option>
          <option value="cover">Llenar (recortar)</option>
          <option value="contain">Ajustar (bandas)</option>
        </select>
        <div className="flex-1" />
        {busy && (
          <div className="hidden items-center gap-2 truncate text-xs text-[var(--muted)] md:flex">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="truncate">{busy}</span>
          </div>
        )}
        <button className="btn !hidden md:!inline-flex" onClick={() => setChatOpen((v) => !v)} aria-label="Asistente IA">
          <IconSparkle /> <span className="hidden md:inline">Asistente IA</span>
        </button>
        <ExportButton disabled={!hasAssets} />
        {account?.trialDaysLeft != null && (
          <button
            className="btn !border-[var(--sun)]/40 text-[var(--sun)]"
            title="Ver cómo funciona la prueba"
            onClick={() => window.dispatchEvent(new Event("impulsa-welcome"))}
          >
            <IconGift />
            <span className="hidden sm:inline"> Prueba:</span> {account.trialDaysLeft}
            <span className="hidden sm:inline">{account.trialDaysLeft === 1 ? " día" : " días"}</span>
            <span className="sm:hidden">d</span>
          </button>
        )}
        {account && (
          <Link href="/cuenta" className="btn !px-2.5 md:!px-3" title={account.email} aria-label="Mi cuenta">
            <IconUser /> <span className="hidden xl:inline">Mi cuenta</span>
          </Link>
        )}
      </header>

      {/* phones: project name and save status under the header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-1 md:hidden">
        <input
          id="project-name-mobile"
          aria-label="Nombre del proyecto"
          className="min-w-0 flex-1 truncate rounded bg-transparent px-1 text-sm font-semibold outline-none focus:bg-[var(--panel-2)]"
          value={projectName}
          onChange={(e) => store.set({ projectName: e.target.value || DEFAULT_NAME })}
        />
        <span className={`shrink-0 text-[11px] ${saveState === "error" ? "text-red-300" : "text-[var(--muted)]"}`}>{saveLabel}</span>
      </div>
      {busy && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] md:hidden">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span className="truncate">{busy}</span>
        </div>
      )}

      <MissingFiles />

      {isMobile ? (
        <>
          <div className="flex min-h-0 flex-[1_1_42%] flex-col">
            <Preview />
          </div>
          <div className={`min-h-0 flex-[1_1_58%] border-t border-[var(--line)] ${picking ? "pointer-events-none opacity-40" : ""}`}>
            {/* the chat stays mounted so the conversation is kept when switching tabs */}
            <div className={mTab === "ia" ? "flex h-full" : "hidden"}>
              <Chat usage={account ? { used: account.used, limit: account.limit } : undefined} />
            </div>
            {mTab === "tools" && <SidePanel mobile />}
            {mTab === "timeline" && <Timeline mobile />}
          </div>
          <nav className="grid shrink-0 grid-cols-3 border-t border-[var(--line)] bg-[var(--panel)] pb-[env(safe-area-inset-bottom)]">
            {(
              [
                ["ia", <IconSparkle key="ia" size={20} />, "IA"],
                ["tools", <IconSliders key="tools" size={20} />, "Editar"],
                ["timeline", <IconTimeline key="timeline" size={20} />, "Línea de tiempo"],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setMTab(id)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${mTab === id ? "text-[var(--sun)]" : "text-[var(--muted)]"}`}
              >
                <span className={mTab === id ? "" : "opacity-70"}>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <div className="flex min-h-0 flex-1">
          <SidePanel />
          <main className="flex min-w-0 flex-1 flex-col">
            <Preview />
            <Timeline />
          </main>
          {/* kept mounted when hidden so other panels can still send it messages */}
          <div className={chatOpen ? "contents" : "hidden"}>
            <Chat usage={account ? { used: account.used, limit: account.limit } : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}

