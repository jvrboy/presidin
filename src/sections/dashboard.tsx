"use client";

import { useEffect, useState } from "react";
import { GlassPanel, KpiCard, LiquidProgress, DirectionBadge, Sparkline, SectionTitle, ConfidenceMeter } from "@/components/presidin/glass";
import { useWatchlistStore, useAccountStore, useAgentConfigStore } from "@/stores/presidin";
import { SYMBOL_MAP, DEFAULT_ACTIVE_SYMBOLS, formatCurrency, formatPercent, formatPrice } from "@/lib/presidin/symbols";
import { marketData } from "@/lib/presidin/market-data";
import { runMasterAgent, type Signal } from "@/lib/presidin/agents";
import { Activity, TrendingUp, TrendingDown, Zap, Target, Brain, Radio, DollarSign } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const EQUITY_HISTORY = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  equity: 10000 + Math.sin(i / 5) * 400 + i * 35 + (Math.random() - 0.5) * 80,
}));

export function DashboardSection() {
  const { symbols, activeSymbol, setActiveSymbol } = useWatchlistStore();
  const { equity, openPnl, balance } = useAccountStore();
  const { getConfig } = useAgentConfigStore();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number }>>({});
  const [history, setHistory] = useState<typeof EQUITY_HISTORY>(EQUITY_HISTORY);

  useEffect(() => {
    marketData.connect();
    const unsubStatus = marketData.onStatus((s) => {
      // Could surface connection status
    });
    const unsubs = DEFAULT_ACTIVE_SYMBOLS.map((sym) =>
      marketData.subscribe(sym, (tick) => {
        setQuotes((q) => ({
          ...q,
          [sym]: { price: tick.quote, change: tick.changePct },
        }));
      })
    );
    return () => {
      unsubStatus();
      unsubs.forEach((u) => u());
    };
  }, []);

  // Generate a signal for active symbol
  useEffect(() => {
    const sym = SYMBOL_MAP[activeSymbol] ?? SYMBOL_MAP["frxEURUSD"];
    const candles = marketData.syntheticHistory(activeSymbol, 900, 200);
    const cfg = getConfig(equity, 1.0);
    const sig = runMasterAgent(sym.display, "15m", candles, cfg);
    setSignal(sig);
  }, [activeSymbol, equity]);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Command Dashboard"
        subtitle="Unified view of equity, signals, agents, and live markets"
        icon={<Activity className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1.5 text-xs ring-1 ring-violet-500/20">
            <span className="pulse-dot" />
            <span className="font-medium">All systems operational</span>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Account Equity"
          value={formatCurrency(equity)}
          delta={`${formatPercent(((equity - 10000) / 10000) * 100)} all-time`}
          deltaType={equity >= 10000 ? "up" : "down"}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiCard
          label="Open P&L"
          value={`${openPnl >= 0 ? "+" : ""}${formatCurrency(openPnl)}`}
          delta={`${formatPercent((openPnl / balance) * 100)} of balance`}
          deltaType={openPnl >= 0 ? "up" : "down"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Active Signal"
          value={signal ? signal.direction : "—"}
          delta={signal ? `${signal.confidence.toFixed(0)}% confidence` : "scanning…"}
          deltaType={signal?.direction === "BUY" ? "up" : signal?.direction === "SELL" ? "down" : "neutral"}
          icon={<Zap className="h-4 w-4" />}
        />
        <KpiCard
          label="Agents Voting"
          value={signal ? signal.votes.length : 0}
          delta={signal ? `${signal.votes.filter((v) => v.direction !== "NEUTRAL").length} directional` : "—"}
          deltaType="neutral"
          icon={<Brain className="h-4 w-4" />}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Equity curve */}
        <GlassPanel className="lg:col-span-2" veil>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Equity Curve (60d)</h3>
              <p className="text-xs text-muted-foreground">Simulated performance trajectory</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="tnum font-semibold text-emerald-400">
                +{(((history[history.length - 1].equity - history[0].equity) / history[0].equity) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
              <XAxis dataKey="t" hide />
              <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
              <Tooltip
                contentStyle={{
                  background: "hsl(240 6% 10% / 0.95)",
                  border: "1px solid hsl(240 5% 30%)",
                  borderRadius: 12,
                  color: "white",
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatCurrency(v), "Equity"]}
                labelFormatter={(l) => `Day ${l}`}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#a78bfa"
                strokeWidth={2}
                fill="url(#equityGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Active signal card */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active Signal</h3>
            <Radio className="h-4 w-4 text-violet-400" />
          </div>
          {signal && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold tracking-tight">
                    {SYMBOL_MAP[activeSymbol]?.display ?? activeSymbol}
                  </div>
                  <div className="text-xs text-muted-foreground">15m timeframe</div>
                </div>
                <DirectionBadge direction={signal.direction} />
              </div>
              <ConfidenceMeter value={signal.confidence} label="Confidence" />
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-secondary/40 p-2">
                  <div className="text-muted-foreground">Entry</div>
                  <div className="tnum font-semibold">{formatPrice(signal.suggestedEntry, 4)}</div>
                </div>
                <div className="rounded-lg bg-rose-500/10 p-2">
                  <div className="text-rose-300">Stop</div>
                  <div className="tnum font-semibold text-rose-200">{formatPrice(signal.suggestedStopLoss, 4)}</div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <div className="text-emerald-300">Target</div>
                  <div className="tnum font-semibold text-emerald-200">{formatPrice(signal.suggestedTakeProfit, 4)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">R:R ratio</span>
                <span className="tnum font-semibold">1:{signal.riskRewardRatio.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Suggested size</span>
                <span className="tnum font-semibold">{signal.positionSize.toFixed(2)} lots</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Consensus</span>
                <span className={`tnum font-semibold ${signal.consensusScore > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {signal.consensusScore > 0 ? "+" : ""}{signal.consensusScore.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Market heatmap */}
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Live Markets</h3>
          <div className="text-xs text-muted-foreground">{symbols.length} symbols tracked</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {DEFAULT_ACTIVE_SYMBOLS.map((sym) => {
            const def = SYMBOL_MAP[sym];
            const q = quotes[sym];
            const change = q?.change ?? 0;
            const up = change >= 0;
            return (
              <button
                key={sym}
                onClick={() => setActiveSymbol(sym)}
                className={`rounded-xl border p-3 text-left transition-all hover:scale-[1.02] ${
                  activeSymbol === sym
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-border/60 bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{def?.display ?? sym}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${up ? "bg-emerald-400" : "bg-rose-400"}`} />
                </div>
                <div className="tnum mt-1 text-sm font-semibold">
                  {q ? formatPrice(q.price, def?.digits ?? 2) : "—"}
                </div>
                <div className={`tnum text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? "+" : ""}{change.toFixed(3)}%
                </div>
              </button>
            );
          })}
        </div>
      </GlassPanel>

      {/* Agent votes preview */}
      {signal && (
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Agent Consensus Preview</h3>
              <p className="text-xs text-muted-foreground">{signal.votes.length} agents voted on {SYMBOL_MAP[activeSymbol]?.display}</p>
            </div>
            <div className="text-xs text-muted-foreground">Open Signals →</div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {signal.votes.slice(0, 9).map((vote) => (
              <div key={vote.agentId} className="rounded-lg bg-secondary/30 p-2.5 ring-1 ring-border/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{vote.agentName}</span>
                  <DirectionBadge direction={vote.direction} className="!px-1.5 !py-0 !text-[10px]" />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <LiquidProgress value={vote.confidence} className="h-1 flex-1" />
                  <span className="tnum text-[10px] text-muted-foreground">{vote.confidence.toFixed(0)}%</span>
                </div>
                <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{vote.reasoning}</div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
