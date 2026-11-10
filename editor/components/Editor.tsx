"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteSelection, setFormat } from "@/lib/actions";
import { loadBrand, loadFont } from "@/lib/brand";
import { getPlayer } from "@/lib/player";
import { splitClipAt } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import type { Aspect, Fit } from "@/lib/types";
import Chat from "./Chat";
import ExportButton from "./ExportButton";
import BrandLogo from "./BrandLogo";
import { IconGift, IconRedo, IconSparkle, IconUndo, IconUser } from "./Icons";
import Preview from "./Preview";
import SessionGuard from "./SessionGuard";
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

export default function Editor({ account }: { account?: EditorAccount }) {
  const busy = useEditor((s) => s.busy);
  const aspect = useEditor((s) => s.project.aspect);
  const fit = useEditor((s) => s.project.fit);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasAssets = useEditor((s) => s.assets.length > 0);
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    const open = () => setChatOpen(true);
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
      if (store.get().assets.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {account && <TrialWelcome account={account} />}
      <SessionGuard />
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] px-4">
        <BrandLogo size="sm" />
        <div className="mx-2 h-6 w-px bg-[var(--line)]" />
        <button className="btn" disabled={!canUndo} onClick={() => store.undo()} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
          <IconUndo />
        </button>
        <button className="btn" disabled={!canRedo} onClick={() => store.redo()} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer">
          <IconRedo />
        </button>
        <select
          className="input !w-auto"
          value={aspect}
          onChange={(e) => setFormat({ aspect: e.target.value as Aspect })}
          title="Formato"
        >
          <option value="16:9">16:9 · YouTube</option>
          <option value="9:16">9:16 · Reels/TikTok</option>
          <option value="1:1">1:1 · Cuadrado</option>
          <option value="4:5">4:5 · Feed</option>
        </select>
        <select
          className="input !w-auto"
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
          <div className="flex items-center gap-2 truncate text-xs text-[var(--muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="truncate">{busy}</span>
          </div>
        )}
        <button className="btn" onClick={() => setChatOpen((v) => !v)} aria-label="Asistente IA">
          <IconSparkle /> <span className="hidden md:inline">Asistente IA</span>
        </button>
        <ExportButton disabled={!hasAssets} />
        {account?.trialDaysLeft != null && (
          <button
            className="btn !border-[var(--sun)]/40 text-[var(--sun)]"
            title="Ver cómo funciona la prueba"
            onClick={() => window.dispatchEvent(new Event("impulsa-welcome"))}
          >
            <IconGift /> Prueba: {account.trialDaysLeft} {account.trialDaysLeft === 1 ? "día" : "días"}
          </button>
        )}
        {account && (
          <Link href="/cuenta" className="btn" title={account.email} aria-label="Mi cuenta">
            <IconUser /> <span className="hidden xl:inline">Mi cuenta</span>
          </Link>
        )}
      </header>

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
    </div>
  );
}

