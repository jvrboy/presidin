// Trade reconciliation cron: walks open bot_trades, asks Deriv for the final
// contract outcome, updates the row (status=won|lost|expired, profit, payout,
// closed_at), and upserts bot_pnl_daily for the day.
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

export const Route = createFileRoute("/api/public/hooks/reconcile-trades")({
  server: {
    handlers: {
      POST: async () => {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Find live/open trades older than their typical settle window
        const { data: open } = await sb
          .from("bot_trades")
          .select("*")
          .in("status", ["open", "pending"])
          .not("contract_id", "is", null)
          .limit(50);

        const results: any[] = [];
        const tokenFallback = process.env.DERIV_API_TOKEN || "";

        for (const t of open || []) {
          try {
            // We don't store token per trade; use env fallback. Bot users with
            // multiple accounts can configure DERIV_API_TOKEN to the trading
            // account that placed the contract.
            if (!tokenFallback) {
              results.push({ id: t.id, skipped: "no-token" });
              continue;
            }
            const c = await fetchContract(tokenFallback, String(t.contract_id));
            if (!c?.is_settled) {
              results.push({ id: t.id, pending: true });
              continue;
            }
            const profit = Number(c.profit ?? 0);
            const payout = Number(c.payout ?? 0);
            const status = profit > 0 ? "won" : profit < 0 ? "lost" : "expired";
            await sb
              .from("bot_trades")
              .update({
                status,
                profit,
                payout,
                closed_at: new Date().toISOString(),
              })
              .eq("id", t.id);
            results.push({ id: t.id, status, profit });

            // Upsert daily PnL
            const day = new Date().toISOString().slice(0, 10);
            const { data: existing } = await sb
              .from("bot_pnl_daily")
              .select("*")
              .eq("day", day)
              .maybeSingle();
            if (existing) {
              await sb
                .from("bot_pnl_daily")
                .update({
                  trades: (existing.trades ?? 0) + 1,
                  wins: (existing.wins ?? 0) + (profit > 0 ? 1 : 0),
                  losses: (existing.losses ?? 0) + (profit <= 0 ? 1 : 0),
                  gross: Number(existing.gross ?? 0) + profit,
                  updated_at: new Date().toISOString(),
                })
                .eq("day", day);
            } else {
              await sb.from("bot_pnl_daily").insert({
                day,
                trades: 1,
                wins: profit > 0 ? 1 : 0,
                losses: profit <= 0 ? 1 : 0,
                gross: profit,
              });
            }
          } catch (e: any) {
            results.push({ id: t.id, error: e.message });
            // Push to dead-letter queue with exponential backoff
            const retry = (t.retry_count ?? 0) + 1;
            const backoffMs = Math.min(60_000 * 2 ** retry, 6 * 60 * 60 * 1000); // cap 6h
            const nextRetry = new Date(Date.now() + backoffMs).toISOString();
            await sb
              .from("bot_trades")
              .update({
                retry_count: retry,
                last_error_at: new Date().toISOString(),
                error: e.message,
              })
              .eq("id", t.id);
            await sb.from("bot_trades_dlq").insert({
              trade_id: t.id,
              contract_id: String(t.contract_id ?? ""),
              retry_count: retry,
              last_error: e.message,
              next_retry_at: nextRetry,
            });
          }
        }

        return Response.json({ checked: open?.length ?? 0, results });
      },
    },
  },
});
