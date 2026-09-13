import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/keepalive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        let source = "browser";
        try {
          const u = new URL(request.url);
          const q = u.searchParams.get("source");
          if (q) source = q;
          else if ((request.headers.get("user-agent") || "").toLowerCase().includes("pg_net"))
            source = "pg_cron";
          else {
            try {
              const cl = request.clone();
              const b = await cl.json().catch(() => null);
              if (b && typeof b.source === "string") source = b.source;
            } catch {
              /* no body */
            }
          }
        } catch {
          /* ignore */
        }
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        let error: { message: string } | null = null;
        let storage: "updated" | "skipped" = "skipped";
        const sb = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
        if (sb) {
          const result = await sb.from("system_health").upsert({
            id: 1,
            last_ping: new Date().toISOString(),
            ws_ok: true,
            notes: `keepalive:${source}`,
          });
          error = result.error;
          storage = error ? "skipped" : "updated";
        }

        // Best-effort ping zo.computer to keep that side warm too.
        let zo: { ok: boolean; status?: number; error?: string } = { ok: false };
        const zoKey = process.env.ZO_COMPUTER_KEY;
        const zoUrl = process.env.ZO_PING_URL || "https://zo.computer/api/keepalive";
        if (zoKey) {
          try {
            const r = await fetch(zoUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${zoKey}` },
              body: JSON.stringify({ source: "divergenceiq", at: new Date().toISOString() }),
            });
            zo = { ok: r.ok, status: r.status };
          } catch (e: any) {
            zo = { ok: false, error: e?.message || "zo fetch failed" };
          }
        }

        const duration = Date.now() - startedAt;
        try {
          await sb?.from("keepalive_logs").insert({
            source,
            ok: !error,
            zo_ok: zoKey ? zo.ok : null,
            zo_status: zo.status ?? null,
            zo_error: zo.error ?? null,
            duration_ms: duration,
            notes: error?.message ?? (sb ? null : "storage skipped: backend env not configured"),
          });
        } catch {
          /* logging best-effort */
        }
        return Response.json({
          ok: !error,
          error: error?.message ?? null,
          storage,
          zo,
          at: new Date().toISOString(),
        });
      },
      GET: async () =>
        Response.json({ ok: true, storage: "skipped", at: new Date().toISOString() }),
    },
  },
});
