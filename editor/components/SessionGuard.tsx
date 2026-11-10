"use client";

import { useEffect, useState } from "react";
import { clearSession, restoreSession, savedSession, startAutosave } from "@/lib/autosave";
import { store } from "@/lib/store";
import { IconAlert } from "./Icons";

const DEVICE_NOTICE_KEY = "impulsa-device-notice";

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** Chrome and Edge (Chromium) run the in-browser transcription and export best. */
function isChromium() {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  if (nav.userAgentData?.brands) return nav.userAgentData.brands.some((b) => b.brand === "Chromium");
  return /Chrome|Edg\//.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS/.test(navigator.userAgent);
}

/**
 * Autosave of the project in this browser, the offer to recover it after a reload, and a notice for
 * phones and browsers where the editor works worse.
 */
export default function SessionGuard() {
  const [saved, setSaved] = useState<{ savedAt: number; clips: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    savedSession().then((s) => {
      if (cancelled) return;
      if (s && store.get().assets.length === 0) setSaved(s);
      else stop = startAutosave();
    });
    const onError = () => setSaveError(true);
    window.addEventListener("impulsa-autosave-error", onError);

    try {
      const small = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024;
      if ((small || !isChromium()) && !localStorage.getItem(DEVICE_NOTICE_KEY)) setDeviceNotice(true);
    } catch {
      /* private mode */
    }

    // autosave starts once the user chooses to recover the saved project or start over
    const begin = () => {
      if (!stop) stop = startAutosave();
    };
    window.addEventListener("impulsa-autosave-start", begin);
    return () => {
      cancelled = true;
      stop?.();
      window.removeEventListener("impulsa-autosave-error", onError);
      window.removeEventListener("impulsa-autosave-start", begin);
    };
  }, []);

  const startAutosaving = () => window.dispatchEvent(new Event("impulsa-autosave-start"));

  const recover = async () => {
    setRestoring(true);
    try {
      const ok = await restoreSession();
      if (!ok) {
        alert("No se pudieron recuperar los archivos de ese proyecto. Empezamos uno nuevo.");
        await clearSession();
      }
    } catch (e) {
      alert(`No se pudo recuperar el proyecto: ${(e as Error).message}`);
    } finally {
      setRestoring(false);
      setSaved(null);
      startAutosaving();
    }
  };

  const startOver = async () => {
    await clearSession();
    setSaved(null);
    startAutosaving();
  };

  const closeDeviceNotice = () => {
    try {
      localStorage.setItem(DEVICE_NOTICE_KEY, "1");
    } catch {
      /* private mode */
    }
    setDeviceNotice(false);
  };

  return (
    <>
      {saved && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="panel w-full max-w-md rounded-2xl p-6" role="dialog" aria-modal="true" aria-labelledby="restore-title">
            <h2 id="restore-title" className="text-xl font-black">
              Tenés un proyecto sin terminar
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Lo guardamos en este navegador {timeAgo(saved.savedAt)}
              {saved.clips ? ` (${saved.clips} ${saved.clips === 1 ? "clip" : "clips"})` : ""}. ¿Querés seguir donde
              lo dejaste?
            </p>
            <div className="mt-5 flex gap-2">
              <button className="btn btn-primary flex-1 justify-center" disabled={restoring} onClick={recover}>
                {restoring ? "Recuperando…" : "Recuperar proyecto"}
              </button>
              <button className="btn" disabled={restoring} onClick={startOver}>
                Empezar de cero
              </button>
            </div>
          </div>
        </div>
      )}

      {(deviceNotice || saveError) && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(560px,calc(100%-2rem))] -translate-x-1/2">
          <div className="panel flex items-start gap-3 rounded-xl p-3 text-sm shadow-2xl">
            <span className="mt-0.5 text-[var(--sun)]">
              <IconAlert size={18} />
            </span>
            <p className="flex-1 text-[var(--muted)]">
              {saveError
                ? "Tu navegador no tiene espacio para guardar este proyecto automáticamente. Exportá el video antes de cerrar la pestaña."
                : "El editor funciona mejor en una computadora con Chrome o Edge. En este dispositivo los subtítulos automáticos y la exportación pueden ser lentos o no funcionar."}
            </p>
            <button
              className="btn !py-1 text-xs"
              onClick={() => (saveError ? setSaveError(false) : closeDeviceNotice())}
              aria-label="Cerrar aviso"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
