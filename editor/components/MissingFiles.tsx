"use client";

import { useState } from "react";
import { relinkAsset } from "@/lib/projects";
import { useEditor } from "@/lib/store";

/** Shown when an opened project uses files that are not on this device. */
export default function MissingFiles() {
  const missing = useEditor((s) => s.missingAssets);
  const [error, setError] = useState("");
  if (!missing.length) return null;
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 md:px-4">
      <p className="mb-1.5 font-semibold">
        Para seguir editando en este dispositivo, volvé a elegir {missing.length === 1 ? "este archivo" : "estos archivos"}:
      </p>
      <div className="flex flex-wrap gap-2">
        {missing.map((m) => (
          <label key={m.id} className="btn cursor-pointer !py-1 text-xs">
            {m.kind === "video" ? "🎬" : m.kind === "image" ? "🖼" : "♪"} {m.name}
            <input
              type="file"
              accept={`${m.kind}/*`}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setError("");
                try {
                  await relinkAsset(m, f);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-red-300">{error}</p>}
    </div>
  );
}
