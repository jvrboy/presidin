import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, requireApiKey, CORS } from "@/lib/api/auth";

const Body = z.object({
  url: z.string().url(),
  min_score: z.number().int().min(0).max(150).optional(),
  secret: z.string().min(8).max(128).optional(),
});

export const Route = createFileRoute("/api/public/v1/webhooks/subscribe")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = await requireApiKey(request);
        if (!auth.ok) return auth.res;
        const p = Body.safeParse(await request.json().catch(() => ({})));
        if (!p.success)
          return new Response(JSON.stringify({ error: p.error.message }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        const secret =
          p.data.secret ??
          crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const { data, error } = await admin()
          .from("webhook_subscriptions")
          .insert({
            url: p.data.url,
            min_score: p.data.min_score ?? 70,
            secret,
          })
          .select()
          .single();
        if (error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        return new Response(
          JSON.stringify({
            id: data.id,
            url: data.url,
            min_score: data.min_score,
            secret,
            verification:
              "HMAC-SHA256 of body using `secret`; sent as `X-DIQ-Signature: sha256=<hex>` with `X-DIQ-Timestamp`",
          }),
          { headers: { "content-type": "application/json", ...CORS } },
        );
      },
      DELETE: async ({ request }) => {
        const auth = await requireApiKey(request);
        if (!auth.ok) return auth.res;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id)
          return new Response(JSON.stringify({ error: "Missing id" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        await admin().from("webhook_subscriptions").delete().eq("id", id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});
