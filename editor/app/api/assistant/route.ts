import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";

export const runtime = "nodejs";
export const maxDuration = 300;

// Claude Haiku: muy económico (fracciones de centavo por instrucción).
// Para máxima calidad en pedidos complejos se puede usar "claude-opus-5-5".
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

// Limits for what the browser may send (the conversation history is built client-side).
const MAX_BODY_CHARS = 8_000_000; // ~6 MB of images at most once base64-encoded
const MAX_MESSAGES = 240; // 8 instructions x up to 25 messages each, as the browser keeps them
const MAX_TEXT_CHARS = 300_000; // all text in the conversation (~75k tokens)
const MAX_IMAGES = 60; // the browser sends at most 50 (storyboard, new photos and frames the AI asked to see)
const MAX_TOOL_RESULT_CHARS = 120_000; // a long transcript fits; a smuggled novel does not

let client: Anthropic | null = null;

type Block = Anthropic.Beta.BetaContentBlockParam;

/** Total text characters in a list of blocks, including the text inside tool results. */
function textChars(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "text") n += b.text.length;
    else if (b.type === "tool_result") {
      if (typeof b.content === "string") n += b.content.length;
      else if (Array.isArray(b.content))
        for (const c of b.content) if (c.type === "text") n += c.text.length;
    } else if (b.type === "tool_use") n += JSON.stringify(b.input ?? {}).length;
  }
  return n;
}

/** Images in a list of blocks, including the frames inside tool results. */
function imageCount(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "image") n++;
    else if (b.type === "tool_result" && Array.isArray(b.content)) n += b.content.filter((c) => c.type === "image").length;
  }
  return n;
}

/** Checks the shape and size of the conversation. Returns an error message, or null when it is fine. */
function validate(messages: Anthropic.Beta.BetaMessageParam[]): string | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return "La conversación es demasiado larga. Recarga el asistente para empezar una nueva.";
  let text = 0;
  let images = 0;
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") return "Conversación inválida";
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (!Array.isArray(blocks)) return "Conversación inválida";
    text += textChars(blocks);
    images += imageCount(blocks);
  }
  if (text > MAX_TEXT_CHARS) return "La conversación es demasiado larga. Recarga el asistente para empezar una nueva.";
  if (images > MAX_IMAGES) return "Demasiadas imágenes en la conversación.";

  const last = messages[messages.length - 1];
  if (last.role !== "user" || !Array.isArray(last.content)) return "Conversación inválida";
  const isNewInstruction = last.content.some((b) => b.type === "text");
  if (!isNewInstruction) {
    // A follow-up step may only carry the results of the tools the AI asked for in its last turn.
    if (!last.content.every((b) => b.type === "tool_result")) return "Conversación inválida";
    const prev = messages[messages.length - 2];
    const asked = new Set(
      prev?.role === "assistant" && Array.isArray(prev.content)
        ? prev.content.filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id)
        : [],
    );
    for (const b of last.content) {
      if (b.type !== "tool_result" || !asked.has(b.tool_use_id)) return "Conversación inválida";
      if (textChars([b]) > MAX_TOOL_RESULT_CHARS) return "El resultado de una herramienta es demasiado grande.";
    }
  }
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ error: "La conversación es demasiado grande. Recarga el asistente para empezar una nueva." }, { status: 413 });
  }
  let body: { messages?: Anthropic.Beta.BetaMessageParam[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const messages = body.messages ?? [];
  const invalid = validate(messages);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // Each new instruction from the user costs one credit; follow-up requests that only carry
  // tool results are part of the same instruction. Every request (follow-ups included) also counts
  // toward a monthly cap of calls in guardAi, so a forged follow-up cannot be used for free.
  const last = messages[messages.length - 1];
  const isNewInstruction = Array.isArray(last.content) && last.content.some((b) => b.type === "text");
  const guard = await guardAi(isNewInstruction);
  if (guard instanceof Response) return guard;
  const usage = guard.usage;

  client ??= new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      // a bit more thinking gives noticeably better editing judgment at a small extra cost
      output_config: { effort: "high" },
      system: SYSTEM_PROMPT,
      // eager streaming: inputs are small but arrive sooner; the browser validates them
      tools: AI_TOOLS.map((t) => ({ ...t, eager_input_streaming: true })),
      cache_control: { type: "ephemeral" },
      messages,
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      return Response.json({
        content: [{ type: "text", text: "No puedo ayudar con esa petición. Prueba a reformularla." }],
        stop_reason: "end_turn",
        refused: true,
      });
    }
    return Response.json({ content: msg.content, stop_reason: msg.stop_reason, usage });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "La clave de la API de Claude no es válida." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Demasiadas peticiones. Espera unos segundos e inténtalo de nuevo." }, { status: 429 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return Response.json({ error: `Petición rechazada: ${error.message}` }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Error de la API (${error.status}): ${error.message}` }, { status: 502 });
    }
    return Response.json({ error: "No se pudo contactar con la IA." }, { status: 502 });
  }
}
