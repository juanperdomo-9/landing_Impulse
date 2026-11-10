import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { createSubscription } from "@/lib/mercadopago";
import { publicUrl } from "@/lib/paths";

/** Starts a Mercado Pago monthly subscription for the signed-in user and redirects to checkout. */
export async function POST() {
  const account = await getAccount();
  if (!account) return NextResponse.redirect(publicUrl("/login?next=/cuenta"), 303);
  try {
    const checkout = await createSubscription(account.user.id, account.email);
    return NextResponse.redirect(checkout, 303);
  } catch (e) {
    console.error(e);
    const back = new URL(publicUrl("/cuenta"));
    back.searchParams.set("error", "No se pudo iniciar el pago con Mercado Pago. Inténtalo de nuevo en unos minutos.");
    return NextResponse.redirect(back, 303);
  }
}
