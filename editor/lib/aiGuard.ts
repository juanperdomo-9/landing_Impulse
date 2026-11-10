import "server-only";
import { getAccount, incrementCalls, incrementUsage } from "@/lib/account";
import { accountsEnabled, config } from "@/lib/config";

export type Usage = { used: number; limit: number };

/**
 * Requests to the AI allowed per credit. One instruction can take several steps (the browser runs the
 * tools and sends the results back, up to 12 times), so this caps the real cost of a client whatever
 * the browser sends, including requests forged to skip the credit count.
 */
export const CALLS_PER_CREDIT = 12;

/**
 * Checks that the visitor may use the AI and, when `countsAsCredit`, spends one credit.
 * Returns the usage to report back, or a Response to send instead (not allowed / limit reached).
 */
export async function guardAi(countsAsCredit: boolean): Promise<{ usage?: Usage } | Response> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      {
        error:
          "El asistente IA aún no tiene su clave de Claude. Añade la variable ANTHROPIC_API_KEY (en Vercel: Settings → Environment Variables) y vuelve a implementar. Mientras tanto puedes editar con las herramientas del panel izquierdo.",
      },
      { status: 500 },
    );
  }
  if (!accountsEnabled()) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_OPEN_AI !== "1")
      return Response.json(
        { error: "El asistente IA se activa cuando configures las cuentas de usuario (Supabase). Mira CONFIGURACION.md." },
        { status: 503 },
      );
    return {};
  }
  const account = await getAccount();
  if (!account) return Response.json({ error: "Tu sesión expiró. Vuelve a ingresar." }, { status: 401 });
  if (!account.active)
    return Response.json(
      { error: 'Tu prueba gratis terminó. Suscríbete desde "Mi cuenta" para seguir usando la IA.' },
      { status: 402 },
    );
  const usage = { used: account.used, limit: account.limit };
  if (!account.isAdmin) {
    const calls = await incrementCalls(account.user.id);
    if (calls > account.limit * CALLS_PER_CREDIT)
      return Response.json(
        {
          error: account.onTrial
            ? 'Llegaste al máximo de uso de la IA de la prueba gratis. Suscríbete desde "Mi cuenta" para seguir usándola.'
            : "Llegaste al máximo de uso de la IA de este mes. Se renueva el día 1. Mientras tanto puedes seguir editando a mano.",
        },
        { status: 429 },
      );
  }
  if (countsAsCredit) {
    if (account.used >= account.limit && !account.isAdmin)
      return Response.json(
        {
          error: account.onTrial
            ? `Usaste los ${account.limit} créditos de IA de la prueba gratis. Suscríbete desde "Mi cuenta" para tener ${config.aiMonthlyLimit} por mes. Mientras tanto puedes seguir editando a mano.`
            : `Llegaste al límite de ${account.limit} créditos de IA de este mes. Se renueva el día 1. Mientras tanto puedes seguir editando a mano.`,
        },
        { status: 429 },
      );
    usage.used = await incrementUsage(account.user.id);
  }
  return { usage };
}
