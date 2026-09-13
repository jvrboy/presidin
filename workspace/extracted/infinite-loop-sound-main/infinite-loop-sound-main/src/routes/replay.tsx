import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  BarChart,
  Target,
  Shield,
  Zap,
  Activity,
  Plus,
  Minus,
  ChevronUp,
  ChevronDown,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Trade Scenario Tester — DivergenceIQ" },
      {
        name: "description",
        content:
          "Simulate trade scenarios with configurable parameters and instant outcome analysis.",
      },
    ],
  }),
  component: ReplayPage,
});

interface ScenarioTrade {
  id: number;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp: number;
  lots: number;
  result: "WIN" | "LOSS" | "BE" | "OPEN";
  pnl: number;
  rr: number;
  pips: number;
}

interface ScenarioConfig {
  pair: string;
  pipValue: number;
  startBalance: number;
  riskPct: number;
  rr: number;
  winRate: number;
  numTrades: number;
  basePrice: number;
  avgVolatilityPips: number;
}

const PAIR_CONFIGS: Record<string, { pipValue: number; basePrice: number; avgVol: number }> = {
  "EUR/USD": { pipValue: 10, basePrice: 1.085, avgVol: 50 },
  "GBP/USD": { pipValue: 10, basePrice: 1.27, avgVol: 80 },
  "USD/JPY": { pipValue: 9.2, basePrice: 149.5, avgVol: 60 },
  "AUD/USD": { pipValue: 10, basePrice: 0.655, avgVol: 45 },
  "USD/CAD": { pipValue: 7.5, basePrice: 1.36, avgVol: 45 },
  "XAU/USD": { pipValue: 1, basePrice: 2320, avgVol: 200 },
  "GBP/JPY": { pipValue: 6.7, basePrice: 190.0, avgVol: 100 },
};

function generateScenario(config: ScenarioConfig): ScenarioTrade[] {
  const trades: ScenarioTrade[] = [];
  let price = config.basePrice;
  const pipSize = config.pair.includes("JPY") ? 0.01 : config.pair === "XAU/USD" ? 0.1 : 0.0001;

  for (let i = 0; i < config.numTrades; i++) {
    const direction: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
    const slPips = config.avgVolatilityPips * (0.5 + Math.random() * 0.5);
    const tpPips = slPips * config.rr;

    const slDistance = slPips * pipSize;
    const tpDistance = tpPips * pipSize;

    const entry = price;
    const sl = direction === "BUY" ? entry - slDistance : entry + slDistance;
    const tp = direction === "BUY" ? entry + tpDistance : entry - tpDistance;

    // Risk-based lot sizing
    const riskAmount = (config.startBalance * config.riskPct) / 100;
    const lots = Math.max(0.01, riskAmount / (slPips * config.pipValue));

    // Determine outcome
    const rand = Math.random() * 100;
    const result: "WIN" | "LOSS" | "BE" =
      rand < config.winRate ? "WIN" : rand < config.winRate + 5 ? "BE" : "LOSS";
    const pnl = result === "WIN" ? riskAmount * config.rr : result === "LOSS" ? -riskAmount : 0;
    const pips = result === "WIN" ? tpPips : result === "LOSS" ? -slPips : 0;

    trades.push({
      id: i + 1,
      direction,
      entry,
      sl,
      tp,
      lots: Math.round(lots * 100) / 100,
      result,
      pnl,
      rr: config.rr,
      pips,
    });

    // Evolve price
    price += (Math.random() - 0.48) * config.avgVolatilityPips * pipSize * 3;
  }

  return trades;
}

