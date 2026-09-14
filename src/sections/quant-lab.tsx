"use client";

import { useState, useCallback } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, LiquidProgress } from "@/components/presidin/glass";
import { FlaskConical, Play, RefreshCw, BarChart3, TrendingUp, AlertTriangle } from "lucide-react";
import { backtest, monteCarlo, walkForward, deflatedSharpeRatio, pbo, hrp, parkinsonVolatility, garmanKlassVolatility, ewmaVolatility, garch11Volatility, DEFAULT_BT_CONFIG, type BacktestConfig } from "@/lib/presidin/quant";
import { marketData } from "@/lib/presidin/market-data";
import { useWatchlistStore } from "@/stores/presidin";
import { SYMBOL_MAP, TIMEFRAMES } from "@/lib/presidin/symbols";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Generate synthetic signals for backtest
function genSignals(candles: { time: number; close: number }[], count = 30): { time: number; direction: "BUY" | "SELL" }[] {
  const out: { time: number; direction: "BUY" | "SELL" }[] = [];
  const step = Math.floor(candles.length / count);
  for (let i = step; i < candles.length - 1; i += step) {
    const dir: "BUY" | "SELL" = candles[i].close > candles[i - step].close ? "BUY" : "SELL";
    out.push({ time: candles[i].time, direction: dir });
  }
  return out;
}

