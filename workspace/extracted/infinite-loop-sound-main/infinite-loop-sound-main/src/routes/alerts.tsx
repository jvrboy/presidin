import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  Check,
  AlertTriangle,
  AlertCircle,
  RotateCw,
  Search,
  Plus,
  Trash,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Admin Alerts — DivergenceIQ" },
      { name: "description", content: "System alerts and notifications." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showAck, setShowAck] = useState(false);
  const [q, setQ] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [replayMsg, setReplayMsg] = useState<string | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [showRules, setShowRules] = useState(true);
  const [draft, setDraft] = useState({
    name: "",
    metric: "accuracy_score",
    comparator: "gte",
    threshold: 75,
    direction: "",
  });

  const refresh = async () => {
    let q = (supabase.from("admin_alerts") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!showAck) q = q.eq("acknowledged", false);
    const { data } = await q;
    setAlerts(data || []);
  };
  useEffect(() => {
    refresh();
  }, [showAck]);
  const loadRules = async () => {
    const { data } = await (supabase.from("alert_rules") as any)
      .select("*")
      .order("created_at", { ascending: false });
    setRules(data || []);
  };
  useEffect(() => {
    loadRules();
  }, []);

  const addRule = async () => {
    if (!draft.name.trim()) return;
    await (supabase.from("alert_rules") as any).insert({
      ...draft,
      direction: draft.direction || null,
    });
    setDraft({
      name: "",
      metric: "accuracy_score",
      comparator: "gte",
      threshold: 75,
      direction: "",
    });
    loadRules();
  };
  const toggleRule = async (id: string, enabled: boolean) => {
    await (supabase.from("alert_rules") as any).update({ enabled }).eq("id", id);
    loadRules();
  };
  const deleteRule = async (id: string) => {
    await (supabase.from("alert_rules") as any).delete().eq("id", id);
    loadRules();
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return alerts;
    const s = q.toLowerCase();
    return alerts.filter(
      (a) =>
        (a.kind || "").toLowerCase().includes(s) ||
        (a.message || "").toLowerCase().includes(s) ||
        JSON.stringify(a.context || {})
          .toLowerCase()
          .includes(s),
    );
  }, [alerts, q]);

  const replayDLQ = async () => {
    setReplaying(true);
    setReplayMsg(null);
    try {
      const r = await fetch("/api/public/hooks/replay-dlq", { method: "POST" });
      const j = await r.json();
      setReplayMsg(`Replayed ${j.replayed} DLQ rows.`);
    } catch (e: any) {
      setReplayMsg(`Replay failed: ${e.message}`);
    } finally {
      setReplaying(false);
    }
  };

  const ack = async (id: string) => {
    await (supabase.from("admin_alerts") as any).update({ acknowledged: true }).eq("id", id);
    refresh();
  };

  const icon = (sev: string) =>
    sev === "critical" || sev === "error" ? (
      <AlertCircle className="w-4 h-4 text-bear" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-medium" />
    );

  // Evaluate an alert's context against the user-defined rules and explain
  // which thresholds matched (pass) or didn't (fail). This shows a per-signal
  // explanation so admins know which rule fired and why.
  const explainMatches = (ctx: any) => {
    if (!ctx || typeof ctx !== "object") return [];
    return rules
      .filter((r) => r.enabled)
      .map((r) => {
        const raw = ctx[r.metric];
        const v = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(v))
          return { rule: r, value: null, pass: false, reason: "metric missing" };
        const pass =
          r.comparator === "gte"
            ? v >= r.threshold
            : r.comparator === "lte"
              ? v <= r.threshold
              : Math.abs(v - r.threshold) < 1e-9;
        const sign = r.comparator === "gte" ? "≥" : r.comparator === "lte" ? "≤" : "=";
        return { rule: r, value: v, pass, reason: `${v} ${sign} ${r.threshold}` };
      });
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-medium" /> Admin Alerts
          </h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={replayDLQ} disabled={replaying}>
              <RotateCw className={`w-3.5 h-3.5 mr-1 ${replaying ? "animate-spin" : ""}`} /> Replay
              DLQ
            </Button>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showAck}
                onChange={(e) => setShowAck(e.target.checked)}
              />
              Show acknowledged
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search kind, message, or context (e.g. signature, scope, deriv)"
              className="w-full bg-card border border-border rounded pl-7 pr-2 py-1.5 text-xs"
            />
          </div>
          {replayMsg && <div className="text-xs text-muted-foreground">{replayMsg}</div>}
        </div>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              All clear — no active alerts.
            </div>
          ) : (
            filtered.map((a) => {
              const matches = explainMatches(a.context);
              return (
                <div key={a.id} className="p-3 flex items-start gap-3">
                  {icon(a.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{a.kind}</div>
                    <div className="text-xs text-muted-foreground">{a.message}</div>
                    {a.context && Object.keys(a.context).length > 0 && (
                      <pre className="mt-1 text-[10px] font-mono bg-muted/30 p-2 rounded overflow-x-auto">
                        {JSON.stringify(a.context, null, 2)}
                      </pre>
                    )}
                    {matches.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Rule evaluation
                        </div>
                        {matches.map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded ${m.pass ? "bg-bull/20 text-bull" : "bg-muted text-muted-foreground"}`}
                            >
                              {m.pass ? "PASS" : "FAIL"}
                            </span>
                            <span className="font-semibold">{m.rule.name}</span>
                            <span className="text-muted-foreground">{m.rule.metric}</span>
                            <span>{m.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!a.acknowledged && (
                    <Button size="sm" variant="ghost" onClick={() => ack(a.id)}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowRules((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4" /> Alert Rules ({rules.length})
            </span>
            <span className="text-xs text-muted-foreground">{showRules ? "Hide" : "Show"}</span>
          </button>
          {showRules && (
            <div className="border-t border-border p-3 space-y-3">
              <div className="grid md:grid-cols-6 gap-2 items-end">
                <input
                  placeholder="Rule name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="md:col-span-2 bg-input border border-border rounded px-2 py-1.5 text-xs"
                />
                <select
                  value={draft.metric}
                  onChange={(e) => setDraft({ ...draft, metric: e.target.value })}
                  className="bg-input border border-border rounded px-2 py-1.5 text-xs"
                >
                  <option value="accuracy_score">Accuracy score</option>
                  <option value="supply_demand_entry">Supply/Demand entry</option>
                  <option value="order_flow_imbalance">Order flow imbalance</option>
                  <option value="fib_touch">Fibonacci touch</option>
                  <option value="volume_profile_node">Volume profile node</option>
                </select>
                <select
                  value={draft.comparator}
                  onChange={(e) => setDraft({ ...draft, comparator: e.target.value })}
                  className="bg-input border border-border rounded px-2 py-1.5 text-xs"
                >
                  <option value="gte">≥</option>
                  <option value="lte">≤</option>
                  <option value="eq">=</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={draft.threshold}
                  onChange={(e) => setDraft({ ...draft, threshold: +e.target.value })}
                  className="bg-input border border-border rounded px-2 py-1.5 text-xs"
                />
                <Button size="sm" onClick={addRule}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
              <select
                value={draft.direction}
                onChange={(e) => setDraft({ ...draft, direction: e.target.value })}
                className="bg-input border border-border rounded px-2 py-1.5 text-xs"
              >
                <option value="">Any direction</option>
                <option value="BUY">BUY only</option>
                <option value="SELL">SELL only</option>
              </select>
              <div className="divide-y divide-border">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => toggleRule(r.id, e.target.checked)}
                    />
                    <span className="font-semibold flex-1">{r.name}</span>
                    <span className="text-muted-foreground font-mono">
                      {r.metric} {r.comparator === "gte" ? "≥" : r.comparator === "lte" ? "≤" : "="}{" "}
                      {r.threshold}
                    </span>
                    {r.direction && <span className="text-medium font-mono">[{r.direction}]</span>}
                    <button
                      onClick={() => deleteRule(r.id)}
                      className="text-muted-foreground hover:text-bear"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {!rules.length && (
                  <div className="py-4 text-center text-muted-foreground text-xs">
                    No rules yet. Add one above to trigger custom alerts.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
