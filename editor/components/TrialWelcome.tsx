"use client";

import { useEffect, useState } from "react";
import type { EditorAccount } from "./Editor";

/** Welcome card shown the first time a trial user opens the editor (once per account and browser). */
export default function TrialWelcome({ account }: { account: EditorAccount }) {
  const [open, setOpen] = useState(false);
  const key = `impulsa-welcome:${account.email}`;

  useEffect(() => {
    if (account.trialDaysLeft == null) return;
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      setOpen(true);
    }
    const reopen = () => setOpen(true);
    window.addEventListener("impulsa-welcome", reopen);
    return () => window.removeEventListener("impulsa-welcome", reopen);
  }, [account.trialDaysLeft, key]);

  if (!open || account.trialDaysLeft == null) return null;
  const close = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    setOpen(false);
  };
  const days = account.trialDaysLeft;
  const left = Math.max(0, account.limit - account.used);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4">
      <div className="panel w-full max-w-lg rounded-2xl p-6">
        <div className="text-3xl">🎁</div>
        <h2 className="mt-2 text-2xl font-black">¡Bienvenida/o a Impulsa Studio!</h2>
        <p className="mt-1 text-[var(--muted)]">
          Tenés <b className="text-[var(--text)]">{days} {days === 1 ? "día" : "días"} de prueba gratis</b>, sin tarjeta y
          sin compromiso.
        </p>

        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-xl bg-[var(--panel-2)] p-3">
            <div className="font-bold">✨ {left} créditos de IA para probar</div>
            <p className="mt-1 text-[var(--muted)]">
              Cada crédito es un pedido a la IA: una instrucción en el chat (por ejemplo &quot;poné subtítulos y quitá los
              silencios&quot;), un texto para publicar o el análisis de un Reel de referencia.
            </p>
          </div>
          <div className="rounded-xl bg-[var(--panel-2)] p-3">
            <div className="font-bold">✂️ Todo lo demás es ilimitado</div>
            <p className="mt-1 text-[var(--muted)]">
              Subir videos, subtítulos automáticos, cortes, textos, fotos, música, sonidos, efectos y exportar no gastan
              créditos.
            </p>
          </div>
          <div className="rounded-xl bg-[var(--panel-2)] p-3">
            <div className="font-bold">🚀 Para empezar</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[var(--muted)]">
              <li>Subí tu video (arrastralo al centro).</li>
              <li>Cargá tu marca en 🎨 Marca: logo, colores y tipografía.</li>
              <li>Pedile a la IA lo que quieras en el chat de la derecha.</li>
              <li>Exportá y publicá. En ✍️ Publicar te escribe el texto.</li>
            </ol>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Cuando termine la prueba podés seguir con el plan mensual desde <b>Mi cuenta</b>: pago con Mercado Pago y
            cancelás cuando quieras.
          </p>
        </div>

        <button className="btn btn-primary mt-5 w-full justify-center !py-3 text-base" onClick={close}>
          ¡Empezar a editar!
        </button>
      </div>
    </div>
  );
}
