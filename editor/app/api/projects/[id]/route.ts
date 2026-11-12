import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
/** Saved projects per account: plenty for real use, and nobody can fill the database. */
const MAX_PROJECTS = 100;

async function owner(ctx: Ctx) {
  if (!accountsEnabled()) return { res: Response.json({ error: "Cuentas no configuradas" }, { status: 404 }) };
  const { id } = await ctx.params;
  if (!UUID.test(id)) return { res: Response.json({ error: "Id inválido" }, { status: 400 }) };
  const account = await getAccount();
  if (!account) return { res: Response.json({ error: "Sin sesión" }, { status: 401 }) };
  return { id, userId: account.user.id };
}

export async function GET(_req: Request, ctx: Ctx) {
  const o = await owner(ctx);
  if ("res" in o) return o.res;
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("id, name, data, updated_at")
    .eq("id", o.id)
    .eq("user_id", o.userId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Proyecto no encontrado" }, { status: 404 });
  return Response.json({ project: data });
}

export async function PUT(req: Request, ctx: Ctx) {
  const o = await owner(ctx);
  if ("res" in o) return o.res;
  const raw = await req.text();
  if (raw.length > 3_500_000) return Response.json({ error: "El proyecto es demasiado grande" }, { status: 413 });
  let body: { name?: unknown; data?: unknown; thumb?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const admin = supabaseAdmin();
  // never overwrite someone else's project with the same id
  const { data: existing } = await admin.from("projects").select("user_id").eq("id", o.id).maybeSingle();
  if (existing && existing.user_id !== o.userId) return Response.json({ error: "No autorizado" }, { status: 403 });
  if (!existing) {
    const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", o.userId);
    if ((count ?? 0) >= MAX_PROJECTS)
      return Response.json(
        { error: `Llegaste al máximo de ${MAX_PROJECTS} proyectos. Borrá alguno en "Mis proyectos" para crear otro.` },
        { status: 409 },
      );
  }
  const { error } = await admin.from("projects").upsert({
    id: o.id,
    user_id: o.userId,
    name: String(body.name ?? "Proyecto sin título").slice(0, 120),
    data: body.data,
    thumb:
      typeof body.thumb === "string" && body.thumb.length < 200_000 && body.thumb.startsWith("data:image/jpeg;base64,")
        ? body.thumb
        : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const o = await owner(ctx);
  if ("res" in o) return o.res;
  const { error } = await supabaseAdmin().from("projects").delete().eq("id", o.id).eq("user_id", o.userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
