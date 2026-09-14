"use client";

import { useEffect, useState } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, LiquidProgress } from "@/components/presidin/glass";
import { Database, Cloud, Cpu, Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Code2, Copy } from "lucide-react";
import { toast } from "sonner";

interface StatusData {
  status: string;
  timestamp: string;
  services: {
    prisma: { ok: boolean; provider: string };
    supabase: { connected: boolean; url?: string; hasServiceKey: boolean; hasAnonKey: boolean; reachable: boolean };
    cloudflare: { configured: boolean; accountId?: string; r2Bucket?: string; kvNamespaceId?: string; hasToken: boolean };
    mlService: string;
  };
  providers: {
    total: number;
    configured: number;
    list: any[];
  };
}

interface SupabaseStatusData {
  supabase: { connected: boolean; url?: string; reachable: boolean; schemaNeeded: boolean };
  cloudflare: any;
  schemaSQL: string;
}

export function BackendSection() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [supaStatus, setSupaStatus] = useState<SupabaseStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s1, s2] = await Promise.all([
        fetch("/api/status").then(r => r.json()),
        fetch("/api/cloudflare/supabase").then(r => r.json()),
      ]);
      setStatus(s1);
      setSupaStatus(s2);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copySchema = () => {
    if (supaStatus?.schemaSQL) {
      navigator.clipboard.writeText(supaStatus.schemaSQL);
      toast.success("Schema SQL copied — paste into Supabase SQL editor");
    }
  };

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Backend Status"
        subtitle="Supabase · Cloudflare · ML service · AI providers — live health"
        icon={<Database className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={load} disabled={loading} className="text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </ShimmerButton>
        }
      />

      {/* Service status cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Prisma (SQLite)"
          value={status?.services?.prisma?.ok ? "OK" : "Down"}
          delta={status?.services?.prisma?.provider ?? "sqlite"}
          deltaType={status?.services?.prisma?.ok ? "up" : "down"}
          icon={<Database className="h-4 w-4" />}
        />
        <KpiCard
          label="Supabase"
          value={status?.services?.supabase?.reachable ? "Connected" : status?.services?.supabase?.connected ? "Configured" : "Off"}
          delta={status?.services?.supabase?.url ?? "not set"}
          deltaType={status?.services?.supabase?.reachable ? "up" : "neutral"}
          icon={<Database className="h-4 w-4" />}
        />
        <KpiCard
          label="Cloudflare"
          value={status?.services?.cloudflare?.configured ? "Configured" : "Off"}
          delta={status?.services?.cloudflare?.r2Bucket ?? "no bucket"}
          deltaType={status?.services?.cloudflare?.configured ? "up" : "neutral"}
          icon={<Cloud className="h-4 w-4" />}
        />
        <KpiCard
          label="ML Service"
          value="Port 8100"
          delta="FastAPI + NumPy"
          deltaType="up"
          icon={<Cpu className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Supabase panel */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Supabase</h3>
            </div>
            {supaStatus?.supabase?.reachable ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Reachable</span>
            ) : supaStatus?.supabase?.schemaNeeded ? (
              <span className="flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="h-3 w-3" /> Schema needed</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400"><XCircle className="h-3 w-3" /> Not connected</span>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">URL</span>
              <span className="tnum font-mono">{supaStatus?.supabase?.url ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">Service key</span>
              <span>{status?.services?.supabase?.hasServiceKey ? "✓ set" : "✗ missing"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">Anon key</span>
              <span>{status?.services?.supabase?.hasAnonKey ? "✓ set" : "✗ missing"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">Reachable</span>
              <span>{supaStatus?.supabase?.reachable ? "✓ yes" : "✗ no"}</span>
            </div>
          </div>
          {supaStatus?.supabase?.schemaNeeded && (
            <div className="mt-3 rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-amber-300">Schema setup required</div>
                  <div className="mt-1 text-[11px] text-amber-200/80">
                    Connected to Supabase but tables don't exist. Copy the SQL below and run it in the Supabase SQL editor.
                  </div>
                  <button
                    onClick={copySchema}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30"
                  >
                    <Copy className="h-3 w-3" /> Copy schema SQL
                  </button>
                  <button
                    onClick={() => setShowSchema(!showSchema)}
                    className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-secondary/60 px-2 py-1 text-[10px] font-semibold hover:bg-secondary"
                  >
                    <Code2 className="h-3 w-3" /> {showSchema ? "Hide" : "Show"} SQL
                  </button>
                </div>
              </div>
            </div>
          )}
          {showSchema && supaStatus?.schemaSQL && (
            <pre className="mt-2 max-h-64 overflow-y-auto scroll-fancy rounded-md bg-slate-950 p-3 text-[10px] text-emerald-200/90">{supaStatus.schemaSQL}</pre>
          )}
        </GlassPanel>

        {/* Cloudflare panel */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Cloudflare</h3>
            </div>
            {status?.services?.cloudflare?.configured ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Active</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400"><XCircle className="h-3 w-3" /> Not configured</span>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">Account ID</span>
              <span className="tnum font-mono">{status?.services?.cloudflare?.accountId ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">API token</span>
              <span>{status?.services?.cloudflare?.hasToken ? "✓ set" : "✗ missing"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">R2 bucket</span>
              <span className="font-mono">{status?.services?.cloudflare?.r2Bucket ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
              <span className="text-muted-foreground">KV namespace</span>
              <span className="font-mono">{status?.services?.cloudflare?.kvNamespaceId ?? "—"}</span>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-secondary/30 p-3 text-[11px]">
            <div className="font-semibold text-foreground/80">Cloudflare services in PRESIDIN:</div>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>• <strong>R2</strong> — S3-compatible object storage for backtest artifacts, exports, screenshots</li>
              <li>• <strong>KV</strong> — Key-value store for caching signals, provider status, session state</li>
              <li>• <strong>Workers</strong> — Serverless heartbeat / cron for 24/7 signal generation</li>
            </ul>
          </div>
        </GlassPanel>
      </div>

      {/* AI Providers status */}
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">AI Provider Status</h3>
          <span className="text-xs text-muted-foreground">{status?.providers?.configured ?? 0} / {status?.providers?.total ?? 0} configured</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {status?.providers?.list?.map((p: any) => (
            <div key={p.id} className={`rounded-lg p-3 ring-1 ${
              p.configured ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-secondary/30 ring-border/30"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{p.apiStyle} · {p.defaultModel || "custom model"}</div>
                </div>
                {p.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-slate-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Services overview */}
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Architecture Overview</h3>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: "Next.js API routes", role: "BFF + auth + chat proxy + tools endpoints", port: "3000" },
            { name: "FastAPI Python", role: "ML inference + backtest + agent voting", port: "8100" },
            { name: "WebSocket realtime", role: "Live signals + tick broadcast + alerts", port: "3003" },
            { name: "Prisma + SQLite", role: "Server-side persistence (signals, trades, chat, logs)", port: "file" },
            { name: "Supabase Postgres", role: "Optional cloud DB + Auth + Realtime + Storage", port: "443" },
            { name: "Cloudflare R2 + KV", role: "Optional object storage + cache + Workers cron", port: "443" },
            { name: "Deriv WebSocket", role: "Market data feed (zero-config default)", port: "443" },
            { name: "IndexedDB", role: "Client-side ML state (registry, drift, anomaly, audit)", port: "browser" },
            { name: "Tone.js", role: "VINNY audio engine (piano roll, sequencer)", port: "browser" },
          ].map((s) => (
            <div key={s.name} className="rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.name}</span>
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-mono text-violet-300">:{s.port}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.role}</div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
