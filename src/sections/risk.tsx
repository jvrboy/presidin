"use client";

import { useState } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, LiquidProgress } from "@/components/presidin/glass";
import { Calculator, DollarSign, Target, Shield, TrendingDown } from "lucide-react";
import { positionSize, kellyCriterion, riskOfRuin, fibonacciLevels, pivotPoints, pipValue, drawdownRecovery, sharpeRatio, profitFactor, zScore, type PivotMethod } from "@/lib/presidin/risk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";
import { formatCurrency } from "@/lib/presidin/symbols";

export function RiskSection() {
  const [tab, setTab] = useState("position");

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Risk Calculators"
        subtitle="Position size · Kelly · Risk of Ruin · Fibonacci · Pivots · Pip · Drawdown · Sharpe"
        icon={<Calculator className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 max-w-4xl">
          <TabsTrigger value="position">Size</TabsTrigger>
          <TabsTrigger value="kelly">Kelly</TabsTrigger>
          <TabsTrigger value="ruin">Ruin</TabsTrigger>
          <TabsTrigger value="fib">Fib</TabsTrigger>
          <TabsTrigger value="pivot">Pivots</TabsTrigger>
          <TabsTrigger value="pip">Pip</TabsTrigger>
          <TabsTrigger value="dd">Drawdown</TabsTrigger>
          <TabsTrigger value="sharpe">Sharpe</TabsTrigger>
        </TabsList>

        {/* Position Size */}
        <TabsContent value="position">
          <PositionSizeCalculator />
        </TabsContent>

        {/* Kelly */}
        <TabsContent value="kelly">
          <KellyCalculator />
        </TabsContent>

        {/* Risk of Ruin */}
        <TabsContent value="ruin">
          <RiskOfRuinCalculator />
        </TabsContent>

        {/* Fibonacci */}
        <TabsContent value="fib">
          <FibonacciCalculator />
        </TabsContent>

        {/* Pivots */}
        <TabsContent value="pivot">
          <PivotCalculator />
        </TabsContent>

        {/* Pip value */}
        <TabsContent value="pip">
          <PipValueCalculator />
        </TabsContent>

        {/* Drawdown */}
        <TabsContent value="dd">
          <DrawdownCalculator />
        </TabsContent>

        {/* Sharpe */}
        <TabsContent value="sharpe">
          <SharpeCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PositionSizeCalculator() {
  const [equity, setEquity] = useState(10000);
  const [risk, setRisk] = useState(1.0);
  const [entry, setEntry] = useState(1.0850);
  const [sl, setSl] = useState(1.0820);
  const result = positionSize({ accountEquity: equity, riskPercent: risk, entryPrice: entry, stopLoss: sl });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Account equity ($)" value={equity} onChange={setEquity} step={100} />
          <Field label="Risk per trade (%)" value={risk} onChange={setRisk} step={0.1} min={0.1} max={10} />
          <Field label="Entry price" value={entry} onChange={setEntry} step={0.0001} />
          <Field label="Stop loss" value={sl} onChange={setSl} step={0.0001} />
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Result</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Risk amount" value={formatCurrency(result.riskAmount)} delta={`${risk}% of equity`} deltaType="neutral" icon={<DollarSign className="h-4 w-4" />} />
          <KpiCard label="Pips at risk" value={result.pipsAtRisk.toFixed(1)} delta="distance to SL" deltaType="down" icon={<Target className="h-4 w-4" />} />
          <KpiCard label="Position size" value={`${result.positionSizeLots.toFixed(2)} lots`} delta={`${(result.positionSizeUnits / 1000).toFixed(1)}K units`} deltaType="up" icon={<Calculator className="h-4 w-4" />} />
          <KpiCard label="Position value" value={formatCurrency(result.positionValue)} delta="notional exposure" deltaType="neutral" icon={<DollarSign className="h-4 w-4" />} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Risk utilization</span>
            <span className="tnum font-semibold">{risk}% / 5% max</span>
          </div>
          <LiquidProgress value={(risk / 5) * 100} className="h-2" />
        </div>
      </GlassPanel>
    </div>
  );
}

function KellyCalculator() {
  const [winRate, setWinRate] = useState(0.58);
  const [avgWin, setAvgWin] = useState(150);
  const [avgLoss, setAvgLoss] = useState(100);
  const [fraction, setFraction] = useState(0.5);
  const kelly = kellyCriterion(winRate, avgWin, avgLoss, fraction);
  const fullKelly = kellyCriterion(winRate, avgWin, avgLoss, 1.0);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Win rate (0-1)" value={winRate} onChange={setWinRate} step={0.01} min={0} max={1} />
          <Field label="Avg win ($)" value={avgWin} onChange={setAvgWin} step={10} />
          <Field label="Avg loss ($)" value={avgLoss} onChange={setAvgLoss} step={10} />
          <Field label="Kelly fraction" value={fraction} onChange={setFraction} step={0.1} min={0.1} max={2} />
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Kelly Criterion Result</h3>
        <div className="space-y-3">
          <div className="rounded-lg bg-violet-500/10 p-4 text-center ring-1 ring-violet-500/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Optimal position size</div>
            <div className="mt-1 tnum text-4xl font-bold text-violet-200">{(kelly * 100).toFixed(2)}%</div>
            <div className="mt-1 text-xs text-muted-foreground">{fraction === 0.5 ? "Half Kelly (recommended)" : fraction === 1 ? "Full Kelly (aggressive)" : `${fraction}x Kelly`}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/40 p-2">
              <div className="text-muted-foreground">Full Kelly</div>
              <div className="tnum font-semibold">{(fullKelly * 100).toFixed(2)}%</div>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <div className="text-muted-foreground">Half Kelly</div>
              <div className="tnum font-semibold">{(fullKelly * 50).toFixed(2)}%</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Kelly assumes you know your true edge. In practice, half-Kelly is recommended to reduce variance and protect against parameter uncertainty.</p>
        </div>
      </GlassPanel>
    </div>
  );
}

