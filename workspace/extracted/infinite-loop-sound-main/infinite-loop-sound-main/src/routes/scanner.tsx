import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo, useState } from "react";
import { Search, TrendingUp, TrendingDown, RefreshCw, Activity, Filter } from "lucide-react";
import { ALL_ASSETS, type TF } from "@/lib/engine/deriv";
import { useLiveScan } from "@/hooks/use-live-scan";

export const Route = createFileRoute("/scanner")({
  head: () => ({ meta: [{ title: "Scanner — DivergenceIQ" }] }),
  component: ScannerPage,
});

const TFS: TF[] = ["M5", "M15", "M30", "H1", "H4"];
const RATINGS = ["ELITE", "STRONG", "MEDIUM", "WEAK"] as const;

function ScannerPage() {
  const [tf, setTf] = useState<TF>("M15");
  const [minScore, setMinScore] = useState(60);
  const [side, setSide] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");

  // limit universe to keep latency reasonable — 25 most liquid by default
  const universe = useMemo(() => {
    const all = ALL_ASSETS.filter((a) => classFilter === "ALL" || a.class === classFilter);
    return all.slice(0, 30).map((a) => ({ symbol: a.symbol, display: a.display }));
  }, [classFilter]);

  const { rows, loading, scanning, lastFullScanAt, errors } = useLiveScan(universe, tf, 45_000);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.scorePct < minScore) return false;
      if (side !== "ALL" && r.direction !== side) return false;
      return true;
    });
  }, [rows, minScore, side]);

  const stats = useMemo(() => {
    const buy = rows.filter((r) => r.direction === "BUY").length;
    const sell = rows.filter((r) => r.direction === "SELL").length;
    const elite = rows.filter((r) => r.rating === "ELITE").length;
    return [
      { label: "Universe", value: rows.length.toString(), sub: `${universe.length} watched` },
      { label: "Above filter", value: filtered.length.toString(), sub: `≥${minScore}%` },
      { label: "BUY / SELL", value: `${buy} / ${sell}`, sub: "ratio" },
      { label: "Elite", value: elite.toString(), sub: "ELITE rated" },
    ];
  }, [rows, filtered, universe, minScore]);

  const ago = lastFullScanAt ? Math.max(0, Math.round((Date.now() - lastFullScanAt) / 1000)) : null;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Search className="w-6 h-6 text-primary" /> Scanner
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live analyze() across {universe.length} symbols · {tf} · refresh 45s
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
            {loading || scanning ? (
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
            )}
            <span className="text-xs font-mono text-primary">
              {scanning ? "SCANNING" : ago !== null ? `LIVE · ${ago}s ago` : "STARTING…"}
              {errors > 0 && ` · ${errors} err`}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-3 grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Timeframe
            </label>
            <div className="flex gap-1 mt-1">
              {TFS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`flex-1 px-2 py-1 rounded text-[11px] font-mono diq-press ${
                    tf === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Side
            </label>
            <div className="flex gap-1 mt-1">
              {(["ALL", "BUY", "SELL"] as const).map((sx) => (
                <button
                  key={sx}
                  onClick={() => setSide(sx)}
                  className={`flex-1 px-2 py-1 rounded text-[11px] font-mono diq-press ${
                    side === sx
                      ? sx === "BUY"
                        ? "bg-bull text-white"
                        : sx === "SELL"
                          ? "bg-bear text-white"
                          : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {sx}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Min score: <span className="font-mono">{minScore}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full mt-1 accent-primary"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Asset class
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full mt-1 h-7 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="ALL">All</option>
              <option value="forex">Forex</option>
              <option value="metals">Metals</option>
              <option value="crypto">Crypto</option>
              <option value="indices">Indices</option>
              <option value="synthetics">Synthetics</option>
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="glass-card p-3 rounded-lg diq-press">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {s.label}
              </div>
              <div className="text-xl font-bold font-mono mt-1">{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Results table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Symbol</div>
            <div className="col-span-1 text-center">TF</div>
            <div className="col-span-2">Rating</div>
            <div className="col-span-2 text-right">Score</div>
            <div className="col-span-2 text-right">Dir</div>
            <div className="col-span-2 text-right">Last</div>
          </div>
          <div className="divide-y divide-border max-h-[60dvh] overflow-y-auto">
            {loading && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Warming up scanner…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Nothing matches your filters. Lower the minimum score or change the timeframe.
              </div>
            )}
            {filtered.map((r) => (
              <div
                key={r.symbol}
                className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-accent/30 transition diq-press text-sm"
              >
                <div className="col-span-3 font-medium">{r.display}</div>
                <div className="col-span-1 text-center text-[11px] font-mono text-muted-foreground">
                  {r.tf}
                </div>
                <div className="col-span-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.rating === "ELITE"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : r.rating === "STRONG"
                          ? "bg-bull/20 text-bull"
                          : r.rating === "MEDIUM"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.rating}
                  </span>
                </div>
                <div className="col-span-2 text-right font-mono">{r.scorePct.toFixed(0)}%</div>
                <div className="col-span-2 text-right">
                  {r.direction === "BUY" ? (
                    <span className="text-bull flex items-center justify-end gap-1">
                      <TrendingUp className="w-3 h-3" /> BUY
                    </span>
                  ) : r.direction === "SELL" ? (
                    <span className="text-bear flex items-center justify-end gap-1">
                      <TrendingDown className="w-3 h-3" /> SELL
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-2 text-right font-mono text-xs text-muted-foreground">
                  {r.lastClose.toFixed(r.lastClose > 100 ? 2 : 5)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Filter className="w-3 h-3" /> Engine: src/lib/engine/signal.ts · Data: public Deriv WS
        </p>
      </div>
    </AppShell>
  );
}
