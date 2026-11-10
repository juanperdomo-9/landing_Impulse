import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/** The signed-in user's brand kit, stored in the brand_kits table (see supabase/schema.sql). */

export async function GET() {
  if (!accountsEnabled()) return Response.json({ brand: null }, { status: 404 });
  const account = await getAccount();
  if (!account) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("brand_kits")
    .select("data")
    .eq("user_id", account.user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ brand: data?.data ?? null });
}

export async function PUT(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Cuentas no configuradas" }, { status: 404 });
  const account = await getAccount();
  if (!account) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 1_500_000) return Response.json({ error: "El logo es demasiado grande" }, { status: 413 });
  let brand: unknown;
  try {
    brand = JSON.parse(raw).brand;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!brand || typeof brand !== "object") return Response.json({ error: "Marca inválida" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("brand_kits")
    .upsert({ user_id: account.user.id, data: brand, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