function RiskOfRuinCalculator() {
  const [winRate, setWinRate] = useState(0.55);
  const [riskPerTrade, setRiskPerTrade] = useState(1.0);
  const [iterations, setIterations] = useState(1000);
  const [result, setResult] = useState<ReturnType<typeof riskOfRuin> | null>(null);
  const [running, setRunning] = useState(false);
  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const r = riskOfRuin({
        winRate,
        avgWin: 1.5,
        avgLoss: 1.0,
        riskPerTrade,
        iterations,
        tradesPerSim: 250,
        ruinThreshold: 50,
      });
      setResult(r);
      setRunning(false);
    }, 200);
  };
  const chartData = result?.pathSample.map((e, i) => ({ i, equity: e })) ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Win rate (0-1)" value={winRate} onChange={setWinRate} step={0.01} min={0} max={1} />
          <Field label="Risk per trade (%)" value={riskPerTrade} onChange={setRiskPerTrade} step={0.1} min={0.1} max={10} />
          <Field label="Iterations" value={iterations} onChange={setIterations} step={100} />
          <ShimmerButton onClick={run} disabled={running} className="w-full">
            {running ? "Simulating…" : "Run Monte Carlo (250 trades × 1000 sims)"}
          </ShimmerButton>
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Result</h3>
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <KpiCard label="Risk of Ruin" value={`${(result.riskOfRuin * 100).toFixed(2)}%`} delta={result.riskOfRuin < 0.05 ? "safe" : "dangerous"} deltaType={result.riskOfRuin < 0.05 ? "up" : "down"} icon={<Shield className="h-4 w-4" />} />
              <KpiCard label="Median equity" value={`${result.medianEquity.toFixed(0)}%`} delta="of starting capital" deltaType={result.medianEquity > 100 ? "up" : "down"} icon={<TrendingDown className="h-4 w-4" />} />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Equity"]} />
                <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "Ruin (50%)", fill: "#f43f5e", fontSize: 10 }} />
                <ReferenceLine y={100} stroke="#a78bfa" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="equity" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Click "Run" to simulate.</div>
        )}
      </GlassPanel>
    </div>
  );
}

