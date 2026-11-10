import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

const SYSTEM = `Eres el redactor de redes sociales de "Impulsa Studio". Escribes el texto que acompaña a un video al publicarlo.

Reglas:
- Escribe en el idioma y la variante del cliente (por defecto, español rioplatense: "vos", "escribinos", "aprovechá").
- Respeta el tono, las frases, los datos de contacto y los hashtags de la marca cuando existan. No inventes precios, promociones, direcciones ni datos que no estén en la información recibida.
- Estructura: una primera línea gancho que invite a ver el video, 2 a 4 líneas con el mensaje principal, un llamado a la acción claro (WhatsApp, link, mensaje directo, según la marca) y al final los hashtags.
- Adapta al formato: Instagram y Facebook admiten algo más de texto; TikTok es más corto y directo; para estado de WhatsApp, 1 a 2 líneas sin hashtags.
- Puedes usar algunos emojis con moderación.
- Devuelve solo el texto listo para copiar, sin explicaciones, sin comillas y sin títulos.`;

let client: Anthropic | null = null;

export async function POST(req: Request) {
  let body: { platform?: string; notes?: string; brand?: string; video?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const guard = await guardAi(true);
  if (guard instanceof Response) return guard;

  const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
  const prompt = [
    `<plataforma>${clip(body.platform, 40) || "Instagram"}</plataforma>`,
    `<marca>\n${clip(body.brand, 4000) || "(sin kit de marca)"}\n</marca>`,
    `<video>\n${clip(body.video, 3000)}\n</video>`,
    body.transcript ? `<lo_que_se_dice_en_el_video>\n${clip(body.transcript, 12000)}\n</lo_que_se_dice_en_el_video>` : "",
    body.notes ? `<pedido_del_cliente>\n${clip(body.notes, 1500)}\n</pedido_del_cliente>` : "",
    "Escribe el texto para publicar este video.",
  ]
    .filter(Boolean)
    .join("\n\n");

  client ??= new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "refusal")
      return Response.json({ error: "No se pudo generar el texto. Prueba con otras indicaciones." }, { status: 422 });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return Response.json({ text, usage: guard.usage });
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
