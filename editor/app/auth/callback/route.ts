import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { publicUrl, safeNext } from "@/lib/paths";
import { supabaseServer } from "@/lib/supabase/server";

/** Landing point of the sign-in link sent by mail. Creates the session and continues to `next`. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;

  const sb = await supabaseServer();
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  if (ok) return NextResponse.redirect(publicUrl(next));
  return NextResponse.redirect(publicUrl("/login?error=enlace"));
}
