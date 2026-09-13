import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo, useCallback } from "react";
import {
  Activity,
  BarChart,
  CircleCheck,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDerivFeed } from "@/hooks/use-deriv-feed";
import { walkForward, type StrategyFn, type WfoResult } from "@/lib/engine/walk-forward";
import { rsi, macd, supertrend, type Candle } from "@/lib/engine/indicators";
import { toast } from "sonner";

export const Route = createFileRoute("/walk-forward")({
  head: () => ({
    meta: [
      { title: "Walk-Forward Optimization — DivergenceIQ" },
      {
        name: "description",
        content:
          "Walk-forward analysis: split history into rolling IS/OOS folds, measure decay and robustness.",
      },
    ],
  }),
  component: WalkForwardPage,
});

const PAIRS = [
  { symbol: "frxEURUSD", display: "EUR/USD" },
  { symbol: "frxGBPUSD", display: "GBP/USD" },
  { symbol: "frxUSDJPY", display: "USD/JPY" },
  { symbol: "frxAUDUSD", display: "AUD/USD" },
];

const STRATEGIES: { name: string; fn: StrategyFn }[] = [
  {
    name: "RSI Reversal",
    fn: (candles: Candle[]) => {
      if (candles.length < 20) return null;
      const r = rsi(
        candles.map((c) => c.close),
        14,
      );
      const last = r[r.length - 1] ?? 50;
      if (last < 30) return "BUY";
      if (last > 70) return "SELL";
      return null;
    },
  },
  {
    name: "MACD Momentum",
    fn: (candles: Candle[]) => {
      if (candles.length < 30) return null;
      const m = macd(candles.map((c) => c.close));
      const hist = m.hist[m.hist.length - 1] ?? 0;
      const prev = m.hist[m.hist.length - 2] ?? 0;
      if (hist > 0 && hist > prev) return "BUY";
      if (hist < 0 && hist < prev) return "SELL";
      return null;
    },
  },
  {
    name: "Supertrend Follow",
    fn: (candles: Candle[]) => {
      if (candles.length < 50) return null;
      const st = supertrend(candles);
      const dir = st.trend[st.trend.length - 1];
      if (dir == null) return null;
      return dir > 0 ? "BUY" : "SELL";
    },
  },
];

function ticksToCandles(ticks: number[], foldSize = 10): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < ticks.length - foldSize; i += foldSize) {
    const slice = ticks.slice(i, i + foldSize);
    const open = slice[0];
    const close = slice[slice.length - 1];
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    candles.push({ epoch: i, open, high, low, close, volume: slice.length });
  }
  return candles;
}

