"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    linkError ? "El enlace no funcionó o ya venció. Pide uno nuevo (ábrelo en el mismo navegador donde lo pediste)." : "",
  );

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setError(
        error.status === 429
          ? "Se pidieron demasiados mails. Espera unos minutos y vuelve a intentarlo."
          : `No pudimos enviar el mail. Revisa que el mail esté bien escrito. (Detalle: ${error.message || error.status || "desconocido"})`,
      );
      return;
    }
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError(`El código no es correcto o ya venció. Revisa el mail o pide uno nuevo. (Detalle: ${error.message})`);
      return;
    }
    window.location.href = next;
  };

  if (step === "email")
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Ingresar</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Te enviamos un mail para entrar. Sin contraseñas.</p>
        </div>
        <label className="block space-y-1">
          <span className="label block">Tu mail</span>
          <input
            id="email"
            className="input !py-2.5 !text-base"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="nombre@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy}>
          {busy ? "Enviando…" : "Enviarme el acceso"}
        </button>
      </form>
    );

  return (
    <form onSubmit={verify} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Revisa tu mail</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enviamos un mail a <span className="text-[var(--text)]">{email}</span>. Toca el enlace del mail desde este
          mismo navegador, o escribe aquí el código si te llegó uno. Si no llega, mira en spam.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="label block">Código (si te llegó uno)</span>
        <input
          id="code"
          className="input !py-2.5 text-center font-mono !text-2xl tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy || code.length < 6}>
        {busy ? "Verificando…" : "Entrar"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-[var(--muted)] hover:text-white"
        onClick={() => {
          setStep("email");
          setCode("");
          setError("");
        }}
      >
        Usar otro mail o pedir un código nuevo
      </button>
    </form>
  );
}