function ReplayPage() {
  const [config, setConfig] = useState<ScenarioConfig>({
    pair: "EUR/USD",
    pipValue: 10,
    startBalance: 10000,
    riskPct: 1,
    rr: 2.0,
    winRate: 55,
    numTrades: 50,
    basePrice: 1.085,
    avgVolatilityPips: 50,
  });

  const [trades, setTrades] = useState<ScenarioTrade[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [generated, setGenerated] = useState(false);

  function updatePair(pair: string) {
    const pc = PAIR_CONFIGS[pair];
    if (pc)
      setConfig((c) => ({
        ...c,
        pair,
        pipValue: pc.pipValue,
        basePrice: pc.basePrice,
        avgVolatilityPips: pc.avgVol,
      }));
  }

  function generate() {
    const t = generateScenario(config);
    setTrades(t);
    setCurrentIdx(0);
    setGenerated(true);
    setRunning(false);
  }

  function reset() {
    setCurrentIdx(0);
    setRunning(false);
  }

  function stepForward() {
    setCurrentIdx((i) => Math.min(trades.length, i + 1));
  }

  function stepBack() {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }

  const visibleTrades = trades.slice(0, currentIdx);

  const stats = useMemo(() => {
    if (!visibleTrades.length) return null;
    const wins = visibleTrades.filter((t) => t.result === "WIN").length;
    const losses = visibleTrades.filter((t) => t.result === "LOSS").length;
    const bes = visibleTrades.filter((t) => t.result === "BE").length;
    const totalPnL = visibleTrades.reduce((s, t) => s + t.pnl, 0);
    const winRate = visibleTrades.length > 0 ? (wins / visibleTrades.length) * 100 : 0;
    const grossProfit = visibleTrades
      .filter((t) => t.result === "WIN")
      .reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(
      visibleTrades.filter((t) => t.result === "LOSS").reduce((s, t) => s + t.pnl, 0),
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Equity curve
    let equity = config.startBalance;
    let peak = equity;
    let maxDD = 0;
    const curve: number[] = [equity];
    for (const t of visibleTrades) {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
      curve.push(equity);
    }

    // Consecutive streaks
    let curWin = 0,
      curLoss = 0,
      maxWin = 0,
      maxLoss = 0;
    for (const t of visibleTrades) {
      if (t.result === "WIN") {
        curWin++;
        curLoss = 0;
        maxWin = Math.max(maxWin, curWin);
      } else if (t.result === "LOSS") {
        curLoss++;
        curWin = 0;
        maxLoss = Math.max(maxLoss, curLoss);
      } else {
        curWin = 0;
        curLoss = 0;
      }
    }

    return {
      wins,
      losses,
      bes,
      totalPnL,
      winRate,
      profitFactor,
      maxDD,
      equity,
      curve,
      maxWin,
      maxLoss,
    };
  }, [visibleTrades, config.startBalance]);

  const currentTrade = trades[currentIdx - 1];

  // Equity curve visualization
  const curve = stats?.curve ?? [config.startBalance];
  const minEq = Math.min(...curve);
  const maxEq = Math.max(...curve);
  const eqRange = maxEq - minEq || 1;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Play className="w-6 h-6 text-primary" /> Trade Scenario Tester
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and step through simulated trade scenarios to test strategies and visualize
            outcomes.
          </p>
        </div>

        {/* Config */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Scenario Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pair
                </label>
                <select
                  value={config.pair}
                  onChange={(e) => updatePair(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {Object.keys(PAIR_CONFIGS).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Start Balance ($)
                </label>
                <input
                  type="number"
                  value={config.startBalance}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, startBalance: parseFloat(e.target.value) || 10000 }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Risk per Trade (%)
                </label>
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={config.riskPct}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, riskPct: parseFloat(e.target.value) || 1 }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  R:R Ratio
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.1}
                  value={config.rr}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, rr: parseFloat(e.target.value) || 2 }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Win Rate (%)
                </label>
                <input
                  type="number"
                  min={10}
                  max={90}
                  step={1}
                  value={config.winRate}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, winRate: parseFloat(e.target.value) || 55 }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Number of Trades
                </label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  step={10}
                  value={config.numTrades}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, numTrades: parseInt(e.target.value) || 50 }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Avg Volatility (pips)
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  step={5}
                  value={config.avgVolatilityPips}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      avgVolatilityPips: parseFloat(e.target.value) || 50,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={generate}>
                  <Zap className="w-4 h-4 mr-1" /> Generate Scenario
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {generated && (
          <>
            {/* Playback Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={stepBack} disabled={currentIdx === 0}>
                <ChevronUp className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={stepForward}
                disabled={currentIdx >= trades.length}
              >
                <ChevronDown className="w-4 h-4 mr-1" /> Next
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentIdx(trades.length)}>
                <SkipForward className="w-4 h-4 mr-1" /> Show All
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-1" /> Reset
              </Button>
              <span className="text-sm text-muted-foreground font-mono">
                Trade {currentIdx} / {trades.length}
              </span>
              <div className="flex-1 bg-muted rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{ width: `${(currentIdx / trades.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Current Trade Info */}
            {currentTrade && (
              <Card
                className={`border-2 ${
                  currentTrade.result === "WIN"
                    ? "border-bull/40"
                    : currentTrade.result === "LOSS"
                      ? "border-bear/40"
                      : "border-border"
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {currentTrade.direction === "BUY" ? (
                        <TrendingUp className="w-4 h-4 text-bull" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-bear" />
                      )}
                      Trade #{currentTrade.id} — {currentTrade.direction} {config.pair}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        currentTrade.result === "WIN"
                          ? "bg-bull/10 text-bull border-bull/30"
                          : currentTrade.result === "LOSS"
                            ? "bg-bear/10 text-bear border-bear/30"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      {currentTrade.result}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-lg bg-background border border-border p-2 text-center">
                      <div className="text-[9px] uppercase text-muted-foreground">Entry</div>
                      <div className="font-mono font-semibold text-sm">
                        {currentTrade.entry.toFixed(
                          config.pair.includes("JPY") ? 3 : config.pair === "XAU/USD" ? 2 : 5,
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-muted-foreground">Stop Loss</div>
                      <div className="font-mono font-semibold text-sm text-bear">
                        {currentTrade.sl.toFixed(
                          config.pair.includes("JPY") ? 3 : config.pair === "XAU/USD" ? 2 : 5,
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-muted-foreground">Take Profit</div>
                      <div className="font-mono font-semibold text-sm text-bull">
                        {currentTrade.tp.toFixed(
                          config.pair.includes("JPY") ? 3 : config.pair === "XAU/USD" ? 2 : 5,
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-background border border-border p-2 text-center">
                      <div className="text-[9px] uppercase text-muted-foreground">Lots</div>
                      <div className="font-mono font-semibold text-sm">{currentTrade.lots}</div>
                    </div>
                    <div
                      className={`rounded-lg border p-2 text-center ${
                        currentTrade.result === "WIN"
                          ? "bg-bull/10 border-bull/30"
                          : currentTrade.result === "LOSS"
                            ? "bg-bear/10 border-bear/30"
                            : "bg-muted border-border"
                      }`}
                    >
                      <div className="text-[9px] uppercase text-muted-foreground">P&L</div>
                      <div
                        className={`font-mono font-bold text-sm ${
                          currentTrade.result === "WIN"
                            ? "text-bull"
                            : currentTrade.result === "LOSS"
                              ? "text-bear"
                              : "text-muted-foreground"
                        }`}
                      >
                        {currentTrade.pnl >= 0 ? "+" : ""}${currentTrade.pnl.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            {stats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    label="Equity"
                    value={`$${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    accent={stats.equity >= config.startBalance ? "bull" : "bear"}
                    icon={DollarSign}
                  />
                  <StatCard
                    label="Total P&L"
                    value={`${stats.totalPnL >= 0 ? "+" : ""}$${stats.totalPnL.toFixed(2)}`}
                    accent={stats.totalPnL >= 0 ? "bull" : "bear"}
                    icon={TrendingUp}
                  />
                  <StatCard
                    label="Win Rate"
                    value={`${stats.winRate.toFixed(1)}%`}
                    accent={stats.winRate >= 50 ? "bull" : "bear"}
                    icon={Target}
                  />
                  <StatCard
                    label="Profit Factor"
                    value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
                    accent={
                      stats.profitFactor >= 1.5
                        ? "bull"
                        : stats.profitFactor >= 1
                          ? "amber"
                          : "bear"
                    }
                    icon={BarChart}
                  />
                  <StatCard
                    label="Max Drawdown"
                    value={`${stats.maxDD.toFixed(2)}%`}
                    accent={stats.maxDD > 20 ? "bear" : stats.maxDD > 10 ? "amber" : "bull"}
                    icon={Shield}
                  />
                  <StatCard
                    label="Wins / Losses"
                    value={`${stats.wins} / ${stats.losses}`}
                    accent="neutral"
                    icon={Activity}
                  />
                  <StatCard
                    label="Best Win Streak"
                    value={`${stats.maxWin}`}
                    accent="bull"
                    icon={TrendingUp}
                  />
                  <StatCard
                    label="Worst Loss Streak"
                    value={`${stats.maxLoss}`}
                    accent="bear"
                    icon={TrendingDown}
                  />
                </div>

                {/* Equity Curve */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart className="w-4 h-4 text-primary" /> Equity Curve
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-0.5 items-end h-32">
                      {curve.map((eq, i) => {
                        const height = Math.max(4, ((eq - minEq) / eqRange) * 100);
                        const isLast = i === curve.length - 1;
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-t transition-all ${eq >= config.startBalance ? "bg-bull/60" : "bg-bear/60"} ${isLast ? "ring-1 ring-white/30" : ""}`}
                            style={{ height: `${height}%` }}
                            title={`Trade ${i}: $${eq.toFixed(2)}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1 font-mono">
                      <span>${minEq.toFixed(0)}</span>
                      <span>Start: ${config.startBalance.toLocaleString()}</span>
                      <span>${maxEq.toFixed(0)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Trade Table */}
            {visibleTrades.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Trade Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="text-left py-2 pr-3">#</th>
                          <th className="text-left py-2 pr-3">Dir</th>
                          <th className="text-left py-2 pr-3">Entry</th>
                          <th className="text-left py-2 pr-3">Result</th>
                          <th className="text-left py-2 pr-3">Pips</th>
                          <th className="text-left py-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...visibleTrades].reverse().map((t) => (
                          <tr key={t.id} className="border-b border-border/50">
                            <td className="py-1.5 pr-3 text-muted-foreground font-mono text-xs">
                              {t.id}
                            </td>
                            <td className="py-1.5 pr-3">
                              <Badge
                                variant="outline"
                                className={
                                  t.direction === "BUY"
                                    ? "text-bull border-bull/30 bg-bull/10 text-xs"
                                    : "text-bear border-bear/30 bg-bear/10 text-xs"
                                }
                              >
                                {t.direction}
                              </Badge>
                            </td>
                            <td className="py-1.5 pr-3 font-mono text-xs">
                              {t.entry.toFixed(config.pair.includes("JPY") ? 3 : 5)}
                            </td>
                            <td className="py-1.5 pr-3">
                              <Badge
                                variant="outline"
                                className={
                                  t.result === "WIN"
                                    ? "bg-bull/10 text-bull border-bull/30 text-xs"
                                    : t.result === "LOSS"
                                      ? "bg-bear/10 text-bear border-bear/30 text-xs"
                                      : "bg-muted text-muted-foreground text-xs"
                                }
                              >
                                {t.result}
                              </Badge>
                            </td>
                            <td
                              className={`py-1.5 pr-3 font-mono text-xs ${t.pips >= 0 ? "text-bull" : "text-bear"}`}
                            >
                              {t.pips >= 0 ? "+" : ""}
                              {t.pips.toFixed(1)}
                            </td>
                            <td
                              className={`py-1.5 font-mono font-semibold text-xs ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}
                            >
                              {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!generated && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Play className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">
              Configure your scenario above and click <strong>Generate Scenario</strong> to begin.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: "bull" | "bear" | "amber" | "neutral";
  icon: any;
}) {
  const color =
    accent === "bull"
      ? "text-bull"
      : accent === "bear"
        ? "text-bear"
        : accent === "amber"
          ? "text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
