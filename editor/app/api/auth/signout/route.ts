import { NextResponse } from "next/server";
import { accountsEnabled, config } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";

/** Signs out and goes back to the editor's page on the Impulsa Studio website. */
export async function POST() {
  if (accountsEnabled()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(config.marketingUrl, 303);
}
