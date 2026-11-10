"use client";

import { useState } from "react";
import { describeProject, transcriptForAI } from "@/lib/actions";
import { describeBrand } from "@/lib/brand";
import { transcribeTimeline } from "@/lib/media";
import { store, useEditor } from "@/lib/store";
import Field from "./Field";

const PLATFORMS = ["Instagram", "TikTok", "Facebook", "Estado de WhatsApp"];

export default function PublishPanel() {
  const brand = useEditor((s) => s.brand);
  const hasVideo = useEditor((s) => s.project.clips.length > 0);
  const transcribed = useEditor((s) => s.project.clips.some((c) => !!s.transcripts[c.assetId]));
  const [platform, setPlatform] = useState("Instagram");
  const [notes, setNotes] = useState("");
  const [useSpeech, setUseSpeech] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      if (useSpeech && hasVideo && !transcribed) {
        try {
          await transcribeTimeline();
        } catch {
          /* continue without the speech */
        }
      }
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          notes,
          brand: describeBrand(store.get().brand),
          video: describeProject(),
          transcript: useSpeech ? transcriptForAI() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setText(data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("No se pudo copiar automáticamente. Selecciona el texto y cópialo a mano.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--muted)]">
        La IA escribe el texto para acompañar tu video al publicarlo: gancho, mensaje, llamado a la acción y hashtags.
        Usa 1 crédito de IA.
      </p>
      {!brand?.name && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          Consejo: completa tu <b>Kit de marca</b> (pestaña 🎨 Marca) para que el texto use tu tono, tus datos de contacto y
          tus hashtags.
        </p>
      )}
      <Field label="¿Dónde lo vas a publicar?">
        <div className="grid grid-cols-2 gap-1.5">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded-lg border py-1.5 text-xs font-semibold ${platform === p ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-[var(--line)]"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Indicaciones (opcional)">
        <textarea
          id="copy-notes"
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej: es para el lanzamiento de la colección de verano, 20% off solo este finde"
        />
      </Field>
      {hasVideo && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={useSpeech} onChange={(e) => setUseSpeech(e.target.checked)} />
          Usar lo que se dice en el video
        </label>
      )}
      <button className="btn btn-primary w-full justify-center" disabled={busy} onClick={generate}>
        {busy ? "Escribiendo…" : text ? "✍️ Generar otra versión" : "✍️ Escribir texto para publicar"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {text && (
        <div className="space-y-2">
          <textarea id="copy-result" className="input" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn w-full justify-center" onClick={copy}>
            {copied ? "✓ Copiado" : "📋 Copiar texto"}
          </button>
        </div>
      )}
    </div>
  );
}
