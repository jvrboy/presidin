import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const ConfluenceItem = z.object({ label: z.string(), passed: z.boolean(), pts: z.number() });

export const saveSignal = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pair: z.string(),
        timeframe: z.string(),
        direction: z.enum(["BUY", "SELL"]),
        entry: z.number(),
        sl: z.number(),
        tp1: z.number(),
        tp2: z.number(),
        tp3: z.number(),
        score: z.number().int(),
        rating: z.string(),
        confluence: z.array(ConfluenceItem),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: row, error } = await sb.from("signals").insert(data).select().single();
    if (error) throw new Error(error.message);
    // Fan-out to webhook subscribers with HMAC-SHA256 signature
    try {
      const { data: hooks } = await sb.from("webhook_subscriptions").select("*").eq("active", true);
      const payload = JSON.stringify({ event: "signal.created", signal: row });
      await Promise.allSettled(
        (hooks || [])
          .filter((h: any) => (row.score ?? 0) >= (h.min_score ?? 0))
          .map(async (h: any) => {
            const headers: Record<string, string> = { "content-type": "application/json" };
            if (h.secret) {
              const sig = createHmac("sha256", h.secret).update(payload).digest("hex");
              headers["x-diq-signature"] = `sha256=${sig}`;
              headers["x-diq-timestamp"] = String(Date.now());
            }
            await fetch(h.url, { method: "POST", headers, body: payload }).catch(() => {});
            await sb
              .from("webhook_subscriptions")
              .update({ last_delivery_at: new Date().toISOString() })
              .eq("id", h.id);
          }),
      );
    } catch {
      /* ignore */
    }
    return { id: row.id as string };
  });

export const listSignals = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb
    .from("signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return { signals: data || [] };
});