function WalkForwardPage() {
  const [selectedPair, setSelectedPair] = useState(PAIRS[0].symbol);
  const [selectedStrategy, setSelectedStrategy] = useState(0);
  const [folds, setFolds] = useState(4);
  const [oosRatio, setOosRatio] = useState(0.25);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WfoResult | null>(null);

  const symbols = useMemo(() => PAIRS.map((p) => p.symbol), []);
  const { ticks, ready } = useDerivFeed(symbols);

  const runAnalysis = useCallback(() => {
    setRunning(true);
    try {
      const tickData = ticks[selectedPair]?.window ?? [];
      if (tickData.length < 200) {
        toast.error("Not enough tick data. Need at least 200 ticks.");
        setResult(null);
        return;
      }
      const candles = ticksToCandles(tickData);
      if (candles.length < 200) {
        toast.error("Not enough candles after aggregation.");
        setResult(null);
        return;
      }
      const strat = STRATEGIES[selectedStrategy];
      const res = walkForward(candles, strat.fn, { folds, oosRatio });
      setResult(res);
      if (res.robust) {
        toast.success(`${strat.name} is robust (decay ${(res.decay * 100).toFixed(1)}%)`);
      } else {
        toast.warning(`${strat.name} may be overfit (decay ${(res.decay * 100).toFixed(1)}%)`);
      }
    } catch (e) {
      toast.error("Analysis failed");
    } finally {
      setRunning(false);
    }
  }, [ticks, selectedPair, selectedStrategy, folds, oosRatio]);

  const tickCount = ticks[selectedPair]?.window.length ?? 0;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Gauge className="w-6 h-6 text-primary" /> Walk-Forward Optimization
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rolling IS/OOS fold analysis to detect overfitting and measure strategy robustness
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
            <Activity
              className={`w-3.5 h-3.5 text-primary ${ready ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-primary">
              {tickCount} ticks · {ready ? "LIVE" : "CONNECTING…"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pair</label>
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {PAIRS.map((p) => (
                    <option key={p.symbol} value={p.symbol}>
                      {p.display}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Strategy</label>
                <select
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {STRATEGIES.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Folds: {folds}</label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={folds}
                  onChange={(e) => setFolds(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  OOS Ratio: {(oosRatio * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={oosRatio * 100}
                  onChange={(e) => setOosRatio(Number(e.target.value) / 100)}
                  className="w-full accent-primary"
                />
              </div>
            </div>
            <Button onClick={runAnalysis} disabled={running || tickCount < 200} className="w-full">
              {running ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Activity className="w-4 h-4 mr-2" />
              )}
              Run Walk-Forward Analysis
            </Button>
          </CardContent>
        </Card>

        {result && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={BarChart}
                label="Avg IS Accuracy"
                value={`${(result.avgInSampleAcc * 100).toFixed(1)}%`}
                color="text-sky-400"
              />
              <StatCard
                icon={TrendingUp}
                label="Avg OOS Accuracy"
                value={`${(result.avgOutOfSampleAcc * 100).toFixed(1)}%`}
                color="text-bull"
              />
              <StatCard
                icon={TrendingDown}
                label="Decay"
                value={`${(result.decay * 100).toFixed(1)}%`}
                color={result.decay > 0.2 ? "text-bear" : "text-bull"}
              />
              <StatCard
                icon={result.robust ? CircleCheck : AlertTriangle}
                label="Robustness"
                value={result.robust ? "ROBUST" : "OVERFIT"}
                color={result.robust ? "text-bull" : "text-bear"}
              />
            </div>

            {/* Fold Details */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart className="w-4 h-4 text-primary" /> Fold-by-Fold Results
                </CardTitle>
                <CardDescription>
                  In-sample vs out-of-sample accuracy per fold. Large gaps indicate overfitting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.folds.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">
                    Not enough data for fold analysis. Need at least 200 candles.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {result.folds.map((fold, i) => {
                      const gap = fold.inSampleAcc - fold.outOfSampleAcc;
                      const gapPct = fold.inSampleAcc > 0 ? (gap / fold.inSampleAcc) * 100 : 0;
                      return (
                        <div
                          key={i}
                          className="p-3 rounded-lg bg-background/50 border border-border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Fold {i + 1}</span>
                            <Badge
                              className={
                                gapPct < 15
                                  ? "bg-bull/10 text-bull border-bull/30"
                                  : gapPct < 30
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                    : "bg-bear/10 text-bear border-bear/30"
                              }
                            >
                              gap: {gapPct.toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-muted-foreground">In-Sample</span>
                                <span className="font-mono">
                                  {(fold.inSampleAcc * 100).toFixed(1)}% ({fold.inSampleTrades}t)
                                </span>
                              </div>
                              <Progress value={fold.inSampleAcc * 100} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-muted-foreground">Out-of-Sample</span>
                                <span className="font-mono">
                                  {(fold.outOfSampleAcc * 100).toFixed(1)}% (
                                  {fold.outOfSampleTrades}t)
                                </span>
                              </div>
                              <Progress
                                value={fold.outOfSampleAcc * 100}
                                className="h-1.5"
                                // @ts-expect-error CSS custom property is not in React style typings
                                style={{ "--progress-color": "var(--bull)" }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Interpretation */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Interpretation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {result.robust ? (
                    <p className="text-bull">
                      Strategy is robust: OOS accuracy is within 20% of IS accuracy and above 50%.
                      This suggests the strategy generalizes well to unseen data.
                    </p>
                  ) : (
                    <>
                      <p className="text-bear">
                        Strategy may be overfit: decay is {(result.decay * 100).toFixed(1)}%
                        (threshold: 20%). OOS accuracy is significantly lower than IS accuracy.
                      </p>
                      <p>
                        Recommendations: reduce parameters, simplify entry conditions, increase
                        sample size, or test on different timeframes/pairs.
                      </p>
                    </>
                  )}
                  <p className="text-[10px] italic mt-2">
                    Note: Analysis uses tick-derived candles from the live Deriv feed. Results are
                    indicative and should be validated with proper historical backtesting.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!result && tickCount > 0 && tickCount < 200 && (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 text-primary opacity-50" />
            <p className="text-sm">
              Collecting ticks... {tickCount}/200 needed. Walk-forward analysis will be available
              once enough data is streamed.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
