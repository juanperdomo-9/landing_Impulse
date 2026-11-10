import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

const SYSTEM = `Eres un editor de video experto en Reels, TikTok y Shorts. Recibes fotogramas de un video de referencia que le gusta a un cliente, junto con datos medidos (duración, formato, cortes). Tu tarea es describir su ESTILO de edición para poder imitarlo en otros videos del cliente.

Responde en español, en viñetas breves y concretas, con estas secciones:
- Gancho (primeros segundos): qué se ve o se lee para atrapar.
- Ritmo: velocidad de los cortes y sensación general.
- Subtítulos: si hay, cómo son (tamaño, mayúsculas, color, palabra resaltada, posición, fondo). Indica el preset más parecido entre: tiktok, clasico, karaoke, minimal, neon.
- Textos en pantalla: títulos, etiquetas, llamados a la acción; estilo y colores aproximados (en hex).
- Imagen: encuadre, formato, colores/filtro (por ejemplo cálido, blanco y negro, saturado), iluminación.
- Efectos y transiciones visibles (zoom, temblor, flash, etc.) y efectos de sonido probables.
- Estructura: cómo arranca, desarrolla y cierra.
- Cómo imitarlo: 4 a 6 pasos concretos usando: subtítulos (preset y colores), cortes de silencios, textos (titulo/subtitulo/etiqueta/cta), efectos (zoom, temblor, flash, fundidos, cine, blanco_negro, vintage, saturacion, contraste, vineta, glitch), efectos de sonido (whoosh, pop, ding, boom, click, riser, tada, buzzer, glitch, bubble) y formato.

Describe solo lo que se ve en los fotogramas y los datos; si algo no se puede saber (por ejemplo la música), dilo brevemente. No uses tablas.`;

let client: Anthropic | null = null;

export async function POST(req: Request) {
  let body: {
    name?: string;
    notes?: string;
    duration?: number;
    aspect?: string;
    cuts?: number;
    avgShot?: number;
    cutTimes?: number[];
    frames?: { t: number; data: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const frames = (Array.isArray(body.frames) ? body.frames : []).slice(0, 10);
  if (!frames.length) return Response.json({ error: "No llegaron fotogramas del video" }, { status: 400 });

  const guard = await guardAi(true);
  if (guard instanceof Response) return guard;

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        `Video de referencia: "${String(body.name ?? "").slice(0, 120)}"`,
        `Duración: ${Number(body.duration ?? 0).toFixed(1)} s · Formato: ${String(body.aspect ?? "?")}`,
        `Cortes detectados: ${Number(body.cuts ?? 0)} (un corte cada ~${Number(body.avgShot ?? 0).toFixed(1)} s)`,
        Array.isArray(body.cutTimes) && body.cutTimes.length
          ? `Momentos de corte (s): ${body.cutTimes.slice(0, 60).map((t) => Number(t).toFixed(1)).join(", ")}`
          : "",
        body.notes ? `Lo que le gusta al cliente: ${String(body.notes).slice(0, 800)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  for (const f of frames) {
    if (typeof f?.data !== "string" || f.data.length > 400_000) continue;
    content.push({ type: "text", text: `Fotograma en ${Number(f.t).toFixed(1)} s:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  content.push({ type: "text", text: "Describe el estilo de edición de este video." });

  client ??= new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (msg.stop_reason === "refusal")
      return Response.json({ error: "No se pudo analizar este video." }, { status: 422 });
    const profile = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return Response.json({ profile, usage: guard.usage });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return Response.json({ error: "La clave de la API de Claude no es válida." }, { status: 500 });
    if (error instanceof Anthropic.RateLimitError)
      return Response.json({ error: "Demasiadas peticiones. Espera unos segundos." }, { status: 429 });
    if (error instanceof Anthropic.APIError)
      return Response.json({ error: `Error de la IA (${error.status}).` }, { status: 502 });
    return Response.json({ error: "No se pudo contactar con la IA." }, { status: 502 });
  }
}
