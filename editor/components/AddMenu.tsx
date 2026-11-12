"use client";

import { useRef, useState } from "react";
import * as A from "@/lib/actions";
import { addFiles, addVideoSound } from "@/lib/media";
import { fmt, nextSlot } from "@/lib/project";
import { SFX_INFO } from "@/lib/sfx";
import { store } from "@/lib/store";
import { EFFECT_LABELS, EFFECT_TYPES, SFX_NAMES, type TextPreset } from "@/lib/types";

type Step = "main" | "text" | "sfx" | "fx" | "sound";

const TEXTS: { preset: TextPreset; label: string; text: string; position: string }[] = [
  { preset: "titulo", label: "Título grande", text: "TU TÍTULO", position: "top" },
  { preset: "subtitulo", label: "Subtítulo", text: "Tu texto", position: "center" },
  { preset: "etiqueta", label: "Etiqueta", text: "NUEVO", position: "top-left" },
  { preset: "cta", label: "Botón (llamado a la acción)", text: "¡Escribinos!", position: "bottom" },
];

/** "+" button next to play: choose what to add; every new item goes after the last one of its kind. */
export default function AddMenu() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("main");
  const video = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const music = useRef<HTMLInputElement>(null);
  const soundVideo = useRef<HTMLInputElement>(null);
  const [soundFile, setSoundFile] = useState<File | null>(null);

  const close = () => {
    setOpen(false);
    setStep("main");
    setSoundFile(null);
  };
  const notice = (what: string, s: { start: number; end: number; full: boolean }) =>
    store.set({
      toast: `${what} agregado: ${fmt(s.start)}–${fmt(s.end)}${s.full ? " (ya no quedaba lugar libre, se superpone)" : ""}`,
    });

  const addText = (t: (typeof TEXTS)[number]) => {
    const s = nextSlot(store.get().project, "text", store.get().time, 3);
    const id = A.addText({ text: t.text, preset: t.preset, start: s.start, end: s.end, position: t.position, animation: "pop" });
    store.set({ selection: { kind: "overlay", id } });
    notice("Texto", s);
    close();
  };
  const addSfx = (name: (typeof SFX_NAMES)[number]) => {
    const s = nextSlot(store.get().project, "sfx", store.get().time, SFX_INFO[name].duration);
    A.addSfx({ effect: name, at: s.start });
    notice("Sonido", s);
    close();
  };
  const addFx = (type: (typeof EFFECT_TYPES)[number]) => {
    const s = nextSlot(store.get().project, "effect", store.get().time, 2);
    const id = A.addEffect({ effect: type, start: s.start, end: s.end });
    store.set({ selection: { kind: "effect", id } });
    notice("Efecto", s);
    close();
  };

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, accept: string) => (
    <input
      ref={ref}
      type="file"
      multiple
      accept={accept}
      className="hidden"
      onChange={(e) => {
        if (e.target.files?.length) addFiles(e.target.files);
        e.target.value = "";
        close();
      }}
    />
  );

  const Option = ({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3 text-left hover:border-[var(--accent)]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0f0f18] text-xl">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">{hint}</span>
      </span>
    </button>
  );

  return (
    <>
      <button className="btn w-12 justify-center !px-0 text-lg" title="Agregar al video" aria-label="Agregar al video" onClick={() => setOpen(true)}>
        +
      </button>
      {fileInput(video, "video/*")}
      {fileInput(photo, "image/*")}
      {fileInput(music, "audio/*")}
      <input
        ref={soundVideo}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            setSoundFile(f);
            setStep("sound");
          }
        }}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={close}>
          <div
            className="panel max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step !== "main" && (
                  <button className="text-[var(--muted)] hover:text-white" onClick={() => setStep("main")} aria-label="Volver">
                    ←
                  </button>
                )}
                <h2 className="font-bold">
                  {step === "main"
                    ? "¿Qué querés agregar?"
                    : step === "text"
                      ? "Elegí un texto"
                      : step === "sfx"
                        ? "Elegí un sonido"
                        : step === "sound"
                          ? "¿Cómo usamos este sonido?"
                          : "Elegí un efecto"}
                </h2>
              </div>
              <button className="text-[var(--muted)] hover:text-white" onClick={close} aria-label="Cerrar">
                ✕
              </button>
            </div>

            {step === "main" && (
              <>
                <div className="grid gap-2">
                  <Option icon="🎬" label="Video" hint="Se agrega al final del video" onClick={() => video.current?.click()} />
                  <Option icon="🖼" label="Foto" hint="Va después de la última foto, 3 s cada una" onClick={() => photo.current?.click()} />
                  <Option icon="T" label="Texto" hint="Va después del último texto" onClick={() => setStep("text")} />
                  <Option icon="♪" label="Música de fondo" hint="Suena durante todo el video" onClick={() => music.current?.click()} />
                  <Option
                    icon="🎵"
                    label="Sonido de otro video"
                    hint="Usá el audio de un Reel o TikTok guardado"
                    onClick={() => soundVideo.current?.click()}
                  />
                  <Option icon="🔊" label="Efecto de sonido" hint="Va después del último sonido" onClick={() => setStep("sfx")} />
                  <Option icon="✨" label="Efecto visual" hint="Zoom, flash, blanco y negro… (2 s)" onClick={() => setStep("fx")} />
                </div>
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  Cada cosa nueva va después de la última de su tipo. Si todavía no hay ninguna, va donde está parado el video.
                </p>
              </>
            )}

            {step === "text" && (
              <div className="grid gap-2">
                {TEXTS.map((t) => (
                  <button key={t.preset} className="btn justify-between !py-3" onClick={() => addText(t)}>
                    <span>{t.label}</span>
                    <span className="text-[var(--muted)]">+</span>
                  </button>
                ))}
              </div>
            )}

            {step === "sfx" && (
              <div className="grid grid-cols-2 gap-2">
                {SFX_NAMES.map((n) => (
                  <button key={n} className="btn justify-center !py-3 text-xs" onClick={() => addSfx(n)}>
                    {SFX_INFO[n].label}
                  </button>
                ))}
              </div>
            )}

            {step === "sound" && soundFile && (
              <div className="grid gap-2">
                <p className="text-xs text-[var(--muted)]">🎵 {soundFile.name}</p>
                <Option
                  icon="🔇"
                  label="Reemplazar el sonido de mi video"
                  hint="Mi video queda en silencio y suena solo este audio"
                  onClick={() => {
                    addVideoSound(soundFile, { replace: true });
                    close();
                  }}
                />
                <Option
                  icon="🎚"
                  label="Mezclar con mi video"
                  hint="Suena de fondo, más bajito, junto con mi voz"
                  onClick={() => {
                    addVideoSound(soundFile, { replace: false });
                    close();
                  }}
                />
              </div>
            )}

            {step === "fx" && (
              <div className="grid grid-cols-2 gap-2">
                {EFFECT_TYPES.map((t) => (
                  <button key={t} className="btn justify-center !py-3 text-xs" onClick={() => addFx(t)}>
                    {EFFECT_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
