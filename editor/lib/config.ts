/** Server-side configuration read from environment variables (see .env.example). */
export const config = {
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, ""),
  supabaseKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
  supabaseServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? "",
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? "",
  planName: process.env.PLAN_NAME || "Impulsa Studio — Plan mensual",
  planPrice: Number(process.env.PLAN_PRICE || 25000),
  planCurrency: process.env.PLAN_CURRENCY || "ARS",
  aiMonthlyLimit: Number(process.env.AI_MONTHLY_LIMIT || 200),
  trialDays: Number(process.env.TRIAL_DAYS ?? 3),
  trialAiLimit: Number(process.env.TRIAL_AI_LIMIT || 20),
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, ""),
};

export const accountsEnabled = () => !!(config.supabaseUrl && config.supabaseKey);

export function formatPrice(amount = config.planPrice, currency = config.planCurrency) {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
