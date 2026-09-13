import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiKey, CORS } from "@/lib/api/auth";
import { analyze } from "@/lib/engine/signal";

// Server-side Deriv candle fetch via REST-like WebSocket bridge is heavy on a Worker;
// instead we call Deriv's public WS through fetch is unavailable, so we ship a thin
// HTTPS proxy: use the deriv ws via undici WebSocket polyfill is overkill. To keep this
// fully serverless-compatible, we use Deriv's public REST candle endpoint.
const Body = z.object({
  pair: z.string().min(2).max(40),
  timeframe: z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]),
});
const TF_GRAN: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

async function fetchCandles(symbol: string, gran: number, count = 250) {
  // Deriv has no REST candle endpoint; use ws via WHATWG WebSocket (works on workerd).
  const url = `wss://ws.derivws.com/websockets/v3?app_id=1089`;
  return await new Promise<any[]>((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error("Deriv timeout"));
    }, 12000);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: "latest",
          granularity: gran,
          style: "candles",
        }),
      );
    });
    ws.addEventListener("message", (ev: any) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(msg.error.message));
          return;
        }
        if (msg.candles) {
          clearTimeout(timeout);
          ws.close();
          resolve(
            msg.candles.map((c: any) => ({
              epoch: c.epoch,
              open: +c.open,
              high: +c.high,
              low: +c.low,
              close: +c.close,
              volume: 1,
            })),
          );
        }
      } catch (e) {
        clearTimeout(timeout);
        ws.close();
        reject(e);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Deriv WS error"));
    });
  });
}

export const Route = createFileRoute("/api/public/v1/analysis")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = await requireApiKey(request);
        if (!auth.ok) return auth.res;
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
        const p = Body.safeParse(body);
        if (!p.success)
          return new Response(JSON.stringify({ error: p.error.message }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        try {
          const candles = await fetchCandles(p.data.pair, TF_GRAN[p.data.timeframe]);
          const r = analyze(p.data.pair, p.data.timeframe, candles);
          return new Response(
            JSON.stringify({
              pair: r.pair,
              timeframe: r.timeframe,
              direction: r.direction,
              score: r.score,
              scorePct: r.scorePct,
              rating: r.rating,
              trade: r.trade,
              confluence: r.confluence,
              divergences: r.divergences.map((d) => ({
                name: d.name,
                detected: !!d.result?.type,
                type: d.result?.type ?? null,
              })),
            }),
            { headers: { "content-type": "application/json", ...CORS } },
          );
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message || "Analysis failed" }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
