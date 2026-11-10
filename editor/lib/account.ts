import "server-only";
import type { User } from "@supabase/supabase-js";
import { accountsEnabled, config } from "@/lib/config";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export interface Account {
  user: User;
  email: string;
  isAdmin: boolean;
  active: boolean;
  /** true while the free trial is the only thing giving access */
  onTrial: boolean;
  trialEndsAt: string | null;
  status: string;
  manual: boolean;
  nextPaymentDate: string | null;
  used: number;
  limit: number;
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7);

export const isAdminEmail = (email?: string | null) =>
  !!email && config.adminEmails.includes(email.toLowerCase());

/** The signed-in user plus their plan and AI usage, or null when nobody is signed in. */
export async function getAccount(): Promise<Account | null> {
  if (!accountsEnabled()) return null;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: sub }, { data: usage }] = await Promise.all([
    sb.from("subscriptions").select("status, manual, next_payment_date").eq("user_id", user.id).maybeSingle(),
    sb.from("ai_usage").select("count").eq("user_id", user.id).eq("period", currentPeriod()).maybeSingle(),
  ]);

  const email = user.email ?? "";
  const isAdmin = isAdminEmail(email);
  const status = sub?.status ?? "inactive";
  const manual = !!sub?.manual;
  const paid = isAdmin || manual || status === "authorized";
  const trialEnd = trialEndsAt(user);
  const onTrial = !paid && !!trialEnd && trialEnd.getTime() > Date.now();
  return {
    user,
    email,
    isAdmin,
    status,
    manual,
    active: paid || onTrial,
    onTrial,
    trialEndsAt: trialEnd?.toISOString() ?? null,
    nextPaymentDate: sub?.next_payment_date ?? null,
    used: usage?.count ?? 0,
    limit: onTrial ? config.trialAiLimit : config.aiMonthlyLimit,
  };
}

/** End of the free trial, counted from sign-up. Null when trials are disabled (TRIAL_DAYS=0). */
export function trialEndsAt(user: { created_at?: string }): Date | null {
  if (!config.trialDays || !user.created_at) return null;
  return new Date(new Date(user.created_at).getTime() + config.trialDays * 86_400_000);
}

export function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Counts one AI instruction for the user this month. Returns the new total. */
export async function incrementUsage(userId: string): Promise<number> {
  return increment(userId, currentPeriod());
}

/**
 * Counts every request to the AI (instructions and the follow-up steps of each one) this month.
 * Stored in the same ai_usage table under its own period key, so no schema change is needed and
 * the per-instruction credits shown to the user stay untouched. Returns the new total.
 */
export async function incrementCalls(userId: string): Promise<number> {
  return increment(userId, `${currentPeriod()}:llamadas`);
}

async function increment(userId: string, period: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("increment_ai_usage", {
    p_user: userId,
    p_period: period,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export const STATUS_LABELS: Record<string, string> = {
  authorized: "Activa",
  pending: "Pago pendiente",
  paused: "Pausada",
  cancelled: "Cancelada",
  inactive: "Sin suscripción",
};
