"use client";

import { store, useEditor } from "@/lib/store";

/** Color input with an eyedropper button that picks a color by tapping the video preview. */
export default function ColorField({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const picking = useEditor((s) => s.eyedropper);
  const active = !!picking && picking.id === id;
  return (
    <div className="flex items-center gap-1">
      <input id={id} type="color" className="h-8 min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        title="Tomar un color del video (cuentagotas)"
        aria-label="Cuentagotas: tomar un color del video"
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border text-sm ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel-2)] hover:border-[var(--accent)]"}`}
        onClick={() => store.set({ eyedropper: active ? null : { id: id ?? "color", apply: onChange } })}
      >
        💧
      </button>
    </div>
  );
}
