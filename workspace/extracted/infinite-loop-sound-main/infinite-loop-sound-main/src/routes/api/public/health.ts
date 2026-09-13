import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data } = await sb.from("system_health").select("*").eq("id", 1).single();
        const { data: latest } = await sb
          .from("signals")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return Response.json({
          status: "ok",
          last_ping: data?.last_ping ?? null,
          ws_ok: data?.ws_ok ?? true,
          latest_signal_at: latest?.created_at ?? null,
          server_time: new Date().toISOString(),
        });
      },
    },
  },
});
