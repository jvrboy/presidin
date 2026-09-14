"use client";

import { useEffect, useState } from "react";
import { GlassPanel, KpiCard, LiquidProgress, DirectionBadge, Sparkline, SectionTitle, ConfidenceMeter, LiquidOrb, PulseDot, ShimmerButton } from "@/components/presidin/glass";
import { useWatchlistStore, useAccountStore, useAgentConfigStore, useEngineConfigStore } from "@/stores/presidin";
import { SYMBOL_MAP, DEFAULT_ACTIVE_SYMBOLS, formatCurrency, formatPercent, formatPrice } from "@/lib/presidin/symbols";
import { marketData } from "@/lib/presidin/market-data";
import { runMasterAgent, type Signal } from "@/lib/presidin/agents";
import { useSignalEngine } from "@/hooks/use-signal-engine";
import { LearningInsightsPanel } from "@/components/presidin/learning-insights";
import { AdvancedAnalyticsPanel } from "@/components/presidin/advanced-analytics";
import { ConfluencePanel } from "@/components/presidin/confluence-panel";
import { Activity, TrendingUp, TrendingDown, Zap, Brain, Radio, DollarSign, Cpu, Sparkles, ArrowUpRight, ArrowDownRight, RefreshCw, Pause, Play, BrainCircuit } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

const EQUITY_HISTORY = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  equity: 10000 + Math.sin(i / 5) * 400 + i * 35 + (Math.random() - 0.5) * 80,
}));

