import { getPreapproval, saveSubscription, validWebhookSignature } from "@/lib/mercadopago";

/**
 * Mercado Pago notifications. Configure in Mercado Pago → Tus integraciones → Webhooks:
 *   URL: https://TU-DOMINIO/api/mp/webhook   Evento: "Planes y suscripciones"
 * The state is always re-read from Mercado Pago, so a forged notification cannot activate anyone.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string } };
  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  const id = body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";

  if (!id) return new Response("ok");
  if (!validWebhookSignature(req, url.searchParams.get("data.id") ?? id)) {
    return new Response("firma inválida", { status: 401 });
  }
  if (type.includes("preapproval")) {
    try {
      await saveSubscription(await getPreapproval(id));
    } catch (e) {
      console.error("webhook MP", e);
      return new Response("error", { status: 500 }); // Mercado Pago retries
    }
  }
  return new Response("ok");
}
