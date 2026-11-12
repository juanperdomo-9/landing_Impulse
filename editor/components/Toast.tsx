"use client";

import { useEffect } from "react";
import { store, useEditor } from "@/lib/store";

/** Short notice at the bottom of the screen; disappears by itself. */
export default function Toast() {
  const toast = useEditor((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.set({ toast: null }), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm shadow-2xl">
        <span>✓</span>
        <span className="flex-1">{toast}</span>
        <button className="text-[var(--muted)] hover:text-white" aria-label="Cerrar" onClick={() => store.set({ toast: null })}>
          ✕
        </button>
      </div>
    </div>
  );
}
