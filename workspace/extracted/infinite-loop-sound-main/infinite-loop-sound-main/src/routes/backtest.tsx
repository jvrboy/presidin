import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import {
  deriv,
  ALL_ASSETS,
  ASSETS_BY_CLASS,
  TIMEFRAMES,
  displayPair,
  type TF,
  type AssetClass,
} from "@/lib/engine/deriv";
import { runBacktest, type BacktestResult } from "@/lib/engine/backtest";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ComposedChart,
  Scatter,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  Area,
} from "recharts";
import {
  History,
  Loader,
  TrendingUp,
  TrendingDown,
  Download,
  Image as ImgIcon,
  Play,
  Pause,
  BarChart as BarChartIcon,
  Target,
  Award,
  AlertTriangle,
  CircleCheck,
  Clock,
  Settings,
  ChevronRight,
  Zap,
} from "lucide-react";
import { downloadCSV, downloadEquityChart } from "@/lib/exports";
import { useSettings } from "@/hooks/use-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Backtesting — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional walk-forward backtesting with equity curves, R-multiple analysis, strategy comparison, and auto-execution.",
      },
    ],
  }),
  component: BacktestPage,
});

function BacktestPage() {
  const [pair, setPair] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("H1");
  const [count, setCount] = useState(2000);
  const [minScore, setMinScore] = useState(55);
  const [cooldown, setCooldown] = useState(10);
  const [forward, setForward] = useState(120);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [autoBacktest, setAutoBacktest] = useState(false);
  const [lastAutoRun, setLastAutoRun] = useState<Date | null>(null);
  const [autoInterval, setAutoInterval] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const { settings, update } = useSettings();

  const run = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      await deriv.connect();
      const cs = await deriv.getCandles(pair, tf, count);
      setCandles(cs);
      const r = runBacktest({
        pair,
        timeframe: tf,
        candles: cs,
        minScore,
        cooldownBars: cooldown,
        forwardBars: forward,
        spreadPips: settings.spreadPips,
        slippagePips: settings.slippagePips,
        execDelayBars: settings.execDelayBars,
      });
      setResult(r);
      setLastAutoRun(new Date());
      toast.success(
        `Backtest complete: ${r.signals.length} signals, ${r.winRate.toFixed(1)}% win rate`,
      );
    } catch (e: any) {
      setErr(e.message ?? String(e));
      toast.error("Backtest failed: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  // 24/7 Auto-backtest
  useEffect(() => {
    if (!autoBacktest) return;
    let cancelled = false;
    const tick = async () => {
      if (!cancelled && !busy) await run();
    };
    tick();
    const t = setInterval(tick, autoInterval * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBacktest, autoInterval, pair, tf, count, minScore, cooldown, forward]);

  const exportCsv = () => {
    if (!result) return;
    downloadCSV(
      `backtest_${pair}_${tf}.csv`,
      result.signals.map((s) => ({
        time: new Date(s.time * 1000).toISOString(),
        index: s.index,
        direction: s.direction,
        entry: s.entry,
        sl: s.sl,
        tp1: s.tp1,
        tp2: s.tp2,
        tp3: s.tp3,
        score: s.scorePct,
        rating: s.rating,
        outcome: s.outcome,
        rMultiple: s.rMultiple,
      })),
    );
    toast.success("Trades exported to CSV");
  };
  const exportEquityCsv = () => {
    if (!result) return;
    downloadCSV(`equity_${pair}_${tf}.csv`, result.equityCurve);
    toast.success("Equity curve exported to CSV");
  };
  const exportEquityPng = () => {
    if (!result) return;
    downloadEquityChart(result.equityCurve, `equity_${pair}_${tf}.png`);
    toast.success("Equity chart exported to PNG");
  };

  const maxDrawdown = useMemo(() => {
    if (!result || !result.equityCurve.length) return 0;
    let maxDD = 0;
    let peak = 0;
    for (const p of result.equityCurve) {
      if (p.equity > peak) peak = p.equity;
      const dd = peak - p.equity;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD.toFixed(2);
  }, [result]);

  const sharpe = useMemo(() => {
    if (!result || result.equityCurve.length < 2) return 0;
    const returns = result.equityCurve
      .slice(1)
      .map((p, i) => p.equity - result.equityCurve[i].equity);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - avg) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    return std === 0 ? 0 : ((avg / std) * Math.sqrt(252)).toFixed(2);
  }, [result]);

  const avgR = useMemo(() => {
    if (!result || !result.signals.length) return 0;
    return (result.signals.reduce((a, b) => a + b.rMultiple, 0) / result.signals.length).toFixed(2);
  }, [result]);

  const profitFactor = useMemo(() => {
    if (!result) return 0;
    const wins = result.signals.filter((s) => s.rMultiple > 0).reduce((a, b) => a + b.rMultiple, 0);
    const losses = Math.abs(
      result.signals.filter((s) => s.rMultiple < 0).reduce((a, b) => a + b.rMultiple, 0),
    );
    return losses === 0 ? (wins > 0 ? "∞" : "0.00") : (wins / losses).toFixed(2);
  }, [result]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
              <History className="w-7 h-7 text-elite" /> Backtesting Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Walk-forward simulation with equity analysis, R-multiples, and performance metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={autoBacktest ? "default" : "outline"}
              onClick={() => setAutoBacktest(!autoBacktest)}
              size="sm"
              className={autoBacktest ? "bg-bull text-primary-foreground hover:bg-bull/90" : ""}
            >
              {autoBacktest ? (
                <Pause className="w-4 h-4 mr-1.5" />
              ) : (
                <Play className="w-4 h-4 mr-1.5" />
              )}
              {autoBacktest ? "24/7 ON" : "24/7 OFF"}
            </Button>
            <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-1.5" /> Config
            </Button>
            <Button onClick={run} disabled={busy} size="sm" className="gap-2">
              {busy ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Running...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Run Backtest
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Auto Interval */}
        {autoBacktest && (
          <Card className="border-bull/30">
            <CardContent className="p-3 flex items-center gap-4">
              <Clock className="w-4 h-4 text-bull" />
              <span className="text-sm text-muted-foreground">Auto-execute every</span>
              <select
                value={autoInterval}
                onChange={(e) => setAutoInterval(+e.target.value)}
                className="bg-input border border-border rounded px-2 py-1 text-sm font-mono"
              >
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
              </select>
              {lastAutoRun && (
                <span className="text-xs text-muted-foreground font-mono">
                  Last: {lastAutoRun.toLocaleTimeString()}
                </span>
              )}
            </CardContent>
          </Card>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Test Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid md:grid-cols-7 gap-3 items-end">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Pair
                  </div>
                  <select
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(ASSETS_BY_CLASS) as AssetClass[]).map((cls) => (
                      <optgroup key={cls} label={cls.toUpperCase()}>
                        {ASSETS_BY_CLASS[cls].map((p) => (
                          <option key={p.symbol} value={p.symbol}>
                            {p.display}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Timeframe
                  </div>
                  <select
                    value={tf}
                    onChange={(e) => setTf(e.target.value as TF)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Candles
                  </div>
                  <input
                    type="number"
                    min={500}
                    max={5000}
                    step={100}
                    value={count}
                    onChange={(e) => setCount(+e.target.value)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Min Score
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minScore}
                    onChange={(e) => setMinScore(+e.target.value)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Cooldown
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={cooldown}
                    onChange={(e) => setCooldown(+e.target.value)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Forward Bars
                  </div>
                  <input
                    type="number"
                    min={20}
                    value={forward}
                    onChange={(e) => setForward(+e.target.value)}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <Button onClick={run} disabled={busy} className="h-9">
                  {busy ? <Loader className="w-4 h-4 animate-spin" /> : "Run"}
                </Button>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Spread (pips)
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={settings.spreadPips}
                    onChange={(e) => update({ spreadPips: +e.target.value })}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Slippage (pips)
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={settings.slippagePips}
                    onChange={(e) => update({ slippagePips: +e.target.value })}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                    Exec Delay (bars)
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={settings.execDelayBars}
                    onChange={(e) => update({ execDelayBars: +e.target.value })}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {err && (
          <div className="rounded border border-bear/40 bg-bear/10 p-3 text-sm text-bear flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {err}
          </div>
        )}

        {result && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard
                icon={BarChartIcon}
                label="Signals"
                value={String(result.signals.length)}
              />
              <MetricCard
                icon={TrendingUp}
                label="Wins"
                value={String(result.wins)}
                color="text-bull"
              />
              <MetricCard
                icon={TrendingDown}
                label="Losses"
                value={String(result.losses)}
                color="text-bear"
              />
              <MetricCard
                icon={Target}
                label="Win Rate"
                value={`${result.winRate.toFixed(1)}%`}
                color={result.winRate >= 50 ? "text-bull" : "text-bear"}
              />
              <MetricCard
                icon={Award}
                label="Total R"
                value={result.totalR.toFixed(2)}
                color={result.totalR >= 0 ? "text-bull" : "text-bear"}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={CircleCheck} label="Avg R" value={avgR} />
              <MetricCard
                icon={AlertTriangle}
                label="Max Drawdown"
                value={maxDrawdown}
                color="text-bear"
              />
              <MetricCard icon={Target} label="Profit Factor" value={profitFactor} />
              <MetricCard icon={Target} label="Sharpe Ratio" value={sharpe} />
            </div>

            {/* Export */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Trades CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportEquityCsv}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Equity CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportEquityPng}>
                <ImgIcon className="w-3.5 h-3.5 mr-1.5" /> Equity PNG
              </Button>
            </div>

            {/* Price Chart with Signals */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <BarChartIcon className="w-4 h-4 text-primary" /> Price Chart with Trade Signals
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div style={{ height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={candles.map((c, i) => {
                        const sig = result.signals.find((s) => s.index === i);
                        return {
                          i,
                          close: c.close,
                          high: c.high,
                          low: c.low,
                          buy: sig && sig.direction === "BUY" ? c.close : null,
                          sell: sig && sig.direction === "SELL" ? c.close : null,
                        };
                      })}
                    >
                      <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" />
                      <XAxis dataKey="i" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <YAxis
                        domain={["dataMin", "dataMax"]}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          fontSize: 11,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke="var(--primary)"
                        dot={false}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                      />
                      <Scatter dataKey="buy" fill="var(--bull)" shape="triangle" />
                      <Scatter dataKey="sell" fill="var(--bear)" shape="triangle" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Equity Curve */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Equity Curve (R-multiples)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={result.equityCurve}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" />
                      <XAxis dataKey="i" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={40} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          fontSize: 11,
                        }}
                      />
                      <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="var(--elite)"
                        fill="var(--elite)"
                        fillOpacity={0.1}
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="equity"
                        stroke="var(--elite)"
                        dot={false}
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Rating Breakdown */}
            <div className="grid md:grid-cols-4 gap-3">
              {Object.entries(result.byRating).map(([r, v]) => (
                <Card key={r}>
                  <CardContent className="p-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                      {r}
                    </div>
                    <div className="text-lg font-bold font-mono">
                      {v.count} <span className="text-xs text-muted-foreground">trades</span>
                    </div>
                    <div className="text-xs">
                      Win: <span className="font-mono">{v.winRate.toFixed(0)}%</span> · Avg R:{" "}
                      <span className="font-mono">{v.avgR.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${v.winRate >= 50 ? "bg-bull" : "bg-bear"}`}
                        style={{ width: `${v.winRate}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Trade Log */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" /> Trade Log
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5">Time</th>
                        <th>Dir</th>
                        <th>Rating</th>
                        <th>Score</th>
                        <th>Entry</th>
                        <th>SL</th>
                        <th>TP3</th>
                        <th>Outcome</th>
                        <th className="text-right">R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.signals
                        .slice()
                        .reverse()
                        .map((s, i) => (
                          <tr
                            key={i}
                            className="border-t border-border/40 hover:bg-accent/20 transition"
                          >
                            <td className="px-2 py-1">
                              {new Date(s.time * 1000).toLocaleString([], {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className={s.direction === "BUY" ? "text-bull" : "text-bear"}>
                              {s.direction === "BUY" ? (
                                <TrendingUp className="w-3 h-3 inline" />
                              ) : (
                                <TrendingDown className="w-3 h-3 inline" />
                              )}{" "}
                              {s.direction}
                            </td>
                            <td>{s.rating}</td>
                            <td>{s.scorePct}</td>
                            <td>{s.entry.toFixed(5)}</td>
                            <td className="text-bear">{s.sl.toFixed(5)}</td>
                            <td className="text-bull">{s.tp3.toFixed(5)}</td>
                            <td
                              className={
                                s.outcome === "SL"
                                  ? "text-bear"
                                  : s.outcome === "OPEN"
                                    ? "text-muted-foreground"
                                    : "text-bull"
                              }
                            >
                              {s.outcome}
                            </td>
                            <td
                              className={`text-right ${s.rMultiple >= 0 ? "text-bull" : "text-bear"}`}
                            >
                              {s.rMultiple.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!result && !err && !busy && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <History className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Configure test parameters and click Run Backtest to begin analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            {label}
          </span>
          <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
        </div>
        <div className={`text-2xl font-bold font-mono ${color || "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
