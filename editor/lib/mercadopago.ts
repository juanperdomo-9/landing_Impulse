import "server-only";
import crypto from "node:crypto";
import { config } from "@/lib/config";
import { publicUrl } from "@/lib/paths";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Mercado Pago subscriptions ("preapproval" API): https://www.mercadopago.com/developers/es/docs/subscriptions */

const API = "https://api.mercadopago.com";

interface Preapproval {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference?: string;
  payer_email?: string;
  init_point?: string;
  next_payment_date?: string;
}

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  if (!config.mpAccessToken) throw new Error("Falta MP_ACCESS_TOKEN");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.mpAccessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  return body as T;
}

export async function createSubscription(userId: string, email: string) {
  const pre = await mp<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: config.planName,
      external_reference: userId,
      payer_email: email,
      back_url: publicUrl("/cuenta"),
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: config.planPrice,
        currency_id: config.planCurrency,
      },
    }),
  });
  await saveSubscription(pre, email);
  if (!pre.init_point) throw new Error("Mercado Pago no devolvió el enlace de pago");
  return pre.init_point;
}

export async function getPreapproval(id: string) {
  return mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
}

export async function cancelPreapproval(id: string) {
  return mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/** Stores the state Mercado Pago reports. The user is identified by external_reference. */
export async function saveSubscription(pre: Preapproval, email?: string) {
  const userId = pre.external_reference;
  if (!userId) return;
  const { error } = await supabaseAdmin()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        ...(email ? { email } : {}),
        status: pre.status,
        mp_preapproval_id: pre.id,
        next_payment_date: pre.next_payment_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Validates the x-signature header Mercado Pago sends with webhooks (when MP_WEBHOOK_SECRET is set). */
export function validWebhookSignature(req: Request, dataId: string): boolean {
  if (!config.mpWebhookSecret) {
    // Still safe (the state is always re-read from Mercado Pago), but anyone could trigger those reads.
    if (process.env.NODE_ENV === "production")
      console.error("Falta MP_WEBHOOK_SECRET: las notificaciones de Mercado Pago no se están verificando.");
    return true;
  }
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    sig.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", config.mpWebhookSecret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
