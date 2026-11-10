import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { cancelPreapproval, saveSubscription } from "@/lib/mercadopago";
import { publicUrl } from "@/lib/paths";
import { supabaseAdmin } from "@/lib/supabase/server";

/** "Botón de baja": cancels the signed-in user's Mercado Pago subscription right away. */
export async function POST() {
  const account = await getAccount();
  if (!account) return NextResponse.redirect(publicUrl("/login?next=/cuenta"), 303);

  const back = new URL(publicUrl("/cuenta"));
  try {
    const { data, error } = await supabaseAdmin()
      .from("subscriptions")
      .select("mp_preapproval_id")
      .eq("user_id", account.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const id = data?.mp_preapproval_id as string | null | undefined;
    if (!id) {
      back.searchParams.set("error", "No encontramos una suscripción de Mercado Pago para dar de baja.");
      return NextResponse.redirect(back, 303);
    }
    const pre = await cancelPreapproval(id);
    await saveSubscription({ ...pre, external_reference: pre.external_reference ?? account.user.id }, account.email);
    back.searchParams.set("baja", "1");
  } catch (e) {
    console.error("baja MP", e);
    back.searchParams.set(
      "error",
      "No se pudo dar de baja la suscripción. Inténtalo de nuevo en unos minutos o cancélala desde tu cuenta de Mercado Pago (Suscripciones).",
    );
  }
  return NextResponse.redirect(back, 303);
}
