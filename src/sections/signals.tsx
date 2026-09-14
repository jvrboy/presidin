"use client";

import { useEffect, useState, useCallback } from "react";
import { GlassPanel, SectionTitle, DirectionBadge, ConfidenceMeter, AgentVoteBar, LiquidProgress, ShimmerButton } from "@/components/presidin/glass";
import { useWatchlistStore, useAccountStore, useAgentConfigStore } from "@/stores/presidin";
import { SYMBOL_MAP, DEFAULT_ACTIVE_SYMBOLS, TIMEFRAMES, formatPrice, formatPercent } from "@/lib/presidin/symbols";
import { marketData } from "@/lib/presidin/market-data";
import { runMasterAgent, type Signal, AGENT_REGISTRY } from "@/lib/presidin/agents";
import { useSocket } from "@/hooks/use-socket";
import { Radio, RefreshCw, Filter, ArrowUp, ArrowDown, Brain, Activity, Wifi } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

export function SignalsSection() {
  const { activeSymbol, setActiveSymbol, activeTimeframe, setActiveTimeframe } = useWatchlistStore();
  const { equity } = useAccountStore();
  const { getConfig } = useAgentConfigStore();
  const { connected: wsConnected, subscribe } = useSocket();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [history, setHistory] = useState<Signal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  const generateSignal = useCallback((sym: string) => {
    setScanning(true);
    const def = SYMBOL_MAP[sym];
    const tf = TIMEFRAMES.find((t) => t.value === activeTimeframe) ?? TIMEFRAMES[2];
    const candles = marketData.syntheticHistory(sym, tf.seconds, 200);
    const cfg = getConfig(equity, 1.0);
    const sig = runMasterAgent(def?.display ?? sym, activeTimeframe, candles, cfg);
    setSignal(sig);
    setHistory((h) => [sig, ...h].slice(0, 30));
    setTimeout(() => setScanning(false), 400);
  }, [activeTimeframe, equity, getConfig]);

  useEffect(() => {
    generateSignal(activeSymbol);
  }, [activeSymbol, activeTimeframe, generateSignal]);

  // Subscribe to real-time signals from WebSocket
  useEffect(() => {
    const unsub = subscribe<Signal>("signals:new", (incoming) => {
      setHistory((h) => [incoming, ...h].slice(0, 50));
    });
    return unsub;
  }, [subscribe]);

  // Scan all symbols
  const scanAll = useCallback(() => {
    setScanning(true);
    const cfg = getConfig(equity, 1.0);
    const tf = TIMEFRAMES.find((t) => t.value === activeTimeframe) ?? TIMEFRAMES[2];
    const newSignals: Signal[] = [];
    for (const sym of DEFAULT_ACTIVE_SYMBOLS) {
      const def = SYMBOL_MAP[sym];
      const candles = marketData.syntheticHistory(sym, tf.seconds, 200);
      const sig = runMasterAgent(def?.display ?? sym, activeTimeframe, candles, cfg);
      newSignals.push(sig);
    }
    newSignals.sort((a, b) => b.confidence - a.confidence);
    setHistory(newSignals);
    setSignal(newSignals.find((s) => s.symbol === SYMBOL_MAP[activeSymbol]?.display) ?? newSignals[0]);
    setTimeout(() => setScanning(false), 600);
  }, [activeTimeframe, activeSymbol, equity, getConfig]);

  const buyVotes = signal?.votes.filter((v) => v.direction === "BUY").length ?? 0;
  const sellVotes = signal?.votes.filter((v) => v.direction === "SELL").length ?? 0;
  const neutralVotes = signal?.votes.filter((v) => v.direction === "NEUTRAL").length ?? 0;
  const consensusData = [
    { name: "BUY", value: buyVotes, fill: "#10b981" },
    { name: "SELL", value: sellVotes, fill: "#f43f5e" },
    { name: "NEUTRAL", value: neutralVotes, fill: "#64748b" },
  ];

  const filteredHistory = filter === "ALL" ? history : history.filter((s) => s.direction === filter);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Multi-Agent Signals"
        subtitle="17 voting agents + MasterAgent arbiter produce consensus signals"
        icon={<Radio className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${wsConnected ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" : "bg-slate-500/10 text-slate-400 ring-slate-500/20"}`}>
              <Wifi className={`h-3 w-3 ${wsConnected ? "" : "opacity-50"}`} />
              {wsConnected ? "Live" : "Offline"}
            </div>
            <ShimmerButton onClick={scanAll} disabled={scanning} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              Scan all symbols
            </ShimmerButton>
          </div>
        }
      />

      {/* Symbol & timeframe selector */}
      <GlassPanel className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Symbol:</span>
          {DEFAULT_ACTIVE_SYMBOLS.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                activeSymbol === sym
                  ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {SYMBOL_MAP[sym]?.display ?? sym}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Timeframe:</span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setActiveTimeframe(tf.value)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                activeTimeframe === tf.value
                  ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Current signal detail */}
        <GlassPanel className="lg:col-span-2" veil>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">
                {SYMBOL_MAP[activeSymbol]?.display ?? activeSymbol}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{activeTimeframe}</span>
              </h3>
              <p className="text-xs text-muted-foreground">MasterAgent consensus</p>
            </div>
            {signal && <DirectionBadge direction={signal.direction} />}
          </div>

          {signal && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-secondary/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Entry</div>
                  <div className="tnum mt-1 text-sm font-bold">{formatPrice(signal.suggestedEntry, 4)}</div>
                </div>
                <div className="rounded-lg bg-rose-500/10 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-rose-300">Stop Loss</div>
                  <div className="tnum mt-1 text-sm font-bold text-rose-200">{formatPrice(signal.suggestedStopLoss, 4)}</div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300">Take Profit</div>
                  <div className="tnum mt-1 text-sm font-bold text-emerald-200">{formatPrice(signal.suggestedTakeProfit, 4)}</div>
                </div>
                <div className="rounded-lg bg-secondary/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">R:R</div>
                  <div className="tnum mt-1 text-sm font-bold">1:{signal.riskRewardRatio.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <div className="text-emerald-300">Buy votes</div>
                  <div className="tnum text-lg font-bold text-emerald-200">{buyVotes}</div>
                </div>
                <div className="rounded-lg bg-rose-500/10 p-2">
                  <div className="text-rose-300">Sell votes</div>
                  <div className="tnum text-lg font-bold text-rose-200">{sellVotes}</div>
                </div>
                <div className="rounded-lg bg-secondary/40 p-2">
                  <div className="text-muted-foreground">Neutral</div>
                  <div className="tnum text-lg font-bold">{neutralVotes}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent votes</div>
                <div className="space-y-0.5">
                  {signal.votes.map((vote) => (
                    <div key={vote.agentId} className="group">
                      <AgentVoteBar
                        direction={vote.direction}
                        confidence={vote.confidence}
                        weight={vote.weight}
                        label={vote.agentName}
                        reasoning={vote.reasoning}
                      />
                      <div className="hidden group-hover:block px-32 pb-2 text-[10px] text-muted-foreground">
                        {vote.reasoning}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </GlassPanel>

        {/* Consensus visualization */}
        <div className="space-y-4">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Vote Distribution</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={consensusData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={50} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(240 6% 10% / 0.95)",
                    border: "1px solid hsl(240 5% 30%)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={6}>
                  {consensusData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {signal && (
              <div className="mt-3">
                <ConfidenceMeter value={signal.confidence} label="Aggregate confidence" />
              </div>
            )}
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Top Voting Agents</h3>
            <div className="space-y-2">
              {signal?.votes
                .sort((a, b) => b.confidence * b.weight - a.confidence * a.weight)
                .slice(0, 5)
                .map((v) => (
                  <div key={v.agentId} className="flex items-center justify-between text-xs">
                    <span className="font-medium">{v.agentName}</span>
                    <div className="flex items-center gap-2">
                      <DirectionBadge direction={v.direction} className="!px-1.5 !py-0 !text-[10px]" />
                      <span className="tnum text-muted-foreground">{v.confidence.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* Signal feed */}
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Signal Feed</h3>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {(["ALL", "BUY", "SELL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  filter === f
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-96 space-y-2 overflow-y-auto scroll-fancy">
          {filteredHistory.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No signals yet. Click "Scan all symbols" to generate.
            </div>
          )}
          {filteredHistory.map((sig, i) => (
            <div
              key={sig.id}
              className="flex items-center justify-between rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30 transition hover:bg-secondary/50"
            >
              <div className="flex items-center gap-3">
                <DirectionBadge direction={sig.direction} />
                <div>
                  <div className="text-sm font-semibold">{sig.symbol}</div>
                  <div className="text-xs text-muted-foreground">{sig.timeframe} · {sig.votes.length} agents</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="tnum font-semibold">{sig.confidence.toFixed(0)}%</div>
                  <div className="text-muted-foreground">conf</div>
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

      {/* Shadow-Mode Backtest */}
      <ShadowTestPanel />
    </div>
  );
}

function ShadowTestPanel() {
  const { activeSymbol, activeTimeframe } = useWatchlistStore();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/engine/shadow-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol,
          timeframe: activeTimeframe,
          candleCount: 500,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <GlassPanel veil>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Shadow-Mode Backtest</h3>
          <p className="text-xs text-muted-foreground">Run the engine on historical data to validate accuracy before going live</p>
        </div>
        <ShimmerButton onClick={runTest} disabled={running} className="text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Testing…" : "Run test"}
        </ShimmerButton>
      </div>
      {result && (
        <div className="space-y-3">
          {result.backtest && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Signals</div>
                <div className="tnum text-lg font-bold">{result.signalCount}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Win Rate</div>
                <div className="tnum text-lg font-bold">{result.backtest.metrics.winRate.toFixed(1)}%</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sharpe</div>
                <div className="tnum text-lg font-bold">{result.backtest.metrics.sharpe.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Max DD</div>
                <div className="tnum text-lg font-bold">{result.backtest.metrics.maxDrawdownPct.toFixed(1)}%</div>
              </div>
            </div>
          )}
          {result.recommendation && (
            <div className={`rounded-lg p-3 text-xs ${
              result.recommendation === "GO_LIVE"
                ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
                : result.recommendation === "SHADOW_MODE"
                ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20"
                : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20"
            }`}>
              <strong>Recommendation:</strong> {result.recommendation === "GO_LIVE" ? "✓ Safe to deploy live" : result.recommendation === "SHADOW_MODE" ? "⚠ Keep in shadow mode" : "✗ Do not deploy"}
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
