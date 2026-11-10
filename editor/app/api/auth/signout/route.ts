import { NextResponse } from "next/server";
import { accountsEnabled } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (accountsEnabled()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
