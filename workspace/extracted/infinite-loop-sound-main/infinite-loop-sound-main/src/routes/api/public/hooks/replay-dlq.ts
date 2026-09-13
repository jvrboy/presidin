// Admin "Replay failed webhooks / DLQ trades" — idempotency-safe.
// Iterates bot_trades_dlq, re-runs the reconcile fetch, and marks resolved
// rows. Dedupe is enforced by skipping rows already resolved and by the
// fact that bot_trades.status='won|lost|expired' is terminal.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function fetchContract(token: string, contractId: string): Promise<any> {
  const appId = process.env.DERIV_APP_ID || "1089";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error("timeout"));
    }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      if (msg.error) {
        clearTimeout(t);
        ws.close();
        return reject(new Error(msg.error.message));
      }
      if (msg.msg_type === "authorize") {
        ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: Number(contractId) }));
      } else if (msg.msg_type === "proposal_open_contract") {
        clearTimeout(t);
        ws.close();
        resolve(msg.proposal_open_contract);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("ws error"));
    };
  });
}

export const Route = createFileRoute("/api/public/hooks/replay-dlq")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async () => {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const token = process.env.DERIV_API_TOKEN || "";
        const { data: dlq } = await sb
          .from("bot_trades_dlq")
          .select("*")
          .eq("resolved", false)
          .limit(100);
        const out: any[] = [];
        for (const row of dlq || []) {
          try {
            // Idempotency: if the trade is already terminal, just resolve DLQ row.
            const { data: trade } = await sb
              .from("bot_trades")
              .select("status,profit,closed_at")
              .eq("id", row.trade_id)
              .maybeSingle();
            if (trade && ["won", "lost", "expired"].includes(trade.status)) {
              await sb
                .from("bot_trades_dlq")
                .update({ resolved: true, updated_at: new Date().toISOString() })
                .eq("id", row.id);
              out.push({ id: row.id, deduped: true });
              continue;
            }
            if (!token || !row.contract_id) {
              out.push({ id: row.id, skipped: "no-token-or-contract" });
              continue;
            }
            const c = await fetchContract(token, row.contract_id);
            if (!c?.is_settled) {
              out.push({ id: row.id, still_pending: true });
              continue;
            }
            const profit = Number(c.profit ?? 0);
            const status = profit > 0 ? "won" : profit < 0 ? "lost" : "expired";
            await sb
              .from("bot_trades")
              .update({
                status,
                profit,
                payout: Number(c.payout ?? 0),
                closed_at: new Date().toISOString(),
              })
              .eq("id", row.trade_id);
            await sb
              .from("bot_trades_dlq")
              .update({ resolved: true, updated_at: new Date().toISOString() })
              .eq("id", row.id);
            out.push({ id: row.id, status, profit });
          } catch (e: any) {
            const retry = (row.retry_count ?? 0) + 1;
            const backoff = Math.min(60_000 * 2 ** retry, 6 * 60 * 60 * 1000);
            await sb
              .from("bot_trades_dlq")
              .update({
                retry_count: retry,
                last_error: e.message,
                next_retry_at: new Date(Date.now() + backoff).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            out.push({ id: row.id, error: e.message });
          }
        }
        return new Response(JSON.stringify({ replayed: out.length, results: out }), {
          headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