function FibonacciCalculator() {
  const [swingHigh, setSwingHigh] = useState(1.1000);
  const [swingLow, setSwingLow] = useState(1.0800);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const levels = fibonacciLevels(swingHigh, swingLow, direction);
  const chartData = levels.map((l) => ({ label: l.label, price: l.price, isExtension: l.isExtension }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Swing high" value={swingHigh} onChange={setSwingHigh} step={0.0001} />
          <Field label="Swing low" value={swingLow} onChange={setSwingLow} step={0.0001} />
          <div>
            <label className="text-xs text-muted-foreground">Direction</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                onClick={() => setDirection("up")}
                className={`rounded-md py-1.5 text-xs font-medium ${direction === "up" ? "bg-emerald-500 text-white" : "bg-secondary/40"}`}
              >Up (retracement down)</button>
              <button
                onClick={() => setDirection("down")}
                className={`rounded-md py-1.5 text-xs font-medium ${direction === "down" ? "bg-rose-500 text-white" : "bg-secondary/40"}`}
              >Down (retracement up)</button>
            </div>
          </div>
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Fibonacci Levels</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" domain={["dataMin - 0.001", "dataMax + 0.001"]} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={80} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [v.toFixed(5), "Price"]} />
            <Bar dataKey="price" radius={6}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.isExtension ? "#f59e0b" : d.label === "50%" ? "#a78bfa" : d.label === "61.8%" ? "#06b6d4" : "#64748b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="text-cyan-400">●</span> Golden zone (61.8%) ·
          <span className="text-violet-400 ml-1">●</span> 50% ·
          <span className="text-amber-400 ml-1">●</span> Extensions
        </div>
      </GlassPanel>
    </div>
  );
}

function PivotCalculator() {
  const [high, setHigh] = useState(1.1020);
  const [low, setLow] = useState(1.0800);
  const [close, setClose] = useState(1.0950);
  const [open, setOpen] = useState(1.0900);
  const [method, setMethod] = useState<PivotMethod>("standard");
  const levels = pivotPoints(high, low, close, open, method);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Previous high" value={high} onChange={setHigh} step={0.0001} />
          <Field label="Previous low" value={low} onChange={setLow} step={0.0001} />
          <Field label="Previous close" value={close} onChange={setClose} step={0.0001} />
          <Field label="Previous open (Demark)" value={open} onChange={setOpen} step={0.0001} />
          <div>
            <label className="text-xs text-muted-foreground">Method</label>
            <Select value={method} onValueChange={(v) => setMethod(v as PivotMethod)}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="fibonacci">Fibonacci</SelectItem>
                <SelectItem value="camarilla">Camarilla</SelectItem>
                <SelectItem value="woodie">Woodie</SelectItem>
                <SelectItem value="demark">Demark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">{method.charAt(0).toUpperCase() + method.slice(1)} Pivot Levels</h3>
        <div className="space-y-1.5">
          {levels.reverse().map((l) => {
            const isResist = l.label.startsWith("R");
            const isSupport = l.label.startsWith("S");
            const isPP = l.label === "PP";
            return (
              <div
                key={l.label}
                className={`flex items-center justify-between rounded-lg p-2 text-xs ${
                  isResist ? "bg-rose-500/10"
                  : isSupport ? "bg-emerald-500/10"
                  : "bg-violet-500/10"
                }`}
              >
                <span className="font-medium">{l.label}</span>
                <span className="tnum font-semibold">{l.price.toFixed(5)}</span>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}

function PipValueCalculator() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [exchangeRate, setExchangeRate] = useState(1.0850);
  const [contractSize, setContractSize] = useState(100000);
  const val = pipValue(symbol, "USD", exchangeRate, contractSize);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm" />
          </div>
          <Field label="Exchange rate (vs account currency)" value={exchangeRate} onChange={setExchangeRate} step={0.0001} />
          <Field label="Contract size (units/lot)" value={contractSize} onChange={setContractSize} step={10000} />
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Pip Value</h3>
        <div className="rounded-lg bg-violet-500/10 p-6 text-center ring-1 ring-violet-500/20">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Per pip per 1.0 lot</div>
          <div className="mt-2 tnum text-4xl font-bold text-violet-200">{formatCurrency(val)}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {symbol.includes("JPY") ? "JPY pair (pip = 0.01)" : "Standard pair (pip = 0.0001)"}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-secondary/40 p-2">
            <div className="text-muted-foreground">0.01 lot</div>
            <div className="tnum font-semibold">{formatCurrency(val * 0.01)}</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2">
            <div className="text-muted-foreground">0.10 lot</div>
            <div className="tnum font-semibold">{formatCurrency(val * 0.10)}</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2">
            <div className="text-muted-foreground">1.00 lot</div>
            <div className="tnum font-semibold">{formatCurrency(val)}</div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function DrawdownCalculator() {
  const [peak, setPeak] = useState(12000);
  const [current, setCurrent] = useState(9500);
  const [dailyRet, setDailyRet] = useState(0.5);
  const r = drawdownRecovery(peak, current, dailyRet);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <Field label="Peak equity ($)" value={peak} onChange={setPeak} step={100} />
          <Field label="Current equity ($)" value={current} onChange={setCurrent} step={100} />
          <Field label="Expected daily return (%)" value={dailyRet} onChange={setDailyRet} step={0.1} />
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Recovery Plan</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Current drawdown" value={`${r.currentDD.toFixed(2)}%`} delta={`${formatCurrency(peak - current)} below peak`} deltaType="down" icon={<TrendingDown className="h-4 w-4" />} />
          <KpiCard label="Required gain" value={`${r.requiredGain.toFixed(2)}%`} delta="to recover to peak" deltaType="up" icon={<Target className="h-4 w-4" />} />
          <KpiCard label="Expected recovery" value={`${r.expectedDays.toFixed(0)} days`} delta={`@ ${dailyRet}%/day`} deltaType="neutral" icon={<Calculator className="h-4 w-4" />} />
          <KpiCard label="In months" value={`${r.expectedMonths.toFixed(1)} mo`} delta="21 trading days/mo" deltaType="neutral" icon={<Calculator className="h-4 w-4" />} />
        </div>
        <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-300">
          <strong>Insight:</strong> Recovering from a {r.currentDD.toFixed(0)}% drawdown requires a {r.requiredGain.toFixed(0)}% gain — disproportionately larger. This is why risk management matters more than returns.
        </div>
      </GlassPanel>
    </div>
  );
}

function SharpeCalculator() {
  const [returnsStr, setReturnsStr] = useState("0.5,0.8,-0.3,1.2,0.4,-0.6,0.9,1.1,-0.2,0.7,0.3,-0.4,0.8,1.0,0.2,-0.1,0.6,0.9,0.3,0.5");
  const [rf, setRf] = useState(2);
  const returns = returnsStr.split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x));
  const sharpe = sharpeRatio(returns, rf / 100);
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r <= 0);
  const pf = profitFactor(wins, losses);
  const z = zScore(returns.map((r) => ({ pnl: r })));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Inputs</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Returns (%) — comma separated</label>
            <textarea
              value={returnsStr}
              onChange={(e) => setReturnsStr(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs tnum"
            />
          </div>
          <Field label="Risk-free rate (%/yr)" value={rf} onChange={setRf} step={0.5} />
        </div>
      </GlassPanel>
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Performance Metrics</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Sharpe Ratio" value={sharpe.toFixed(2)} delta={sharpe > 1 ? "strong" : sharpe > 0.5 ? "ok" : "weak"} deltaType={sharpe > 1 ? "up" : "neutral"} icon={<Calculator className="h-4 w-4" />} />
          <KpiCard label="Profit Factor" value={pf.toFixed(2)} delta={pf > 1.5 ? "good" : "marginal"} deltaType={pf > 1.5 ? "up" : "down"} icon={<DollarSign className="h-4 w-4" />} />
          <KpiCard label="Z-Score" value={z.toFixed(2)} delta={Math.abs(z) > 2 ? "non-random" : "random"} deltaType="neutral" icon={<Target className="h-4 w-4" />} />
          <KpiCard label="Sample size" value={returns.length} delta="trades" deltaType="neutral" icon={<Calculator className="h-4 w-4" />} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Sharpe measures risk-adjusted return. Z-score detects whether win/loss streaks are non-random (|z| &gt; 2 suggests predictability).</p>
      </GlassPanel>
    </div>
  );
}

function Field({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum"
      />
    </div>
  );
}
