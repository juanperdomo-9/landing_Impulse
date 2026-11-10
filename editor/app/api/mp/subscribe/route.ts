import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { createSubscription } from "@/lib/mercadopago";

/** Starts a Mercado Pago monthly subscription for the signed-in user and redirects to checkout. */
export async function POST(req: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.redirect(new URL("/login?next=/cuenta", req.url), 303);
  try {
    const checkout = await createSubscription(account.user.id, account.email, new URL(req.url).origin);
    return NextResponse.redirect(checkout, 303);
  } catch (e) {
    console.error(e);
    const back = new URL("/cuenta", req.url);
    back.searchParams.set("error", "No se pudo iniciar el pago con Mercado Pago. Inténtalo de nuevo en unos minutos.");
    return NextResponse.redirect(back, 303);
  }
}
