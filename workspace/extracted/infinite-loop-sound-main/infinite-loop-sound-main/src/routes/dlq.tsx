import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Inbox, RotateCw, CircleCheck, AlertOctagon, Clock, Download } from "lucide-react";

export const Route = createFileRoute("/dlq")({
  head: () => ({
    meta: [
      { title: "DLQ Admin — DivergenceIQ" },
      {
        name: "description",
        content: "Replay failed reconciliations, review dedupe decisions and detailed logs.",
      },
    ],
  }),
  component: DLQPage,
});

interface DLQRow {
  id: string;
  trade_id: string;
  contract_id: string | null;
  retry_count: number;
  last_error: string | null;
  resolved: boolean;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
}
interface ReplayResult {
  id: string;
  deduped?: boolean;
  skipped?: string;
  still_pending?: boolean;
  status?: string;
  profit?: number;
  error?: string;
}

function DLQPage() {
  const [rows, setRows] = useState<DLQRow[]>([]);
  const [trades, setTrades] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [log, setLog] = useState<{ at: string; results: ReplayResult[] }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("diq.dlq.log") || "[]");
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<{ pending: number; resolved: number; ts: string } | null>(
    null,
  );

  const refresh = async () => {
    let q = (supabase.from("bot_trades_dlq") as any)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!showResolved) q = q.eq("resolved", false);
    const { data } = await q;
    setRows(data || []);
    const ids = (data || []).map((r: DLQRow) => r.trade_id).filter(Boolean);
    if (ids.length) {
      const { data: t } = await (supabase.from("bot_trades") as any).select("*").in("id", ids);
      const map: Record<string, any> = {};
      (t || []).forEach((row: any) => (map[row.id] = row));
      setTrades(map);
    }
  };

  useEffect(() => {
    refresh();
  }, [showResolved]);

  // Poll the server-driven status endpoint every 5s with a stable idempotency key.
  useEffect(() => {
    const idem =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/public/hooks/replay-status", {
          headers: { "X-Idempotency-Key": idem },
        });
        const j = await r.json();
        if (alive) setStatus({ pending: j.pending, resolved: j.resolved, ts: j.ts });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const replay = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/public/hooks/replay-dlq", { method: "POST" });
      const j = await r.json();
      const entry = { at: new Date().toISOString(), results: j.results || [] };
      const next = [entry, ...log].slice(0, 50);
      setLog(next);
      localStorage.setItem("diq.dlq.log", JSON.stringify(next));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const download = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportJSON = () =>
    download(`dlq-runs-${Date.now()}.json`, "application/json", JSON.stringify(log, null, 2));
  const exportCSV = () => {
    const lines = ["run_at,dlq_id,status,profit,error"];
    for (const run of log)
      for (const r of run.results) {
        const status = r.deduped
          ? "deduped"
          : r.skipped
            ? `skipped:${r.skipped}`
            : r.still_pending
              ? "pending"
              : r.status || (r.error ? "error" : "");
        lines.push(
          [run.at, r.id, status, r.profit ?? "", (r.error || "").replace(/[",\n]/g, " ")]
            .map((v) => `"${v}"`)
            .join(","),
        );
      }
    download(`dlq-runs-${Date.now()}.csv`, "text/csv", lines.join("\n"));
  };

  const summarize = (r: ReplayResult) => {
    if (r.deduped) return { tag: "DEDUPED", cls: "text-muted-foreground", icon: CircleCheck };
    if (r.skipped) return { tag: `SKIPPED (${r.skipped})`, cls: "text-medium", icon: Clock };
    if (r.still_pending) return { tag: "PENDING", cls: "text-medium", icon: Clock };
    if (r.error) return { tag: "ERROR", cls: "text-bear", icon: AlertOctagon };
    if (r.status)
      return {
        tag: r.status.toUpperCase(),
        cls:
          r.status === "won"
            ? "text-bull"
            : r.status === "lost"
              ? "text-bear"
              : "text-muted-foreground",
        icon: CircleCheck,
      };
    return { tag: "—", cls: "text-muted-foreground", icon: Clock };
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="w-6 h-6 text-medium" /> DLQ Admin
          </h1>
          <div className="flex items-center gap-2">
            {status && (
              <span className="text-[11px] font-mono text-muted-foreground">
                pending {status.pending} · resolved {status.resolved}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={!log.length}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportJSON} disabled={!log.length}>
              <Download className="w-3.5 h-3.5 mr-1" /> JSON
            </Button>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              Show resolved
            </label>
            <Button size="sm" onClick={replay} disabled={busy}>
              <RotateCw className={`w-3.5 h-3.5 mr-1 ${busy ? "animate-spin" : ""}`} /> Run Replay
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            Dead-Letter Queue · {rows.length} rows
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/30 sticky top-0 text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Updated</th>
                  <th>Trade</th>
                  <th>Contract</th>
                  <th>Retries</th>
                  <th>Next retry</th>
                  <th>Status</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tr = trades[r.trade_id];
                  return (
                    <tr key={r.id} className="border-t border-border/40 align-top">
                      <td className="px-2 py-1.5">{new Date(r.updated_at).toLocaleString()}</td>
                      <td>
                        <a href="/pnl" className="text-primary hover:underline">
                          {r.trade_id.slice(0, 8)}
                        </a>
                        {tr && (
                          <div className="text-[10px] text-muted-foreground">
                            {tr.pair} · {tr.direction} · {tr.status}
                          </div>
                        )}
                      </td>
                      <td>{r.contract_id ?? "—"}</td>
                      <td>{r.retry_count}</td>
                      <td>{new Date(r.next_retry_at).toLocaleString()}</td>
                      <td className={r.resolved ? "text-bull" : "text-medium"}>
                        {r.resolved ? "RESOLVED" : "PENDING"}
                      </td>
                      <td className="text-bear max-w-[280px] truncate" title={r.last_error || ""}>
                        {r.last_error || "—"}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      Queue empty. Nothing to replay.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            Replay Job History · last {log.length} runs
          </div>
          <div className="max-h-[420px] overflow-auto divide-y divide-border">
            {log.map((run, i) => (
              <div key={i} className="p-3 space-y-1">
                <div className="text-xs text-muted-foreground">
                  {new Date(run.at).toLocaleString()} · {run.results.length} item(s)
                </div>
                <div className="grid gap-1">
                  {run.results.map((r, j) => {
                    const s = summarize(r);
                    return (
                      <div key={j} className="flex items-center gap-2 text-[11px] font-mono">
                        <s.icon className={`w-3 h-3 ${s.cls}`} />
                        <span className={`w-24 ${s.cls}`}>{s.tag}</span>
                        <span className="text-muted-foreground">DLQ {r.id.slice(0, 8)}</span>
                        {r.profit !== undefined && (
                          <span className={r.profit >= 0 ? "text-bull" : "text-bear"}>
                            {r.profit.toFixed(2)}
                          </span>
                        )}
                        {r.error && <span className="text-bear truncate flex-1">{r.error}</span>}
                      </div>
                    );
                  })}
                  {!run.results.length && (
                    <div className="text-[11px] text-muted-foreground">No DLQ rows processed.</div>
                  )}
                </div>
              </div>
            ))}
            {!log.length && (
              <div className="px-3 py-10 text-center text-muted-foreground text-sm">
                No replay runs yet. Click "Run Replay" above.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
