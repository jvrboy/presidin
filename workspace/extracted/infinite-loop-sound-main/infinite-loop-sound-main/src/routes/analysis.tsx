import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useCallback, useRef } from "react";
import { deriv, TIMEFRAMES, displayPair, type TF } from "@/lib/engine/deriv";
import { analyze, type AnalysisResult } from "@/lib/engine/signal";
import {
  Loader,
  Activity,
  Sparkles,
  RefreshCcw,
  Eye,
  EyeOff,
  Zap,
  TrendingUp,
  TrendingDown,
  BarChart,
  Layers,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Timer,
  CircleDot,
  Brain,
  Gauge,
  ChevronDown,
  ChevronUp,
  LineChart,
  Signal,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAI, aiAnalyze, buildAIPrompt, type AIVerdict } from "@/lib/ai/client";
import { AssetSelect } from "@/components/app/AssetSelect";
import { useSettings } from "@/hooks/use-settings";
import { useServerFn } from "@tanstack/react-start";
import { calibrationWeights } from "@/lib/validations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { toast } from "sonner";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Deep Analysis — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional multi-timeframe divergence analysis with AI confluence, EMA structure, and real-time charting.",
      },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const [pair, setPair] = useState("frxEURUSD");
  const [results, setResults] = useState<Record<TF, AnalysisResult | null>>({} as any);
  const [loading, setLoading] = useState(false);
  const [ai, setAi] = useState<Record<string, AIVerdict | null>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string | null>>({});
  const [showChart, setShowChart] = useState(true);
  const [expandedTF, setExpandedTF] = useState<TF | null>(null);
  const aiCfg = typeof window !== "undefined" ? loadAI() : null;
  const { settings, update } = useSettings();
  const fetchWeights = useServerFn(calibrationWeights);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<{ chart: IChartApi; candle: ISeriesApi<"Candlestick"> } | null>(null);

  useEffect(() => {
    fetchWeights()
      .then((r) => setWeights(r.weights || {}))
      .catch(() => {});
  }, [fetchWeights]);

  const runAI = async (tf: TF, r: AnalysisResult) => {
    if (!aiCfg) return;
    setAiLoading((s) => ({ ...s, [tf]: true }));
    setAiError((s) => ({ ...s, [tf]: null }));
    try {
      const v = await aiAnalyze(
        aiCfg,
        buildAIPrompt({
          pair,
          timeframe: tf,
          direction: r.direction,
          scorePct: r.scorePct,
          rating: r.rating,
          confluence: (r.confluence || []).map((c) => ({ label: c.label, passed: c.passed })),
          divergences: r.divergences.map((d) => d.name),
        }),
      );
      setAi((s) => ({ ...s, [tf]: v }));
      if (!v) setAiError((s) => ({ ...s, [tf]: "AI returned no verdict" }));
    } catch (e: any) {
      setAiError((s) => ({ ...s, [tf]: e?.message || "AI request failed" }));
    } finally {
      setAiLoading((s) => ({ ...s, [tf]: false }));
    }
  };

  const run = useCallback(async () => {
    setLoading(true);
    setResults({} as any);
    setAi({});
    setAiError({});
    try {
      await deriv.connect();
    } catch {}
    const out: Record<string, AnalysisResult | null> = {};
    for (const tf of TIMEFRAMES) {
      try {
        const candles = await deriv.getCandles(pair, tf, 220);
        out[tf] = analyze(pair, tf, candles, { divergenceWeights: weights });
      } catch {
        out[tf] = null;
      }
      setResults({ ...out } as any);
    }
    setLoading(false);
    if (aiCfg && settings.aiConfluenceEnabled) {
      for (const tf of TIMEFRAMES) {
        if (out[tf]) runAI(tf as TF, out[tf]!);
      }
    }
  }, [pair, weights, aiCfg, settings.aiConfluenceEnabled]);

  useEffect(() => {
    run();
  }, [pair, run]);

  // Chart for H4
  const h4Candles = results["H4"]?.candles || [];
  useEffect(() => {
    if (!chartRef.current || !showChart || h4Candles.length < 50) return;
    if (chartApiRef.current) {
      chartApiRef.current.chart.remove();
      chartApiRef.current = null;
    }
    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.05)" },
        horzLines: { color: "rgba(148,163,184,0.06)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(148,163,184,0.15)",
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      height: 300,
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    const cd = h4Candles.map((c) => ({
      time: c.epoch as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candle.setData(cd);
    chart.timeScale().fitContent();
    chartApiRef.current = { chart, candle };
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: chartRef.current!.clientWidth });
    });
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [h4Candles, showChart]);

  const tfList = TIMEFRAMES;
  const summary = tfList.map((tf) => results[tf]).filter(Boolean) as AnalysisResult[];
  const buys = summary.filter((s) => s.trendBias === "BUY").length;
  const sells = summary.filter((s) => s.trendBias === "SELL").length;
  const overall = buys > sells ? "BULLISH" : sells > buys ? "BEARISH" : "NEUTRAL";
  const overallCls =
    overall === "BULLISH"
      ? "text-bull"
      : overall === "BEARISH"
        ? "text-bear"
        : "text-muted-foreground";
  const allDivs = summary.flatMap((s) =>
    s.divergences.map((d) => ({ tf: s.timeframe, ind: d.name, type: d.result.type })),
  );
  const lastH4 = results["H4"];

  const getConfidenceColor = (score: number) => {
    if (score >= 75) return "text-elite";
    if (score >= 55) return "text-bull";
    if (score >= 35) return "text-medium";
    return "text-bear";
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="w-7 h-7 text-primary" /> Deep Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Multi-timeframe divergence + confluence + AI intelligence
            </p>
          </div>
          <div className="flex gap-2">
            <AssetSelect value={pair} onChange={setPair} />
            <Button onClick={run} disabled={loading} variant="outline" size="sm">
              {loading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCcw className="w-4 h-4" />
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowChart(!showChart)}>
              {showChart ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Overall Summary */}
        <Card
          className={`border-l-4 ${overall === "BULLISH" ? "border-l-bull" : overall === "BEARISH" ? "border-l-bear" : "border-l-muted"}`}
        >
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-lg grid place-items-center ${overall === "BULLISH" ? "bg-bull/15" : overall === "BEARISH" ? "bg-bear/15" : "bg-muted"}`}
                >
                  {overall === "BULLISH" ? (
                    <TrendingUp className="w-6 h-6 text-bull" />
                  ) : overall === "BEARISH" ? (
                    <TrendingDown className="w-6 h-6 text-bear" />
                  ) : (
                    <Gauge className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Overall Bias</div>
                  <div className={`text-2xl font-bold font-mono ${overallCls}`}>{overall}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Bullish TFs</div>
                  <div className="text-xl font-bold font-mono text-bull">{buys}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Bearish TFs</div>
                  <div className="text-xl font-bold font-mono text-bear">{sells}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Divergences</div>
                  <div className="text-xl font-bold font-mono text-elite">{allDivs.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">H4 Score</div>
                  <div
                    className={`text-xl font-bold font-mono ${lastH4 ? getConfidenceColor(lastH4.scorePct) : "text-muted-foreground"}`}
                  >
                    {lastH4?.scorePct ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* H4 Chart */}
        {showChart && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-2">
                <LineChart className="w-3.5 h-3.5" /> H4 Candlestick Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div ref={chartRef} className="w-full" />
            </CardContent>
          </Card>
        )}

        {/* MTF Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Multi-Timeframe Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left">TF</th>
                    <th className="px-3 py-2 text-left">Trend</th>
                    <th className="px-3 py-2 text-right">RSI</th>
                    <th className="px-3 py-2 text-right">MACD</th>
                    <th className="px-3 py-2 text-right">STOCH</th>
                    <th className="px-3 py-2 text-right">RVI</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">Direction</th>
                    <th className="px-3 py-2 text-center">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {tfList.map((tf) => {
                    const r = results[tf];
                    if (!r)
                      return (
                        <tr key={tf} className="border-t border-border">
                          <td className="px-3 py-2 font-mono font-bold">{tf}</td>
                          <td colSpan={8} className="px-3 py-2 text-muted-foreground text-xs">
                            {loading ? "loading..." : "—"}
                          </td>
                        </tr>
                      );
                    const last = r.candles.length - 1;
                    const rsiV = r.ind.rsi[last] as number | null;
                    const macdH = r.ind.macd.hist[last] as number | null;
                    const stochK = r.ind.stoch.k[last] as number | null;
                    const rviV = r.ind.rvi.rvi[last] as number | null;
                    const rviS = r.ind.rvi.signal[last] as number | null;
                    const isExpanded = expandedTF === tf;
                    return (
                      <>
                        <tr
                          key={tf}
                          className="border-t border-border hover:bg-accent/20 cursor-pointer transition"
                          onClick={() => setExpandedTF(isExpanded ? null : tf)}
                        >
                          <td className="px-3 py-2 font-bold">{tf}</td>
                          <td
                            className={`px-3 py-2 ${r.trendBias === "BUY" ? "text-bull" : r.trendBias === "SELL" ? "text-bear" : "text-muted-foreground"}`}
                          >
                            {r.trendBias === "BUY" ? (
                              <ArrowUpRight className="w-3.5 h-3.5 inline mr-1" />
                            ) : r.trendBias === "SELL" ? (
                              <ArrowDownRight className="w-3.5 h-3.5 inline mr-1" />
                            ) : null}
                            {r.trendBias}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {rsiV != null ? rsiV.toFixed(1) : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${(macdH ?? 0) > 0 ? "text-bull" : "text-bear"}`}
                          >
                            {(macdH ?? 0) > 0 ? "Bull" : "Bear"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${(stochK ?? 50) > 50 ? "text-bull" : "text-bear"}`}
                          >
                            {stochK != null ? stochK.toFixed(1) : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${rviV != null && rviS != null ? (rviV > rviS ? "text-bull" : "text-bear") : "text-muted-foreground"}`}
                          >
                            {rviV != null && rviS != null ? (rviV > rviS ? "+" : "-") : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-bold font-mono ${getConfidenceColor(r.scorePct)}`}
                          >
                            {r.scorePct}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-bold ${r.direction === "BUY" ? "text-bull" : r.direction === "SELL" ? "text-bear" : "text-muted-foreground"}`}
                          >
                            {r.direction ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 mx-auto text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 mx-auto text-muted-foreground" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={9} className="px-3 py-3">
                              <div className="grid md:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                                    Confluence
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {r.confluence
                                      .filter((c) => c.passed)
                                      .map((c, i) => (
                                        <span
                                          key={i}
                                          className="px-1.5 py-0.5 rounded text-[10px] bg-bull/10 text-bull font-mono border border-bull/20"
                                        >
                                          {c.label}
                                        </span>
                                      ))}
                                    {r.confluence
                                      .filter((c) => !c.passed)
                                      .slice(0, 3)
                                      .map((c, i) => (
                                        <span
                                          key={i}
                                          className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono"
                                        >
                                          {c.label}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                                    Trade Setup
                                  </div>
                                  {r.trade ? (
                                    <div className="text-xs font-mono space-y-0.5">
                                      <div>
                                        Entry:{" "}
                                        <span className="font-bold">
                                          {r.trade.entry.toFixed(5)}
                                        </span>
                                      </div>
                                      <div className="text-bear">SL: {r.trade.sl.toFixed(5)}</div>
                                      <div className="text-bull">
                                        TP3: {r.trade.tp3.toFixed(5)} (R:R 1:{r.trade.rr.toFixed(1)}
                                        )
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">
                                      No trade setup
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Divergences & EMA Structure */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Active Divergences
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {allDivs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No divergences detected across timeframes.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {allDivs.map((d, i) => {
                    const isBull = d.type?.toLowerCase().includes("bull");
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0 text-xs font-mono"
                      >
                        <span className="text-muted-foreground">
                          {d.tf} / {d.ind}
                        </span>
                        <span className={isBull ? "text-bull font-bold" : "text-bear font-bold"}>
                          {d.type?.replace("_", " ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <BarChart className="w-4 h-4 text-primary" /> EMA Structure (H4)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!lastH4 ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : (
                <div className="space-y-1.5 text-xs font-mono">
                  {([8, 21, 50, 200] as const).map((p) => {
                    const v = (lastH4.ind as any)[`ema${p}`][lastH4.candles.length - 1] as
                      | number
                      | null;
                    const close = lastH4.candles[lastH4.candles.length - 1].close;
                    const above = v != null && close > v;
                    return (
                      <div
                        key={p}
                        className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0"
                      >
                        <span className="text-muted-foreground">EMA {p}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-foreground">{v != null ? v.toFixed(5) : "—"}</span>
                          <span className={above ? "text-bull font-bold" : "text-bear font-bold"}>
                            {above ? "ABOVE" : "BELOW"}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Summary */}
        {lastH4 && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm leading-relaxed">
                <strong>{displayPair(pair)}</strong> shows{" "}
                <span className={overallCls}>{overall.toLowerCase()}</span> bias across{" "}
                <strong>
                  {Math.max(buys, sells)}/{summary.length}
                </strong>{" "}
                timeframes. Detected <strong>{allDivs.length}</strong> divergence
                {allDivs.length === 1 ? "" : "s"}.{" "}
                {lastH4.trade ? (
                  <>
                    H4 setup suggests a{" "}
                    <strong className={lastH4.direction === "BUY" ? "text-bull" : "text-bear"}>
                      {lastH4.direction}
                    </strong>{" "}
                    at <span className="font-mono">{lastH4.trade.entry.toFixed(5)}</span> with TP3
                    at <span className="font-mono text-bull">{lastH4.trade.tp3.toFixed(5)}</span>{" "}
                    and invalidation at{" "}
                    <span className="font-mono text-bear">{lastH4.trade.sl.toFixed(5)}</span> (R:R
                    1:{lastH4.trade.rr.toFixed(1)}, score {lastH4.scorePct}/100).
                  </>
                ) : (
                  "No high-probability H4 trade right now — wait for confluence to build."
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* AI Confluence per TF */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-elite" /> AI Confluence (per timeframe)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update({ aiConfluenceEnabled: !settings.aiConfluenceEnabled })}
              >
                {settings.aiConfluenceEnabled ? (
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                )}
                {settings.aiConfluenceEnabled ? "Visible" : "Hidden"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!settings.aiConfluenceEnabled ? (
              <p className="text-xs text-muted-foreground">
                AI confluence is disabled. Click Visible to show it.
              </p>
            ) : !aiCfg ? (
              <p className="text-xs text-muted-foreground">
                Add an AI key in the Deriv tab to enable independent AI confluence.
              </p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                {tfList.map((tf) => {
                  const r = results[tf];
                  const v = ai[tf];
                  const l = aiLoading[tf];
                  const err = aiError[tf];
                  const cls =
                    v?.direction === "BUY"
                      ? "text-bull"
                      : v?.direction === "SELL"
                        ? "text-bear"
                        : "text-muted-foreground";
                  const agree =
                    r && v && r.direction && v.direction !== "NEUTRAL"
                      ? r.direction === v.direction
                      : null;
                  return (
                    <div key={tf} className="rounded border border-border p-2.5 bg-card/60">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-sm">{tf}</span>
                        {l ? (
                          <Loader className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : v ? (
                          <span className="flex items-center gap-2 font-mono">
                            <span className={cls}>{v.direction}</span>
                            <span className="text-muted-foreground">{v.confidence}%</span>
                            {agree !== null && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${agree ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
                              >
                                {agree ? "AGREES" : "DISAGREES"}
                              </span>
                            )}
                          </span>
                        ) : (
                          <button
                            onClick={() => r && runAI(tf as TF, r)}
                            disabled={!r}
                            className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
                          >
                            <RefreshCcw className="w-3 h-3" /> Retry
                          </button>
                        )}
                      </div>
                      <p
                        className={`text-[11px] leading-snug ${err ? "text-bear" : "text-muted-foreground"}`}
                      >
                        {v?.reasoning ||
                          (l ? "Analyzing..." : err ? `Error: ${err}` : "No verdict yet")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
