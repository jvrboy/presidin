// Server-driven status endpoint for /api/public/hooks/replay-dlq runs.
// The DLQ admin UI polls this with an idempotency key to deterministically
// track replay progress without re-invoking the replay action itself.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/replay-status")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Idempotency-Key",
          },
        }),
      GET: async ({ request }) => {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const idem = request.headers.get("x-idempotency-key") || "";
        const [pending, resolved, recent] = await Promise.all([
          sb
            .from("bot_trades_dlq")
            .select("id", { count: "exact", head: true })
            .eq("resolved", false),
          sb
            .from("bot_trades_dlq")
            .select("id", { count: "exact", head: true })
            .eq("resolved", true),
          sb
            .from("bot_trades_dlq")
            .select("id,trade_id,resolved,retry_count,updated_at,last_error")
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);
        return new Response(
          JSON.stringify({
            idempotencyKey: idem || null,
            pending: pending.count ?? 0,
            resolved: resolved.count ?? 0,
            recent: recent.data ?? [],
            ts: new Date().toISOString(),
          }),
          { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } },
        );
      },
    },
  },
});
