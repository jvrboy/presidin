import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Server-callable sweeper. Safe for Zo Computer / external cron to hit on a schedule.
// Marks any signal whose expires_at has passed as 'expired' so the dashboard
// never shows stale day-old open trades.
export const Route = createFileRoute("/api/public/hooks/expire-signals")({
  server: {
    handlers: {
      GET: async () => handle(),
      POST: async () => handle(),
    },
  },
});

async function handle() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, error: "backend env not configured" }, { status: 200 });
  }
  const sb = createClient(url, key);
  const { data, error } = await sb.rpc("expire_stale_signals" as any);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, expired: data ?? 0, at: new Date().toISOString() });
}
