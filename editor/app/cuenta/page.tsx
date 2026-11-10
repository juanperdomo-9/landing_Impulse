import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { daysLeft, getAccount, STATUS_LABELS } from "@/lib/account";
import { accountsEnabled, config, formatPrice } from "@/lib/config";
import { getPreapproval, saveSubscription } from "@/lib/mercadopago";
import BrandLogo from "@/components/BrandLogo";
import { withBase } from "@/lib/paths";

export const metadata = { title: "Mi cuenta — Impulsa Studio" };

export default async function CuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ preapproval_id?: string; error?: string; baja?: string }>;
}) {
  await connection();
  if (!accountsEnabled()) redirect("/");
  const params = await searchParams;
  let account = await getAccount();
  if (!account) redirect("/login?next=/cuenta");

  // Back from Mercado Pago checkout: sync the subscription right away (the webhook also does it).
  if (params.preapproval_id) {
    try {
      const pre = await getPreapproval(params.preapproval_id);
      if (pre.external_reference === account.user.id) {
        await saveSubscription(pre, account.email);
        account = (await getAccount())!;
      }
    } catch (e) {
      console.error(e);
    }
  }

  const canCancel = !account.manual && ["authorized", "pending", "paused"].includes(account.status);
  const pct = Math.min(100, Math.round((account.used / Math.max(1, account.limit)) * 100));
  const trialDays = daysLeft(account.trialEndsAt);
  const trialEnded = !account.active && !!account.trialEndsAt;
  const statusLabel = account.isAdmin
    ? "Administrador"
    : account.onTrial
      ? `Prueba gratis · ${trialDays} ${trialDays === 1 ? "día" : "días"}`
      : account.manual
      ? "Activa (activada a mano)"
      : (STATUS_LABELS[account.status] ?? account.status);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between gap-3">
        <BrandLogo />
        <form action={withBase("/api/auth/signout")} method="post">
          <button className="btn">Cerrar sesión</button>
        </form>
      </header>

      <h1 className="text-2xl font-bold">Mi cuenta</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{account.email}</p>

      {params.error && (
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{params.error}</p>
      )}
      {params.baja && (
        <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Listo: tu suscripción quedó dada de baja y no se te van a hacer más cobros.
        </p>
      )}
      {params.preapproval_id && account.status === "pending" && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm">
          Mercado Pago todavía está procesando tu pago. Recarga esta página en unos minutos.
        </p>
      )}

      <section className="panel mt-6 rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label">Plan</div>
            <div className="mt-1 text-lg font-bold">{config.planName}</div>
            <div className="text-sm text-[var(--muted)]">
              {formatPrice()} por mes · {config.aiMonthlyLimit} créditos de IA por mes
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${account.active ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
          >
            {statusLabel}
          </span>
        </div>

        {account.active ? (
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>{account.onTrial ? "Créditos de IA de la prueba" : "Créditos de IA usados este mes"}</span>
                <span className="tabular-nums">
                  {account.used} / {account.limit}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel-2)]">
                <div className="grad h-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">El contador vuelve a cero el día 1 de cada mes.</p>
            </div>
            {account.onTrial && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm">
                <p>
                  Estás en tu <b>prueba gratis</b>: te {trialDays === 1 ? "queda 1 día" : `quedan ${trialDays} días`} (hasta el{" "}
                  {new Date(account.trialEndsAt!).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}). Suscríbete
                  cuando quieras para seguir usando Impulsa Studio sin cortes.
                </p>
                <form action={withBase("/api/mp/subscribe")} method="post" className="mt-3">
                  <button className="btn btn-primary w-full justify-center">
                    Suscribirme con Mercado Pago · {formatPrice()}/mes
                  </button>
                </form>
              </div>
            )}
            {account.nextPaymentDate && !account.manual && !account.onTrial && (
              <p className="text-sm text-[var(--muted)]">
                Próximo cobro: {new Date(account.nextPaymentDate).toLocaleDateString("es-AR")}. Puedes darte de baja
                cuando quieras desde el botón de baja, acá abajo.
              </p>
            )}
            <Link href="/" className="btn btn-primary w-full justify-center !py-2.5">
              Abrir el editor
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {trialEnded && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Tu prueba gratis terminó. ¡Esperamos que te haya gustado! Suscríbete para seguir editando.
              </p>
            )}
            <p className="text-sm">
              Suscríbete para usar el editor con IA: subtítulos automáticos, cortes, fotos, música, efectos y el
              asistente que edita por ti.
            </p>
            <form action={withBase("/api/mp/subscribe")} method="post">
              <button className="btn btn-primary w-full justify-center !py-2.5">
                Suscribirme con Mercado Pago · {formatPrice()}/mes
              </button>
            </form>
            <p className="text-xs text-[var(--muted)]">
              El pago es mensual y automático. Puedes cancelarlo cuando quieras desde Mercado Pago.
            </p>
          </div>
        )}
      </section>

      {canCancel && (
        <details id="baja" className="panel mt-4 rounded-2xl p-5">
          <summary className="cursor-pointer font-bold">Botón de baja</summary>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Al darte de baja se cancela la suscripción en Mercado Pago y no se te hacen más cobros. Vas a poder volver a
            suscribirte cuando quieras.
          </p>
          <form action={withBase("/api/mp/cancel")} method="post" className="mt-4">
            <button className="btn w-full justify-center !border-red-500/40 !py-2.5 text-red-300">
              Confirmar baja de la suscripción
            </button>
          </form>
        </details>
      )}

      {account.isAdmin && (
        <Link href="/admin" className="btn mt-4 w-full justify-center">
          Panel de administración
        </Link>
      )}
    </main>
  );
}
