import { createFileRoute } from "@tanstack/react-router";
import { admin, requireApiKey, CORS } from "@/lib/api/auth";

export const Route = createFileRoute("/api/public/v1/signals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = await requireApiKey(request);
        if (!auth.ok) return auth.res;
        const url = new URL(request.url);
        const limit = Math.min(
          100,
          Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)),
        );
        const pair = url.searchParams.get("pair");
        const minScore = parseInt(url.searchParams.get("min_score") || "0", 10);
        let q = admin()
          .from("signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)
          .gte("score", minScore);
        if (pair) q = q.eq("pair", pair);
        const { data, error } = await q;
        if (error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        return new Response(JSON.stringify({ count: data?.length ?? 0, signals: data ?? [] }), {
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});
