import { redirect } from "next/navigation";
import { config } from "@/lib/config";

/**
 * The editor's sales page lives on the Impulsa Studio website (impulsastudiodigital.com.ar/editor-ia/),
 * with the same design as the rest of the brand. That page links to /login and /editor here, and has the
 * "Botón de baja" link that points to /cuenta#baja.
 * (Sign-in links that land on "/" are sent to /auth/callback by proxy.ts before reaching this page.)
 */
export default function Home() {
  redirect(config.marketingUrl);
}
