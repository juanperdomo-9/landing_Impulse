"use client";

import { useState } from "react";
import { exportFileName } from "@/lib/actions";
import { getPlayer } from "@/lib/player";
import { totalDuration } from "@/lib/project";
import { store } from "@/lib/store";

export default function ExportButton({ disabled }: { disabled: boolean }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  const run = async () => {
    const p = getPlayer();
    if (!p || !totalDuration(store.get().project)) return;
    setResult(null);
    setProgress(0);
    try {
      const { blob, ext } = await p.exportVideo(setProgress);
      setResult({ url: URL.createObjectURL(blob), name: exportFileName(ext) });
    } catch (e) {
      alert(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <button className="btn btn-primary" disabled={disabled || progress !== null} onClick={run}>
        ⬇ Exportar
      </button>
      {(progress !== null || result) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="panel w-full max-w-md rounded-2xl p-6">
            {progress !== null ? (
              <>
                <div className="text-lg font-bold">Exportando tu video…</div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Se renderiza en tiempo real; mantén esta pestaña abierta y visible.
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--panel-2)]">
                  <div className="grad h-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span>{Math.round(progress * 100)}%</span>
                  <button className="text-[var(--muted)] hover:text-white" onClick={() => getPlayer()?.cancelExport()}>
                    Detener
                  </button>
                </div>
              </>
            ) : (
              result && (
                <>
                  <div className="text-lg font-bold">¡Tu video está listo! 🎉</div>
                  <video src={result.url} controls className="mt-4 max-h-[50vh] w-full rounded-lg bg-black" />
                  <div className="mt-4 flex gap-2">
                    <a href={result.url} download={result.name} className="btn btn-primary flex-1 justify-center">
                      Descargar
                    </a>
                    <button className="btn" onClick={() => setResult(null)}>
                      Cerrar
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
