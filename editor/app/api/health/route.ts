/**
 * Health check for UptimeRobot (or Render): answers "ok" without touching Supabase or the AI.
 * Pinging it every 5 minutes also keeps the free Render instance from sleeping.
 */
export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