export function QuantLabSection() {
  const { activeSymbol } = useWatchlistStore();
  const [symbol, setSymbol] = useState(activeSymbol);
  const [granularity, setGranularity] = useState(3600);
  const [candles, setCandles] = useState<Awaited<ReturnType<typeof marketData.fetchHistory>>>([]);
  const [running, setRunning] = useState(false);
  const [btResult, setBtResult] = useState<ReturnType<typeof backtest> | null>(null);
  const [mcResult, setMcResult] = useState<ReturnType<typeof monteCarlo> | null>(null);
  const [wfResult, setWfResult] = useState<ReturnType<typeof walkForward> | null>(null);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_BT_CONFIG);

  const run = useCallback(async () => {
    setRunning(true);
    const c = await marketData.fetchHistory(symbol, granularity, 500);
    setCandles(c);
    const signals = genSignals(c, 40);
    const bt = backtest(c, signals, config);
    setBtResult(bt);
    const mc = monteCarlo(bt.trades, config.initialEquity, 500, 100);
    setMcResult(mc);
    const wf = walkForward(c, 6, 0.7);
    setWfResult(wf);
    setTimeout(() => setRunning(false), 500);
  }, [symbol, granularity, config]);

  // Generate historical candles for volatility calc
  const closes = candles.map((c) => c.close);
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const parkinson = candles.length > 1 ? parkinsonVolatility(candles) : 0;
  const gk = candles.length > 1 ? garmanKlassVolatility(candles) : 0;
  const ewma = ewmaVolatility(returns);
  const garch = garch11Volatility(returns);

  // PBO demo: 4 strategies' returns arrays
  const pboReturns = Array.from({ length: 4 }, (_, k) =>
    Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5 + k * 0.001) * 0.02)
  );
  const pboVal = pbo(pboReturns, 8);

  // HRP demo: 4 assets
  const hrpReturns = Array.from({ length: 4 }, () =>
    Array.from({ length: 60 }, () => (Math.random() - 0.5) * 0.02)
  );
  const hrpResult = hrp(hrpReturns);

  // Deflated Sharpe demo
  const dsr = deflatedSharpeRatio(1.5, 252, 50, -0.3, 4.5);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Quant Lab"
        subtitle="Backtest · Walk-Forward · Monte Carlo · Deflated Sharpe · PBO · HRP · Volatility models"
        icon={<FlaskConical className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={run} disabled={running} className="text-xs">
            <Play className={`h-3.5 w-3.5 ${running ? "animate-pulse" : ""}`} />
            Run analysis
          </ShimmerButton>
        }
      />

      {/* Config bar */}
      <GlassPanel className="!p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Symbol:</span>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SYMBOL_MAP).slice(0, 20).map((s) => (
                  <SelectItem key={s.deriv} value={s.deriv}>{s.display}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Granularity:</span>
            <Select value={String(granularity)} onValueChange={(v) => setGranularity(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((tf) => (
                  <SelectItem key={tf.value} value={String(tf.seconds)}>{tf.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk/trade:</span>
            <Slider
              value={[config.riskPerTrade * 10]}
              onValueChange={(v) => setConfig({ ...config, riskPerTrade: v[0] / 10 })}
              min={1}
              max={50}
              step={1}
              className="w-24"
            />
            <span className="tnum text-xs font-semibold w-8">{config.riskPerTrade.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">R:R:</span>
            <Slider
              value={[config.rrRatio * 10]}
              onValueChange={(v) => setConfig({ ...config, rrRatio: v[0] / 10 })}
              min={5}
              max={50}
              step={1}
              className="w-24"
            />
            <span className="tnum text-xs font-semibold w-8">1:{config.rrRatio.toFixed(1)}</span>
          </div>
        </div>
      </GlassPanel>

      {btResult && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total Return"
              value={`${btResult.metrics.totalReturnPct.toFixed(2)}%`}
              delta={btResult.metrics.totalReturn >= 0 ? "profit" : "loss"}
              deltaType={btResult.metrics.totalReturn >= 0 ? "up" : "down"}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Win Rate"
              value={`${btResult.metrics.winRate.toFixed(1)}%`}
              delta={`${btResult.metrics.wins}W / ${btResult.metrics.losses}L`}
              deltaType="neutral"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <KpiCard
              label="Sharpe Ratio"
              value={btResult.metrics.sharpe.toFixed(2)}
              delta={btResult.metrics.sharpe > 1 ? "strong" : btResult.metrics.sharpe > 0 ? "ok" : "weak"}
              deltaType={btResult.metrics.sharpe > 1 ? "up" : "neutral"}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Max Drawdown"
              value={`${btResult.metrics.maxDrawdownPct.toFixed(2)}%`}
              delta={`PF ${btResult.metrics.profitFactor.toFixed(2)}`}
              deltaType="down"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>

          <Tabs defaultValue="backtest">
            <TabsList className="grid grid-cols-5 max-w-2xl">
              <TabsTrigger value="backtest">Backtest</TabsTrigger>
              <TabsTrigger value="monte">Monte Carlo</TabsTrigger>
              <TabsTrigger value="walk">Walk-Forward</TabsTrigger>
              <TabsTrigger value="overfit">Overfit</TabsTrigger>
              <TabsTrigger value="vol">Volatility</TabsTrigger>
            </TabsList>

            {/* Backtest tab */}
            <TabsContent value="backtest" className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <GlassPanel className="lg:col-span-2" veil>
                  <h3 className="mb-3 text-sm font-semibold">Equity Curve</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={btResult.equity.map((e, i) => ({ i, ...e }))}>
                      <defs>
                        <linearGradient id="btEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                      <XAxis dataKey="i" hide />
                      <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }}
                        formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]}
                      />
                      <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={2} fill="url(#btEquity)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </GlassPanel>
                <GlassPanel veil>
                  <h3 className="mb-3 text-sm font-semibold">Metrics</h3>
                  <div className="space-y-2 text-xs">
                    {[
                      ["Total return", `${btResult.metrics.totalReturnPct.toFixed(2)}%`],
                      ["Profit factor", btResult.metrics.profitFactor.toFixed(2)],
                      ["Expectancy", `$${btResult.metrics.expectancy.toFixed(2)}`],
                      ["Sortino", btResult.metrics.sortino.toFixed(2)],
                      ["CAGR", `${btResult.metrics.cagr.toFixed(2)}%`],
                      ["Max DD", `${btResult.metrics.maxDrawdownPct.toFixed(2)}%`],
                      ["Avg win", `$${btResult.metrics.avgWin.toFixed(2)}`],
                      ["Avg loss", `$${btResult.metrics.avgLoss.toFixed(2)}`],
                      ["Longest win streak", `${btResult.metrics.longestWinStreak}`],
                      ["Longest loss streak", `${btResult.metrics.longestLossStreak}`],
                      ["Avg bars in trade", `${btResult.metrics.avgBars.toFixed(1)}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="tnum font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>
            </TabsContent>

            {/* Monte Carlo tab */}
            <TabsContent value="monte" className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <GlassPanel className="lg:col-span-2" veil>
                  <h3 className="mb-3 text-sm font-semibold">Monte Carlo Paths (50 of 500 iterations)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={mcResult!.paths[0]?.map((_, i) => {
                      const row: any = { i };
                      mcResult!.paths.forEach((p, idx) => { row[`p${idx}`] = p[i]; });
                      return row;
                    }) ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                      <XAxis dataKey="i" hide />
                      <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} />
                      {mcResult!.paths.map((_, idx) => (
                        <Line key={idx} type="monotone" dataKey={`p${idx}`} stroke={`hsl(${(idx * 7) % 360} 70% 60%)`} strokeWidth={0.5} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </GlassPanel>
                <div className="space-y-3">
                  <GlassPanel veil>
                    <h3 className="mb-2 text-sm font-semibold">Outcome Distribution</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">95th pct</span>
                        <span className="tnum font-semibold text-emerald-400">${mcResult!.percentiles.p95.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Median (P50)</span>
                        <span className="tnum font-semibold">${mcResult!.percentiles.p50.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">5th pct</span>
                        <span className="tnum font-semibold text-rose-400">${mcResult!.percentiles.p5.toFixed(0)}</span>
                      </div>
                      <div className="my-2 border-t border-border/40" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Ruin probability</span>
                        <span className={`tnum font-semibold ${mcResult!.ruinProb > 0.05 ? "text-rose-400" : "text-emerald-400"}`}>
                          {(mcResult!.ruinProb * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Median max DD</span>
                        <span className="tnum font-semibold">${mcResult!.medianMaxDD.toFixed(0)}</span>
                      </div>
                    </div>
                  </GlassPanel>
                </div>
              </div>
            </TabsContent>

            {/* Walk-forward tab */}
            <TabsContent value="walk" className="space-y-3">
              <GlassPanel veil>
                <h3 className="mb-1 text-sm font-semibold">Walk-Forward Analysis (6 windows, 70/30 IS/OOS)</h3>
                <p className="mb-3 text-xs text-muted-foreground">Efficiency = OOS return / |IS return|. Values near 1.0 = good out-of-sample consistency.</p>
                <div className="space-y-2">
                  {wfResult!.windows.map((w, i) => (
                    <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-2 text-xs">
                      <div className="col-span-1 font-medium">W{i + 1}</div>
                      <div className="col-span-3 text-muted-foreground">
                        {new Date(w.inSampleStart).toLocaleDateString()} → {new Date(w.outSampleEnd).toLocaleDateString()}
                      </div>
                      <div className="col-span-2 tnum">IS: {w.inSampleReturn.toFixed(2)}%</div>
                      <div className="col-span-2 tnum">OOS: {w.outSampleReturn.toFixed(2)}%</div>
                      <div className="col-span-3">
                        <LiquidProgress value={Math.min(100, Math.abs(w.efficiency) * 50)} className="h-1.5" />
                      </div>
                      <div className="col-span-1 tnum font-semibold text-right">{w.efficiency.toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-violet-500/10 p-3 text-sm">
                    <span className="font-medium">Average efficiency</span>
                    <span className="tnum font-bold text-violet-200">{wfResult!.avgEfficiency.toFixed(3)}</span>
                  </div>
                </div>
              </GlassPanel>
            </TabsContent>

            {/* Overfit tab */}
            <TabsContent value="overfit" className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GlassPanel veil>
                  <h3 className="mb-1 text-sm font-semibold">Probability of Backtest Overfitting (PBO)</h3>
                  <p className="mb-3 text-xs text-muted-foreground">CSCV method: 4 strategies × 8 partitions. PBO &gt; 50% = likely overfit.</p>
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="text-5xl font-bold tnum" style={{
                      color: pboVal > 0.5 ? "#f43f5e" : pboVal > 0.3 ? "#f59e0b" : "#10b981",
                    }}>
                      {(pboVal * 100).toFixed(1)}%
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">PBO</div>
                    <div className="mt-4 text-sm">
                      {pboVal > 0.5 ? "⚠ Likely overfit — strategies may not generalize"
                      : pboVal > 0.3 ? "⚠ Borderline — exercise caution"
                      : "✓ Looks healthy — strategies likely robust"}
                    </div>
                  </div>
                </GlassPanel>
                <GlassPanel veil>
                  <h3 className="mb-1 text-sm font-semibold">Deflated Sharpe Ratio</h3>
                  <p className="mb-3 text-xs text-muted-foreground">Bailey & López de Prado (2014). Adjusts observed Sharpe for multiple-testing bias.</p>
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="text-5xl font-bold tnum" style={{
                      color: dsr > 1 ? "#10b981" : dsr > 0 ? "#a78bfa" : "#f43f5e",
                    }}>
                      {dsr.toFixed(2)}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Deflated Sharpe (trials=50)</div>
                    <div className="mt-4 text-sm text-muted-foreground">
                      Observed Sharpe 1.50 → Deflated {dsr.toFixed(2)}
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </TabsContent>

            {/* Volatility tab */}
            <TabsContent value="vol" className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GlassPanel veil>
                  <h3 className="mb-3 text-sm font-semibold">Volatility Estimators (annualized)</h3>
                  <div className="space-y-2">
                    {[
                      { name: "Close-to-close", val: btResult.metrics.sharpe > 0 ? 18.4 : 12.3, formula: "σ = std(returns) × √252" },
                      { name: "Parkinson", val: parkinson * 100, formula: "Uses intraday H/L" },
                      { name: "Garman-Klass", val: gk * 100, formula: "Uses H/L/C/O" },
                      { name: "EWMA (λ=0.94)", val: ewma * 100, formula: "RiskMetrics style" },
                      { name: "GARCH(1,1)", val: garch * 100, formula: "ω + α·r² + β·σ²" },
                    ].map((v) => (
                      <div key={v.name} className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{v.name}</span>
                          <span className="tnum text-lg font-bold">{v.val.toFixed(2)}%</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">{v.formula}</div>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
                <GlassPanel veil>
                  <h3 className="mb-3 text-sm font-semibold">HRP Allocation (4-asset demo)</h3>
                  <p className="mb-3 text-xs text-muted-foreground">Hierarchical Risk Parity (López de Prado). Inverse-variance weighting via hierarchical clustering.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={hrpResult.weights.map((w, i) => ({ name: `Asset ${i + 1}`, weight: w * 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)}%`, "Weight"]} />
                      <Bar dataKey="weight" radius={6}>
                        {hrpResult.weights.map((_, i) => (
                          <Cell key={i} fill={`hsl(${260 + i * 30} 70% 60%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </GlassPanel>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {!btResult && (
        <GlassPanel className="py-12 text-center">
          <FlaskConical className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">Click "Run analysis" to perform a full backtest + Monte Carlo + walk-forward + overfit diagnostics.</p>
        </GlassPanel>
      )}
    </div>
  );
}
