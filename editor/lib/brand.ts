"use client";

import { addFiles } from "./media";
import { totalDuration, uid } from "./project";
import { store } from "./store";
import type { BrandKit } from "./types";

/** Google Fonts offered for the brand (weights that each family really has). */
export const BRAND_FONTS: { name: string; weights: string; style: string }[] = [
  { name: "Inter", weights: "400;700;900", style: "Moderna y neutra" },
  { name: "Montserrat", weights: "400;700;900", style: "Geométrica, muy usada en moda" },
  { name: "Poppins", weights: "400;700;900", style: "Redondeada y amigable" },
  { name: "Bebas Neue", weights: "400", style: "Títulos altos en mayúsculas" },
  { name: "Anton", weights: "400", style: "Impacto, ideal para promos" },
  { name: "Oswald", weights: "400;700", style: "Condensada y fuerte" },
  { name: "Archivo Black", weights: "400", style: "Gruesa y llamativa" },
  { name: "League Spartan", weights: "400;700;900", style: "Fuerte y moderna" },
  { name: "Raleway", weights: "400;700;900", style: "Elegante y fina" },
  { name: "Playfair Display", weights: "400;700;900", style: "Elegante con serifa (lujo, moda)" },
  { name: "DM Serif Display", weights: "400", style: "Serifa editorial" },
  { name: "Lora", weights: "400;700", style: "Serifa clásica" },
  { name: "Space Grotesk", weights: "400;700", style: "Tecnológica" },
  { name: "Pacifico", weights: "400", style: "Manuscrita divertida" },
  { name: "Caveat", weights: "400;700", style: "Escrita a mano" },
];

const loaded = new Map<string, Promise<void>>();

/** Loads a Google Font so both the page and the canvas can use it. */
export function loadFont(name: string): Promise<void> {
  if (!name || name === "Inter") return Promise.resolve();
  let p = loaded.get(name);
  if (!p) {
    const f = BRAND_FONTS.find((x) => x.name === name);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@${f?.weights ?? "400;700"}&display=swap`;
    document.head.appendChild(link);
    p = new Promise<void>((res) => {
      link.onload = () => {
        Promise.all([document.fonts.load(`400 40px "${name}"`), document.fonts.load(`900 40px "${name}"`)])
          .catch(() => undefined)
          .then(() => res());
      };
      link.onerror = () => res();
    });
    loaded.set(name, p);
  }
  return p;
}

export function emptyBrand(): BrandKit {
  return {
    name: "",
    description: "",
    tone: "Cercano y entusiasta",
    font: "Montserrat",
    primary: "#ec4899",
    secondary: "#8b5cf6",
    text: "#ffffff",
    logo: null,
    whatsapp: "",
    instagram: "",
    website: "",
    phrases: "",
    hashtags: "",
  };
}

const LS_KEY = "impulsa-brand";

export async function loadBrand(): Promise<BrandKit | null> {
  try {
    const res = await fetch("/api/brand");
    if (res.ok) {
      const { brand } = await res.json();
      if (brand) return { ...emptyBrand(), ...brand };
    }
  } catch {
    /* fall back to this browser */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...emptyBrand(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

/** Saves to the account (or to this browser when accounts are not set up). Returns where it was saved. */
export async function saveBrand(brand: BrandKit): Promise<"cuenta" | "navegador"> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(brand));
  } catch {
    /* storage full or blocked */
  }
  try {
    const res = await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand }),
    });
    if (res.ok) return "cuenta";
  } catch {
    /* offline */
  }
  return "navegador";
}

/** Shrinks an uploaded logo to a PNG data URL (max 512px) so it can be stored with the brand. */
export async function logoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const LOGO_ASSET_NAME = "logo-de-la-marca.png";

/** Makes sure the brand logo exists as an image in "Medios" and returns its asset id. */
export async function ensureLogoAsset(brand: BrandKit): Promise<string | null> {
  if (!brand.logo) return null;
  const existing = store.get().assets.find((a) => a.name === LOGO_ASSET_NAME);
  if (existing) return existing.id;
  const blob = await (await fetch(brand.logo)).blob();
  await addFiles([new File([blob], LOGO_ASSET_NAME, { type: "image/png" })]);
  return store.get().assets.find((a) => a.name === LOGO_ASSET_NAME)?.id ?? null;
}

/**
 * Applies the brand to the current video: font, colors of subtitles and labels, and the logo
 * in a corner for the whole video.
 */
export async function applyBrand(
  brand: BrandKit,
  opts: { logo?: boolean; logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" } = {},
) {
  await loadFont(brand.font);
  const logoId = opts.logo === false ? null : await ensureLogoAsset(brand);
  const pos = opts.logoPosition ?? "top-right";
  const xy = {
    "top-left": { x: 0.12, y: 0.08 },
    "top-right": { x: 0.88, y: 0.08 },
    "bottom-left": { x: 0.12, y: 0.92 },
    "bottom-right": { x: 0.88, y: 0.92 },
  }[pos];
  store.edit((p) => {
    const dur = Math.max(totalDuration(p), 1);
    const overlays = p.overlays.filter((o) => !(o.kind === "image" && o.assetId === logoId));
    if (logoId)
      overlays.push({
        id: uid(),
        kind: "image",
        assetId: logoId,
        start: 0,
        end: dur,
        x: xy.x,
        y: xy.y,
        size: 0.16,
        animation: "fade",
      });
    return {
      ...p,
      font: brand.font,
      brandColor: brand.primary,
      subtitleStyle: { ...p.subtitleStyle, color: brand.text || "#ffffff", highlight: brand.primary },
      overlays,
    };
  });
}

/** Short text for the AI describing the brand. */
export function describeBrand(b: BrandKit | null): string {
  if (!b || !(b.name || b.description)) return "Kit de marca: (no configurado)";
  const L = [
    `Kit de marca: "${b.name}"`,
    b.description && `  Qué hace / público: ${b.description}`,
    b.tone && `  Tono: ${b.tone}`,
    `  Tipografía: ${b.font}. Colores: principal ${b.primary}, secundario ${b.secondary}, texto ${b.text}.`,
    `  Logo: ${b.logo ? "sí (usa apply_brand para ponerlo)" : "no cargado"}`,
    b.whatsapp && `  WhatsApp: ${b.whatsapp}`,
    b.instagram && `  Instagram: ${b.instagram}`,
    b.website && `  Web: ${b.website}`,
    b.phrases && `  Frases de la marca: ${b.phrases.split("\n").filter(Boolean).join(" · ")}`,
    b.hashtags && `  Hashtags habituales: ${b.hashtags}`,
  ];
  return L.filter(Boolean).join("\n");
}
