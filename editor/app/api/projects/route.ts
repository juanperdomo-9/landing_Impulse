import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/** List of the signed-in user's projects (without the heavy data). */
export async function GET() {
  if (!accountsEnabled()) return Response.json({ error: "Cuentas no configuradas" }, { status: 404 });
  const account = await getAccount();
  if (!account) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("id, name, thumb, updated_at")
    .eq("user_id", account.user.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ projects: data ?? [] });
}
