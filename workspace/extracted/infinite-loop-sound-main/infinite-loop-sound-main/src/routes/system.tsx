import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { loadKeys, PROVIDER_LABELS, seedBuiltinKeys, type AIKey } from "@/lib/ai/client";
import { Activity, CircleCheck, XCircle, RefreshCw, Cpu, Zap } from "lucide-react";

export const Route = createFileRoute("/system")({ component: SystemPage });

interface KeepLog {
  id: string;
  created_at: string;
  source: string;
  ok: boolean;
  zo_ok: boolean | null;
  zo_status: number | null;
  zo_error: string | null;
  duration_ms: number | null;
  notes: string | null;
}

function SystemPage() {
  const [keys, setKeys] = useState<AIKey[]>([]);
  const refreshKeys = () => setKeys(loadKeys());
  useEffect(() => {
    seedBuiltinKeys();
    refreshKeys();
    const h = () => refreshKeys();
    window.addEventListener("diq:ai-keys", h);
    return () => window.removeEventListener("diq:ai-keys", h);
  }, []);

  const logs = useQuery({
    queryKey: ["keepalive_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("keepalive_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as KeepLog[];
    },
    refetchInterval: 15000,
  });

  const rows = logs.data ?? [];
  const byBrowser = rows.filter((r) => r.source === "browser");
  const byCron = rows.filter((r) => r.source !== "browser");
  const lastSuccess = rows.find((r) => r.ok);
  const lastFailure = rows.find((r) => !r.ok || r.zo_ok === false);
  const lastZoSuccess = rows.find((r) => r.zo_ok === true);
  const avgMs = rows.length
    ? Math.round(rows.reduce((a, r) => a + (r.duration_ms ?? 0), 0) / rows.length)
    : 0;

  // AI provider status — group by provider
  const byProvider = keys.reduce<Record<string, AIKey[]>>((acc, k) => {
    (acc[k.provider] = acc[k.provider] || []).push(k);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Admin</h1>
          <p className="text-sm text-muted-foreground">
            Keepalive logs, zo.computer pings, and AI provider status.
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Last success"
            value={lastSuccess ? rel(lastSuccess.created_at) : "—"}
            icon={<CircleCheck className="w-4 h-4 text-emerald-400" />}
          />
          <Kpi
            label="Last failure"
            value={lastFailure ? rel(lastFailure.created_at) : "—"}
            icon={<XCircle className="w-4 h-4 text-red-400" />}
          />
          <Kpi
            label="Avg latency"
            value={`${avgMs} ms`}
            icon={<Activity className="w-4 h-4 text-primary" />}
          />
          <Kpi
            label="Last zo OK"
            value={lastZoSuccess ? rel(lastZoSuccess.created_at) : "—"}
            icon={<Zap className="w-4 h-4 text-amber-400" />}
          />
        </div>

        {/* AI Provider Status */}
        <section className="rounded-lg border border-border bg-card">
          <header className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              <h2 className="font-semibold">AI Provider Status</h2>
            </div>
            <button
              onClick={refreshKeys}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-accent flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </header>
          {Object.keys(byProvider).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No AI keys configured. Visit{" "}
              <a href="/api-keys" className="text-primary underline">
                API Keys
              </a>
              .
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(byProvider).map(([prov, ks]) => {
                const online = ks.some(
                  (k) =>
                    !k.disabled &&
                    (k.failed === 0 || (k.lastUsed && (!k.lastError || k.used > k.failed))),
                );
                const totalUsed = ks.reduce((a, k) => a + k.used, 0);
                const totalFailed = ks.reduce((a, k) => a + k.failed, 0);
                const lastUsed = Math.max(0, ...ks.map((k) => k.lastUsed ?? 0));
                const lastErr = ks.map((k) => k.lastError).filter(Boolean)[0];
                return (
                  <div key={prov} className="p-4 grid md:grid-cols-5 gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`}
                      />
                      <span className="font-medium">
                        {PROVIDER_LABELS[prov as keyof typeof PROVIDER_LABELS] || prov}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ks.length} key{ks.length > 1 ? "s" : ""} ·{" "}
                      {ks.filter((k) => !k.disabled).length} active
                    </div>
                    <div className="text-xs">
                      Used: <span className="font-mono">{totalUsed}</span> · Failed:{" "}
                      <span className="font-mono text-red-400">{totalFailed}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last used: {lastUsed ? rel(new Date(lastUsed).toISOString()) : "—"}
                    </div>
                    <div className="text-xs text-red-400 truncate" title={lastErr || ""}>
                      {lastErr ? `Err: ${lastErr}` : "OK"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <footer className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            Auto-fallback enabled: signal generator picks lowest-failure key first; on failure, the
            next provider is tried automatically.
          </footer>
        </section>

        {/* Keepalive logs */}
        <section className="rounded-lg border border-border bg-card">
          <header className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Keepalive Logs</h2>
            <div className="text-xs text-muted-foreground">
              browser: {byBrowser.length} · pg_cron: {byCron.length}
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">DB</th>
                  <th className="text-left px-3 py-2">Zo</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Duration</th>
                  <th className="text-left px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      No keepalive activity yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${r.source === "browser" ? "bg-blue-500/10 text-blue-300" : "bg-purple-500/10 text-purple-300"}`}
                      >
                        {r.source}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <CircleCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.zo_ok === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.zo_ok ? (
                        <CircleCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.zo_status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.duration_ms != null ? `${r.duration_ms}ms` : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-xs text-red-400 max-w-[260px] truncate"
                      title={r.zo_error || r.notes || ""}
                    >
                      {r.zo_error || r.notes || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}

function rel(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
