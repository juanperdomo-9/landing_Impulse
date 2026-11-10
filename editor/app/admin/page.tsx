import { connection } from "next/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { currentPeriod, getAccount, isAdminEmail, STATUS_LABELS, trialEndsAt } from "@/lib/account";
import { accountsEnabled, config, formatPrice } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import BrandLogo from "@/components/BrandLogo";

export const metadata = { title: "Administración — Impulsa Studio" };

async function requireAdmin() {
  const account = await getAccount();
  if (!account || !isAdminEmail(account.email)) notFound();
  return account;
}

async function setManual(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const email = String(formData.get("email"));
  const manual = formData.get("manual") === "1";
  await supabaseAdmin()
    .from("subscriptions")
    .upsert({ user_id: userId, email, manual, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/admin");
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  if (!accountsEnabled()) redirect("/editor");
  await requireAdmin();
  const { q = "" } = await searchParams;

  const admin = supabaseAdmin();
  const [{ data: list }, { data: subs }, { data: usage }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("subscriptions").select("*"),
    admin.from("ai_usage").select("user_id, count").eq("period", currentPeriod()),
  ]);
  const subBy = new Map((subs ?? []).map((s) => [s.user_id as string, s]));
  const useBy = new Map((usage ?? []).map((u) => [u.user_id as string, u.count as number]));

  const users = (list?.users ?? [])
    .filter((u) => !q || u.email?.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const paying = (subs ?? []).filter((s) => s.status === "authorized").length;
  const missingConfig = [
    !config.mpAccessToken && "MP_ACCESS_TOKEN (cobros con Mercado Pago)",
    !config.mpWebhookSecret && "MP_WEBHOOK_SECRET (verificar los avisos de pago)",
    !config.siteUrl && "NEXT_PUBLIC_SITE_URL (dirección de la web)",
  ].filter(Boolean) as string[];
  const manual = (subs ?? []).filter((s) => s.manual).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <BrandLogo size="sm" />
          <h1 className="text-2xl font-bold">Administración</h1>
        </div>
        <Link href="/cuenta" className="btn">
          Mi cuenta
        </Link>
      </header>

      {missingConfig.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <b>Falta configurar en Render (Environment):</b> {missingConfig.join(" · ")}. Mira CONFIGURACION.md.
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Usuarios registrados" value={String(list?.users.length ?? 0)} />
        <Stat label="Suscripciones pagando" value={String(paying)} hint={`≈ ${formatPrice(paying * config.planPrice)} / mes`} />
        <Stat label="Activados a mano" value={String(manual)} />
      </div>

      <form className="mb-3 flex gap-2">
        <input id="q" name="q" defaultValue={q} className="input" placeholder="Buscar por mail…" />
        <button className="btn">Buscar</button>
      </form>

      <div className="panel overflow-x-auto rounded-2xl">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr className="border-b border-[var(--line)]">
              <th className="p-3">Mail</th>
              <th className="p-3">Alta</th>
              <th className="p-3">Suscripción</th>
              <th className="p-3 text-right">Créditos IA este mes</th>
              <th className="p-3">Acceso manual</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const s = subBy.get(u.id);
              const isManual = !!s?.manual;
              const used = useBy.get(u.id) ?? 0;
              return (
                <tr key={u.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 whitespace-nowrap text-[var(--muted)]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const st = s?.status ?? "inactive";
                      if (st !== "authorized" && !isManual) {
                        const end = trialEndsAt(u);
                        if (end && end.getTime() > Date.now())
                          return `Prueba gratis (hasta ${end.toLocaleDateString("es-AR")})`;
                      }
                      return STATUS_LABELS[st] ?? st;
                    })()}
                  </td>
                  <td className={`p-3 text-right tabular-nums ${used >= config.aiMonthlyLimit ? "text-amber-300" : ""}`}>
                    {used}
                  </td>
                  <td className="p-3">
                    <form action={setManual}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="email" value={u.email ?? ""} />
                      <input type="hidden" name="manual" value={isManual ? "0" : "1"} />
                      <button className={`btn !py-1 text-xs ${isManual ? "" : "btn-primary"}`}>
                        {isManual ? "Quitar acceso" : "Dar acceso"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[var(--muted)]">
                  Todavía no hay usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        “Dar acceso” sirve para quien te pagó por otro medio o para regalar acceso. Las suscripciones de Mercado Pago se
        activan y desactivan solas.
      </p>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}
