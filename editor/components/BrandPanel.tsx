"use client";

import { useEffect, useState } from "react";
import { applyBrand, BRAND_FONTS, emptyBrand, loadFont, logoToDataUrl, saveBrand } from "@/lib/brand";
import { store, useEditor } from "@/lib/store";
import type { BrandKit } from "@/lib/types";
import Field from "./Field";

export default function BrandPanel() {
  const saved = useEditor((s) => s.brand);
  const hasVideo = useEditor((s) => s.project.clips.length > 0);
  const [b, setB] = useState<BrandKit>(saved ?? emptyBrand());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (saved) setB(saved);
  }, [saved]);
  useEffect(() => {
    loadFont(b.font);
  }, [b.font]);

  const set = (patch: Partial<BrandKit>) => {
    setB((x) => ({ ...x, ...patch }));
    setStatus("");
  };

  const save = async () => {
    setBusy(true);
    // keep the references list, which is edited in its own tab
    const merged = { ...b, references: store.get().brand?.references ?? b.references };
    const where = await saveBrand(merged);
    store.set({ brand: merged });
    setBusy(false);
    setStatus(where === "cuenta" ? "✓ Guardado en tu cuenta" : "✓ Guardado en este navegador");
  };

  const apply = async () => {
    await save();
    await applyBrand(b);
    setStatus("✓ Marca aplicada al video");
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--muted)]">
        Carga tu marca una sola vez. La IA la usa para tus videos (logo, colores, tipografía, datos de contacto) y para
        escribir el texto de tus publicaciones.
      </p>

      <Field label="Nombre de la marca">
        <input id="brand-name" className="input" value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej: NOA Indumentaria" />
      </Field>
      <Field label="¿Qué vendés y a quién?">
        <textarea
          id="brand-desc"
          className="input"
          rows={3}
          value={b.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Ej: Ropa de mujer, tienda en Buenos Aires y envíos a todo el país."
        />
      </Field>
      <Field label="Tono de comunicación">
        <input id="brand-tone" className="input" value={b.tone} onChange={(e) => set({ tone: e.target.value })} placeholder="Ej: Cercano, canchero, con humor" />
      </Field>

      <div className="space-y-1">
        <span className="label block">Logo</span>
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[repeating-conic-gradient(#222_0_25%,#333_0_50%)] bg-[length:12px_12px]">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-[var(--muted)]">Sin logo</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="btn cursor-pointer !py-1 text-xs">
              Subir logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) set({ logo: await logoToDataUrl(f) });
                  e.target.value = "";
                }}
              />
            </label>
            {b.logo && (
              <button className="text-left text-[11px] text-red-400" onClick={() => set({ logo: null })}>
                Quitar logo
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[var(--muted)]">Ideal: PNG con fondo transparente.</p>
      </div>

      <Field label="Tipografía">
        <select id="brand-font" className="input" value={b.font} onChange={(e) => set({ font: e.target.value })}>
          {BRAND_FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} — {f.style}
            </option>
          ))}
        </select>
      </Field>
      <div
        className="rounded-lg border border-[var(--line)] p-3 text-center"
        style={{ fontFamily: `"${b.font}", sans-serif`, background: b.secondary, color: b.text }}
      >
        <div className="text-xl font-black">{b.name || "Tu marca"}</div>
        <span className="mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-bold" style={{ background: b.primary, color: b.text }}>
          ¡Nueva colección!
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Principal">
          <input id="brand-primary" type="color" className="h-8 w-full" value={b.primary} onChange={(e) => set({ primary: e.target.value })} />
        </Field>
        <Field label="Secundario">
          <input id="brand-secondary" type="color" className="h-8 w-full" value={b.secondary} onChange={(e) => set({ secondary: e.target.value })} />
        </Field>
        <Field label="Texto">
          <input id="brand-text" type="color" className="h-8 w-full" value={b.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      </div>

      <Field label="WhatsApp">
        <input id="brand-wa" className="input" value={b.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="Ej: 11 2345-6789" />
      </Field>
      <Field label="Instagram">
        <input id="brand-ig" className="input" value={b.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="Ej: @noaindumentaria" />
      </Field>
      <Field label="Web / tienda online">
        <input id="brand-web" className="input" value={b.website} onChange={(e) => set({ website: e.target.value })} placeholder="Ej: noaindumentaria.com.ar" />
      </Field>
      <Field label="Frases de la marca (una por línea)">
        <textarea
          id="brand-phrases"
          className="input"
          rows={3}
          value={b.phrases}
          onChange={(e) => set({ phrases: e.target.value })}
          placeholder={"Envíos a todo el país\n3 cuotas sin interés\nCambios sin cargo"}
        />
      </Field>
      <Field label="Hashtags habituales">
        <input id="brand-tags" className="input" value={b.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder="#moda #ropademujer #buenosaires" />
      </Field>

      <div className="space-y-2 pb-2">
        <button className="btn w-full justify-center" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar marca"}
        </button>
        <button className="btn btn-primary w-full justify-center" disabled={busy || !hasVideo} onClick={apply}>
          🎨 Aplicar mi marca al video
        </button>
        {!hasVideo && <p className="text-[11px] text-[var(--muted)]">Sube un video para aplicar la marca.</p>}
        {status && <p className="text-xs text-emerald-300">{status}</p>}
      </div>
    </div>
  );
}