export function DashboardSection() {
  const { symbols, activeSymbol, setActiveSymbol } = useWatchlistStore();
  const { equity, openPnl, balance } = useAccountStore();
  const { getConfig } = useAgentConfigStore();
  const engineConfig = useEngineConfigStore();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number }>>({});
  const [history] = useState(EQUITY_HISTORY);

  const engine = useSignalEngine();

  useEffect(() => {
    marketData.connect();
    const unsubStatus = marketData.onStatus(() => {});
    const unsubs = DEFAULT_ACTIVE_SYMBOLS.map((sym) =>
      marketData.subscribe(sym, (tick) => {
        setQuotes((q) => ({ ...q, [sym]: { price: tick.quote, change: tick.changePct } }));
      })
    );
    return () => { unsubStatus(); unsubs.forEach((u) => u()); };
  }, []);

  useEffect(() => {
    const sym = SYMBOL_MAP[activeSymbol] ?? SYMBOL_MAP["frxEURUSD"];
    const candles = marketData.syntheticHistory(activeSymbol, 900, 200);
    const cfg = getConfig(equity, 1.0);
    const sig = runMasterAgent(sym.display, "15m", candles, cfg);
    setSignal(sig);
  }, [activeSymbol, equity, getConfig]);

  const accuracyData = engine.stats ? [{ name: "accuracy", value: engine.stats.accuracy, fill: "#a78bfa" }] : [];

  return (
    <div className="section-enter space-y-6">
      {/* Hero header with engine status */}
      <div className="relative overflow-hidden rounded-2xl">
        <GlassPanel className="!p-6 md:!p-8" veil>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-violet-400" />
                PRESIDIN · Unified Trading Intelligence
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                  Command Dashboard
                </span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Auto-generating signals · Learning from outcomes · Growing accuracy
              </p>
            </div>
            <div className="flex items-center gap-3">
              <EngineStatusBadge running={engine.isRunning} enabled={engineConfig.enabled} />
              <ShimmerButton
                onClick={() => engineConfig.toggle()}
                className="!text-xs"
              >
                {engineConfig.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {engineConfig.enabled ? "Pause Engine" : "Start Engine"}
              </ShimmerButton>
              <button
                onClick={() => engine.runCycleNow()}
                disabled={engine.isRunning}
                className="rounded-full bg-secondary/50 p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                title="Run signal cycle now"
              >
                <RefreshCw className={`h-4 w-4 ${engine.isRunning ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </GlassPanel>
      </div>

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
          label="Signals Generated"
          value={engine.stats?.totalSignals ?? 0}
          delta={engine.lastRun ? `${Math.floor((Date.now() - engine.lastRun) / 1000)}s ago` : "starting…"}
          deltaType="neutral"
          icon={<Radio className="h-4 w-4" />}
        />
        <KpiCard
          label="AI Accuracy"
          value={engine.stats ? `${engine.stats.accuracy.toFixed(1)}%` : "—"}
          delta={engine.stats ? `${engine.stats.correct}/${engine.stats.evaluated} correct` : "no data yet"}
          deltaType={engine.stats && engine.stats.accuracy > 55 ? "up" : "neutral"}
          icon={<BrainCircuit className="h-4 w-4" />}
        />
      </div>

      {/* Main grid: equity curve + AI performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassPanel className="lg:col-span-2" veil>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Equity Curve (60d)</h3>
              <p className="text-xs text-muted-foreground">Performance trajectory</p>
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
                contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, color: "white", fontSize: 12 }}
                formatter={(v: number) => [formatCurrency(v), "Equity"]}
                labelFormatter={(l) => `Day ${l}`}
              />
              <Area type="monotone" dataKey="equity" stroke="#a78bfa" strokeWidth={2} fill="url(#equityGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* AI Performance gauge */}
        <GlassPanel veil>
          <h3 className="mb-3 text-sm font-semibold">AI Performance</h3>
          {engine.stats && engine.stats.evaluated > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <RadialBarChart innerRadius="65%" outerRadius="100%" data={accuracyData} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "hsl(240 5% 20% / 0.5)" }} dataKey="value" cornerRadius={20} fill="#a78bfa" />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="-mt-24 text-center">
                <div className="tnum text-3xl font-bold text-violet-200">{engine.stats.accuracy.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">accuracy</div>
              </div>
              <div className="mt-16 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current streak</span>
                  <span className="tnum font-semibold">{engine.stats.currentStreak} 🔥</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Best streak</span>
                  <span className="tnum font-semibold">{engine.stats.bestStreak}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last retrained</span>
                  <span className="tnum font-semibold">{engine.stats.lastRetrainedAt ? formatTimeAgo(engine.stats.lastRetrainedAt) : "—"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <BrainCircuit className="h-10 w-10 text-violet-400/50" />
              <p className="mt-3 text-sm text-muted-foreground">AI is gathering data…</p>
              <p className="mt-1 text-xs text-muted-foreground">Signals will be evaluated after 2h, then accuracy appears here.</p>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Live signal + market grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active Signal</h3>
            <Radio className="h-4 w-4 text-violet-400" />
          </div>
          {signal && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold tracking-tight">{SYMBOL_MAP[activeSymbol]?.display ?? activeSymbol}</div>
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
                <span className="text-muted-foreground">Consensus</span>
                <span className={`tnum font-semibold ${signal.consensusScore > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {signal.consensusScore > 0 ? "+" : ""}{signal.consensusScore.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="lg:col-span-2" veil>
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
                  className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-all hover:scale-[1.02] ${
                    activeSymbol === sym ? "border-violet-500/40 bg-violet-500/10" : "border-border/60 bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{def?.display ?? sym}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${up ? "bg-emerald-400" : "bg-rose-400"}`} />
                  </div>
                  <div className="tnum mt-1 text-sm font-semibold">{q ? formatPrice(q.price, def?.digits ?? 2) : "—"}</div>
                  <div className={`tnum text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {up ? "+" : ""}{change.toFixed(3)}%
                  </div>
                </button>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      {/* Recent auto-generated signals */}
      {engine.recentSignals.length > 0 && (
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Recent Auto-Generated Signals</h3>
              <p className="text-xs text-muted-foreground">{engine.recentSignals.length} signals from last cycle</p>
            </div>
            <Zap className="h-4 w-4 text-violet-400" />
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto scroll-fancy">
            {engine.recentSignals.slice(0, 15).map((sig, i) => (
              <div key={`${sig.id ?? i}`} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3 text-xs">
                <div className="flex items-center gap-3">
                  <DirectionBadge direction={sig.direction} />
                  <div>
                    <div className="font-semibold">{sig.symbol}</div>
                    <div className="text-muted-foreground">{sig.timeframe}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="tnum font-semibold">{sig.confidence.toFixed(0)}%</div>
                    <div className="text-muted-foreground">confidence</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum font-semibold">1:{sig.riskRewardRatio.toFixed(1)}</div>
                    <div className="text-muted-foreground">R:R</div>
                  </div>
                  <div className={`tnum font-semibold ${sig.consensusScore > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {sig.consensusScore > 0 ? "+" : ""}{sig.consensusScore.toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Multi-timeframe confluence */}
      <ConfluencePanel />

      {/* Learning Insights panel */}
      <LearningInsightsPanel />

      {/* Advanced analytics: curves + matrix + weights */}
      <AdvancedAnalyticsPanel />

      {/* Learning progress footer */}
      <GlassPanel veil className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-violet-400" />
            <span className="font-medium">Self-Learning Engine:</span>
            <span className="text-muted-foreground">
              {engineConfig.learningEnabled
                ? `evaluating past signals every 5min · retraining every ${engineConfig.retrainIntervalHours}h`
                : "disabled"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {engine.stats && engine.stats.evaluated > 0 && (
              <>
                <span className="text-muted-foreground">
                  BUY win rate: <span className="tnum font-semibold text-emerald-400">{engine.stats.byDirection.BUY.total > 0 ? ((engine.stats.byDirection.BUY.correct / engine.stats.byDirection.BUY.total) * 100).toFixed(0) : 0}%</span>
                </span>
                <span className="text-muted-foreground">
                  SELL win rate: <span className="tnum font-semibold text-rose-400">{engine.stats.byDirection.SELL.total > 0 ? ((engine.stats.byDirection.SELL.correct / engine.stats.byDirection.SELL.total) * 100).toFixed(0) : 0}%</span>
                </span>
              </>
            )}
            <PulseDot variant={engineConfig.enabled ? "bull" : "neutral"} />
            <span className="font-medium">{engineConfig.enabled ? "Engine running" : "Engine paused"}</span>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function EngineStatusBadge({ running, enabled }: { running: boolean; enabled: boolean }) {
  if (!enabled) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-slate-500/10 px-3 py-1 text-xs ring-1 ring-slate-500/20">
        <Pause className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-400">Paused</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ${
      running ? "bg-amber-500/10 text-amber-300 ring-amber-500/20" : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
    }`}>
      <span className="pulse-dot" />
      <span className="font-medium">{running ? "Scanning…" : "Live"}</span>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
