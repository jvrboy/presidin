"use client";

import { useEffect, useState, useCallback } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, LiquidProgress } from "@/components/presidin/glass";
import { History, RefreshCw, Trash2, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/presidin/symbols";
import { toast } from "sonner";

interface BacktestEntry {
  id: string;
  symbol: string;
  timeframe: string;
  config: any;
  metrics: {
    totalReturnPct?: number;
    winRate?: number;
    profitFactor?: number;
    sharpe?: number;
    maxDrawdownPct?: number;
    totalTrades?: number;
    expectancy?: number;
    [k: string]: any;
  };
  trades_count: number;
  created_at: string;
}

export function BacktestsSection() {
  const [backtests, setBacktests] = useState<BacktestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BacktestEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backtests?limit=50");
      const data = await res.json();
      setBacktests(data.backtests ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    // Note: DELETE endpoint would need to be added; for now just remove locally
    setBacktests((bts) => bts.filter((b) => b.id !== id));
    if (selected?.id === id) setSelected(null);
    toast.success("Backtest removed");
  };

  // Aggregate stats
  const totalBacktests = backtests.length;
  const avgReturn = totalBacktests > 0
    ? backtests.reduce((a, b) => a + (b.metrics.totalReturnPct ?? 0), 0) / totalBacktests
    : 0;
  const avgSharpe = totalBacktests > 0
    ? backtests.reduce((a, b) => a + (b.metrics.sharpe ?? 0), 0) / totalBacktests
    : 0;
  const bestReturn = totalBacktests > 0
    ? Math.max(...backtests.map((b) => b.metrics.totalReturnPct ?? -Infinity))
    : 0;

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Backtest History"
        subtitle="Saved backtest results — compare strategies over time"
        icon={<History className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={load} disabled={loading} className="text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </ShimmerButton>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Saved Backtests" value={totalBacktests} delta="total runs" deltaType="neutral" icon={<History className="h-4 w-4" />} />
        <KpiCard label="Avg Return" value={formatPercent(avgReturn)} delta="across all runs" deltaType={avgReturn >= 0 ? "up" : "down"} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Avg Sharpe" value={avgSharpe.toFixed(2)} delta="risk-adjusted" deltaType={avgSharpe > 1 ? "up" : "neutral"} icon={<BarChart3 className="h-4 w-4" />} />
        <KpiCard label="Best Return" value={formatPercent(bestReturn)} delta="single run" deltaType={bestReturn >= 0 ? "up" : "down"} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Backtest list */}
        <GlassPanel className="lg:col-span-2" veil>
          <h3 className="mb-3 text-sm font-semibold">All Backtests</h3>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto scroll-fancy">
            {backtests.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No saved backtests yet. Run a backtest in the Quant Lab section —
                results will automatically save here when Supabase is connected.
              </div>
            ) : backtests.map((bt) => {
              const ret = bt.metrics.totalReturnPct ?? 0;
              const isSel = selected?.id === bt.id;
              return (
                <button
                  key={bt.id}
                  onClick={() => setSelected(isSel ? null : bt)}
                  className={`grid grid-cols-12 items-center gap-2 rounded-lg p-3 text-xs text-left transition w-full ${
                    isSel ? "bg-violet-500/10 ring-1 ring-violet-500/30" : "bg-secondary/30 hover:bg-secondary/50"
                  }`}
                >
                  <div className="col-span-3">
                    <div className="font-semibold">{bt.symbol}</div>
                    <div className="text-[10px] text-muted-foreground">{bt.timeframe}</div>
                  </div>
                  <div className="col-span-3 tnum text-muted-foreground">
                    {new Date(bt.created_at).toLocaleString()}
                  </div>
                  <div className={`col-span-2 tnum font-semibold ${ret >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatPercent(ret)}
                  </div>
                  <div className="col-span-2 tnum text-muted-foreground">
                    Sharpe {(bt.metrics.sharpe ?? 0).toFixed(2)}
                  </div>
                  <div className="col-span-2 tnum text-muted-foreground">
                    {bt.trades_count} trades
                  </div>
                </button>
              );
            })}
          </div>
        </GlassPanel>

        {/* Selected backtest detail */}
        <GlassPanel veil>
          <h3 className="mb-3 text-sm font-semibold">Detail</h3>
          {selected ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-violet-500/10 p-3 ring-1 ring-violet-500/20">
                <div className="text-xs text-muted-foreground">Symbol</div>
                <div className="text-base font-bold">{selected.symbol} · {selected.timeframe}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</div>
              </div>
              {[
                ["Total return", `${(selected.metrics.totalReturnPct ?? 0).toFixed(2)}%`],
                ["Win rate", `${(selected.metrics.winRate ?? 0).toFixed(1)}%`],
                ["Profit factor", (selected.metrics.profitFactor ?? 0).toFixed(2)],
                ["Sharpe", (selected.metrics.sharpe ?? 0).toFixed(2)],
                ["Max drawdown", `${(selected.metrics.maxDrawdownPct ?? 0).toFixed(2)}%`],
                ["Total trades", String(selected.trades_count)],
                ["Expectancy", formatCurrency(selected.metrics.expectancy ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-md bg-secondary/40 p-2 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tnum font-semibold">{v}</span>
                </div>
              ))}
              <button
                onClick={() => remove(selected.id)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-rose-500/10 p-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 className="h-3 w-3" /> Delete backtest
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Select a backtest to view details.
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
