import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { analyze } from "@/lib/engine/signal";
import {
  DERIV_WS_URL,
  TF_TO_GRAN,
  FOREX_PAIRS,
  METALS,
  CRYPTO,
  SYNTHETICS,
  INDICES,
  type TF,
} from "@/lib/engine/deriv";
import type { Candle } from "@/lib/engine/indicators";

// 24/7 server-side scanner. Pings Deriv's public WS (no token required),
// runs the analyze() pipeline, and persists qualifying signals.
// Designed to be called every 1-5 min by Zo Computer or any external cron.
//
// Configurable via query params:
//   ?tfs=M1,M5,M15        timeframes to scan (default: M5,M15,H1 — scalping)
//   ?classes=forex,crypto,metals,synthetics,indices
//   ?min_score=60         minimum confluence score
//   ?limit=20             max instruments per class
//   ?dedupe_minutes=30    skip if same pair|tf|direction emitted within window

const DEFAULT_TFS: TF[] = ["M5", "M15", "H1"];
const DEFAULT_CLASSES = ["forex", "metals", "crypto"];
const DEFAULT_MIN_SCORE = 60;
const DEFAULT_LIMIT = 12;
const DEFAULT_DEDUPE_MIN = 30;
const VALID_TFS: TF[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

async function openDerivWS(): Promise<WebSocket> {
  // Try Cloudflare workerd's fetch(upgrade) path first; fall back to a plain
  // WebSocket (Node 22+ dev / edge runtimes with global WebSocket).
  try {
    const resp = await fetch(DERIV_WS_URL.replace(/^wss?:/, "https:"), {
      headers: { Upgrade: "websocket" },
    } as any);
    // workers runtime exposes resp.webSocket (not in the standard fetch types)
    const ws: WebSocket | undefined = (resp as any).webSocket;
    if (ws) {
      // @ts-expect-error - accept() is a Cloudflare Workers WebSocket extension
      ws.accept();
      return ws;
    }
  } catch {
    /* fall through to global WebSocket */
  }
  const NodeWS: any = (globalThis as any).WebSocket;
  if (!NodeWS) throw new Error("WebSocket not available in this runtime");
  const sock = new NodeWS(DERIV_WS_URL);
  await new Promise<void>((res, rej) => {
    sock.onopen = () => res();
    sock.onerror = (e: any) => rej(new Error("ws open failed"));
  });
  return sock;
}

async function fetchCandles(ws: WebSocket, symbol: string, tf: TF, count = 220): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const reqId = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error("timeout")), 12000);
    const onMsg = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(ev.data as string);
        if (m.req_id !== reqId) return;
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg as any);
        if (m.error) return reject(new Error(m.error.message));
        const candles = (m.candles || []).map((c: any) => ({
          epoch: c.epoch,
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
          volume: 1,
        }));
        resolve(candles);
      } catch (e) {
        reject(e as Error);
      }
    };
    ws.addEventListener("message", onMsg as any);
    ws.send(
      JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: "latest",
        granularity: TF_TO_GRAN[tf],
        style: "candles",
        req_id: reqId,
      }),
    );
  });
}

export const Route = createFileRoute("/api/public/hooks/scan")({
  server: {
    handlers: {
      GET: async ({ request }) => runScan(request),
      POST: async ({ request }) => runScan(request),
    },
  },
});

