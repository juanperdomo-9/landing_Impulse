import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

/** Supabase client bound to the visitor's session cookies (Server Components, Route Handlers, Server Actions). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(config.supabaseUrl, config.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

/** Privileged client (service role). Only for trusted server code: webhooks, usage counters, admin. */
export function supabaseAdmin() {
  if (!config.supabaseServiceKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
