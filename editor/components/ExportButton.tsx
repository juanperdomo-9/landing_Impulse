"use client";

import { useState } from "react";
import { exportFileName } from "@/lib/actions";
import { getPlayer } from "@/lib/player";
import { totalDuration } from "@/lib/project";
import { store } from "@/lib/store";
import { IconDownload, IconShare } from "./Icons";

type Result = { url: string; name: string; file: File };

/** True when the phone can open its share sheet with a video file (save to gallery, WhatsApp, Instagram…). */
function canShareFile(file: File) {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

export default function ExportButton({ disabled }: { disabled: boolean }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");

  const run = async () => {
    const p = getPlayer();
    if (!p || !totalDuration(store.get().project)) return;
    setResult(null);
    setNote("");
    setProgress(0);
    // keep the phone screen on while the video renders
    let lock: { release: () => Promise<void> } | null = null;
    try {
      lock = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
    } catch {
      /* not supported */
    }
    try {
      const { blob, ext } = await p.exportVideo(setProgress);
      const name = exportFileName(ext);
      // plain MIME type (no ";codecs=…") so phones accept it in the share sheet and the gallery
      const type = ext === "mp4" ? "video/mp4" : "video/webm";
      const file = new File([blob], name, { type });
      setResult({ url: URL.createObjectURL(file), name, file });
    } catch (e) {
      alert(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      lock?.release().catch(() => undefined);
      setProgress(null);
    }
  };

  const share = async () => {
    if (!result) return;
    setNote("");
    try {
      await navigator.share({ files: [result.file], title: result.name });
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNote("No se pudo abrir el menú para compartir. Probá con «Descargar».");
    }
  };

  const shareable = result ? canShareFile(result.file) : false;

  return (
    <>
      <button className="btn btn-primary" disabled={disabled || progress !== null} onClick={run}>
        <IconDownload /> <span className="hidden sm:inline">Exportar</span>
      </button>
      {(progress !== null || result) && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4">
          <div className="panel w-full max-w-md rounded-2xl p-5 md:p-6">
            {progress !== null ? (
              <>
                <div className="text-lg font-bold">Exportando tu video…</div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Se arma en tiempo real (un video de 30 s tarda unos 30 s). Dejá esta pantalla abierta y no bloquees el
                  celular.
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
                  <div className="text-lg font-bold">¡Tu video está listo!</div>
                  <video src={result.url} controls playsInline className="mt-4 max-h-[45dvh] w-full rounded-lg bg-black" />
                  <div className="mt-4 flex flex-col gap-2">
                    {shareable && (
                      <button className="btn btn-primary w-full justify-center !py-3" onClick={share}>
                        <IconShare /> Guardar en el celular / Compartir
                      </button>
                    )}
                    <div className="flex gap-2">
                      <a
                        href={result.url}
                        download={result.name}
                        className={`btn flex-1 justify-center ${shareable ? "" : "btn-primary"}`}
                      >
                        <IconDownload /> Descargar
                      </a>
                      <button className="btn" onClick={() => setResult(null)}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                  {shareable ? (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      En «Guardar en el celular / Compartir» elegí <b>Guardar video</b> (iPhone) o tu galería, o mandalo
                      directo a WhatsApp, Instagram o TikTok.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      El archivo se guarda en la carpeta de Descargas ({result.name}).
                    </p>
                  )}
                  {note && <p className="mt-2 text-xs text-red-300">{note}</p>}
                </>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