async function runScan(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const qp = url.searchParams;
  const tfs: TF[] =
    (qp
      .get("tfs")
      ?.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((t) => VALID_TFS.includes(t as TF)) as TF[]) || DEFAULT_TFS;
  const classes =
    qp
      .get("classes")
      ?.split(",")
      .map((s) => s.trim().toLowerCase()) || DEFAULT_CLASSES;
  const minScore = Number(qp.get("min_score") ?? DEFAULT_MIN_SCORE);
  const limit = Math.max(1, Math.min(50, Number(qp.get("limit") ?? DEFAULT_LIMIT)));
  const dedupeMin = Math.max(
    1,
    Math.min(720, Number(qp.get("dedupe_minutes") ?? DEFAULT_DEDUPE_MIN)),
  );

  // Prefer service role; fall back to publishable/anon key — the create_auto_signal
  // RPC is SECURITY DEFINER so anon can insert signals safely.
  // VITE_* values are inlined at build time so they work in the Worker even when
  // process.env secrets aren't configured.
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    (import.meta as any).env?.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) {
    return Response.json({ ok: false, error: "backend env not configured" }, { status: 200 });
  }
  const sb = createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Build universe from selected classes.
  const pools: Record<string, Array<{ symbol: string }>> = {
    forex: FOREX_PAIRS,
    metals: METALS,
    crypto: CRYPTO,
    synthetics: SYNTHETICS,
    indices: INDICES,
  };
  const universe: Array<{ symbol: string; cls: string }> = [];
  for (const c of classes) {
    const pool = pools[c];
    if (!pool) continue;
    for (const p of pool.slice(0, limit)) universe.push({ symbol: p.symbol, cls: c });
  }

  let ws: WebSocket;
  try {
    ws = await openDerivWS();
  } catch (e: any) {
    return Response.json(
      { ok: false, error: "deriv ws: " + (e?.message || "fail") },
      { status: 200 },
    );
  }

  const hits: any[] = [];
  let scanned = 0;
  let saved = 0;

  // Recent-key dedupe via DB lookup (configurable window).
  const cutoff = new Date(Date.now() - dedupeMin * 60_000).toISOString();
  const { data: recent } = await sb
    .from("signals")
    .select("pair,timeframe,direction,created_at,status")
    .gte("created_at", cutoff);
  const seen = new Set<string>(
    (recent || [])
      .filter((r: any) => r.status === "active" || r.status === "pending" || !r.status)
      .map((r: any) => `${r.pair}|${r.timeframe}|${r.direction}`),
  );

  // Same-day expiry timestamp for scalping signals.
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);
  const expiresAt = endOfDay.toISOString();

  for (const u of universe) {
    for (const tf of tfs) {
      scanned++;
      try {
        const candles = await fetchCandles(ws, u.symbol, tf);
        if (candles.length < 80) continue;
        const a = analyze(u.symbol, tf, candles);
        if (!a.direction || a.scorePct < minScore || !a.trade) continue;
        const key = `${u.symbol}|${tf}|${a.direction}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const payload = {
          pair: u.symbol,
          timeframe: tf,
          direction: a.direction,
          entry: a.trade.entry,
          sl: a.trade.sl,
          tp1: a.trade.tp1,
          tp2: a.trade.tp2,
          tp3: a.trade.tp3,
          score: a.scorePct,
          rating: a.rating,
          confluence: a.confluence,
          source: "auto_scan",
          status: "active",
          expires_at: expiresAt,
        };
        // Use RPC so anon key works (SECURITY DEFINER) and dedupe is enforced server-side too.
        const { data: newId, error } = await sb.rpc("create_auto_signal" as any, {
          p_pair: payload.pair,
          p_timeframe: payload.timeframe,
          p_direction: payload.direction,
          p_entry: payload.entry,
          p_sl: payload.sl,
          p_tp1: payload.tp1,
          p_tp2: payload.tp2,
          p_tp3: payload.tp3,
          p_score: payload.score,
          p_rating: payload.rating,
          p_confluence: payload.confluence as any,
          p_dedupe_minutes: dedupeMin,
        });
        if (!error && newId) {
          saved++;
          hits.push(payload);
        }
      } catch {
        /* skip per-pair */
      }
    }
  }

  try {
    ws.close();
  } catch {
    /* ignore */
  }

  // Best-effort expire stale signals on every scan.
  let expired = 0;
  try {
    const { data } = await sb.rpc("expire_stale_signals" as any);
    expired = (data as number) ?? 0;
  } catch {
    /* ignore */
  }

  return Response.json({
    ok: true,
    scanned,
    saved,
    hits: hits.length,
    expired,
    config: { tfs, classes, min_score: minScore, limit, dedupe_minutes: dedupeMin },
    universe_size: universe.length,
    duration_ms: Date.now() - startedAt,
    at: new Date().toISOString(),
  });
}
