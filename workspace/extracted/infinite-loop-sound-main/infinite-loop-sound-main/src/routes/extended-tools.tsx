import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid, MeterBar } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calculator,
  TrendingUp,
  Shield,
  Activity,
  Target,
  DollarSign,
  Percent,
  Gauge,
  Layers,
  Zap,
  Award,
  AlertTriangle,
} from "lucide-react";
import {
  calcPivots,
  calcPositionSize,
  calcKellyCriterion,
  calcRiskOfRuin,
  getActiveSessions,
  getSessionOverlap,
  TRADING_SESSIONS,
  calcCurrencyStrength,
  calcFibonacci,
  calcPipValue,
  calcDrawdown,
  calcZScore,
  calcSharpeRatio,
  calcProfitFactor,
  type PivotSet,
} from "@/lib/engine/extended-tools";

export const Route = createFileRoute("/extended-tools")({
  head: () => ({
    meta: [
      { title: "Extended Trading Tools — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional trading calculators: pivots, position sizing, Kelly criterion, risk of ruin, Fibonacci, Sharpe ratio, and more.",
      },
    ],
  }),
  component: ExtendedToolsPage,
});

function ExtendedToolsPage() {
  const [high, setHigh] = useState(1.105);
  const [low, setLow] = useState(1.095);
  const [close, setClose] = useState(1.1);
  const [pivotMethod, setPivotMethod] = useState<
    "classic" | "fibonacci" | "camarilla" | "woodie" | "demark"
  >("classic");
  const [pivots, setPivots] = useState<PivotSet | null>(null);

  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(1.1);
  const [stopLoss, setStopLoss] = useState(1.095);
  const [positionSize, setPositionSize] = useState<{
    lots: number;
    units: number;
    riskAmount: number;
    pipDistance: number;
  } | null>(null);

  const [winRate, setWinRate] = useState(55);
  const [avgWin, setAvgWin] = useState(200);
  const [avgLoss, setAvgLoss] = useState(150);
  const [kelly, setKelly] = useState(0);

  const [rorWinRate, setRorWinRate] = useState(55);
  const [rorRisk, setRorRisk] = useState(1);
  const [rorRatio, setRorRatio] = useState(1.3);
  const [riskOfRuin, setRiskOfRuin] = useState(0);

  const [fibHigh, setFibHigh] = useState(1.11);
  const [fibLow, setFibLow] = useState(1.09);
  const [fibLevels, setFibLevels] = useState<{ level: number; price: number }[]>([]);

  const [sharpeReturns, setSharpeReturns] = useState(
    "0.02, 0.01, -0.005, 0.03, 0.015, -0.01, 0.025, 0.02",
  );
  const [sharpeResult, setSharpeResult] = useState(0);

  const [pfProfits, setPfProfits] = useState("200, 150, -100, 300, -50, 250, -120, 180");
  const [pfResult, setPfResult] = useState<{
    profitFactor: number;
    expectancy: number;
    totalProfit: number;
    totalLoss: number;
  } | null>(null);

  const calcPivotsNow = () => setPivots(calcPivots(high, low, close, pivotMethod));
  const calcPosSizeNow = () => setPositionSize(calcPositionSize(balance, riskPct, entry, stopLoss));
  const calcKellyNow = () => setKelly(calcKellyCriterion(winRate / 100, avgWin, avgLoss));
  const calcRorNow = () => setRiskOfRuin(calcRiskOfRuin(rorWinRate / 100, rorRisk, rorRatio));
  const calcFibNow = () => setFibLevels(calcFibonacci(fibHigh, fibLow));
  const calcSharpeNow = () => {
    const returns = sharpeReturns
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    setSharpeResult(calcSharpeRatio(returns));
  };
  const calcPfNow = () => {
    const pnls = pfProfits
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    setPfResult(calcProfitFactor(pnls.map((pnl) => ({ pnl }))));
  };

  const utcHour = new Date().getUTCHours();
  const activeSessions = getActiveSessions(utcHour);
  const overlaps = getSessionOverlap(utcHour);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Extended Trading Tools"
          subtitle="12 professional calculators for risk management, analysis, and strategy validation."
          icon={<Calculator className="w-5 h-5" />}
        />

        {/* Session Heatmap */}
        <ProCard
          title="Trading Sessions"
          description={`Current UTC hour: ${utcHour}:00`}
          icon={<Activity className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TRADING_SESSIONS.map((session) => {
              const active = activeSessions.some((s) => s.name === session.name);
              return (
                <div
                  key={session.name}
                  className={`rounded-lg border p-3 transition-all ${active ? "border-primary bg-primary/10" : "border-border bg-card opacity-60"}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: session.color, opacity: active ? 1 : 0.3 }}
                    />
                    <span className="text-sm font-semibold">{session.name}</span>
                    {active && (
                      <Badge variant="outline" className="text-[9px]">
                        LIVE
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    {session.openUTC}:00 - {session.closeUTC}:00 UTC
                  </p>
                </div>
              );
            })}
          </div>
          {overlaps.length > 1 && (
            <div className="mt-3">
              <Badge variant="default" className="gap-1">
                <Zap className="w-3 h-3" /> Overlap: {overlaps.join(" + ")}
              </Badge>
            </div>
          )}
        </ProCard>

        {/* Pivot Points */}
        <ProCard
          title="Pivot Points Calculator"
          description="Support and resistance levels using 5 methods"
          icon={<Layers className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div>
              <Label className="text-xs">High</Label>
              <Input
                type="number"
                step="0.0001"
                value={high}
                onChange={(e) => setHigh(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Low</Label>
              <Input
                type="number"
                step="0.0001"
                value={low}
                onChange={(e) => setLow(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Close</Label>
              <Input
                type="number"
                step="0.0001"
                value={close}
                onChange={(e) => setClose(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <select
                value={pivotMethod}
                onChange={(e) => setPivotMethod(e.target.value as any)}
                className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
              >
                <option value="classic">Classic</option>
                <option value="fibonacci">Fibonacci</option>
                <option value="camarilla">Camarilla</option>
                <option value="woodie">Woodie</option>
                <option value="demark">DeMark</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={calcPivotsNow} className="w-full">
                Calculate
              </Button>
            </div>
          </div>
          {pivots && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { label: "R4", value: pivots.r4, color: "text-bear" },
                { label: "R3", value: pivots.r3, color: "text-bear" },
                { label: "R2", value: pivots.r2, color: "text-warning" },
                { label: "R1", value: pivots.r1, color: "text-warning" },
                { label: "PP", value: pivots.pp, color: "text-primary" },
                { label: "S1", value: pivots.s1, color: "text-bull" },
                { label: "S2", value: pivots.s2, color: "text-bull" },
                { label: "S3", value: pivots.s3, color: "text-bull" },
                { label: "S4", value: pivots.s4, color: "text-bull" },
              ].map((level) => (
                <div
                  key={level.label}
                  className="rounded border border-border bg-card p-2 text-center"
                >
                  <p className="text-[10px] text-muted-foreground">{level.label}</p>
                  <p className={`text-sm font-mono font-bold ${level.color}`}>
                    {level.value.toFixed(5)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ProCard>

        {/* Position Size */}
        <ProCard
          title="Position Size Calculator"
          description="Calculate optimal lot size based on risk"
          icon={<Target className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div>
              <Label className="text-xs">Balance ($)</Label>
              <Input
                type="number"
                value={balance}
                onChange={(e) => setBalance(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Risk (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Entry</Label>
              <Input
                type="number"
                step="0.0001"
                value={entry}
                onChange={(e) => setEntry(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Stop Loss</Label>
              <Input
                type="number"
                step="0.0001"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={calcPosSizeNow} className="w-full">
                Calculate
              </Button>
            </div>
          </div>
          {positionSize && (
            <KpiGrid
              tiles={[
                {
                  label: "Lot Size",
                  value: positionSize.lots.toFixed(2),
                  sub: "standard lots",
                  icon: <Layers className="w-4 h-4" />,
                  accent: "primary",
                },
                {
                  label: "Units",
                  value: positionSize.units.toLocaleString(),
                  sub: "units",
                  icon: <DollarSign className="w-4 h-4" />,
                  accent: "neutral",
                },
                {
                  label: "Risk Amount",
                  value: `$${positionSize.riskAmount.toFixed(2)}`,
                  sub: `${riskPct}% of balance`,
                  icon: <Shield className="w-4 h-4" />,
                  accent: "warning",
                },
                {
                  label: "Pip Distance",
                  value: positionSize.pipDistance.toFixed(1),
                  sub: "pips",
                  icon: <Gauge className="w-4 h-4" />,
                  accent: "neutral",
                },
              ]}
            />
          )}
        </ProCard>

        {/* Kelly Criterion */}
        <ProCard
          title="Kelly Criterion"
          description="Optimal position sizing based on edge"
          icon={<TrendingUp className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs">Win Rate (%)</Label>
              <Input
                type="number"
                value={winRate}
                onChange={(e) => setWinRate(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Avg Win ($)</Label>
              <Input
                type="number"
                value={avgWin}
                onChange={(e) => setAvgWin(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Avg Loss ($)</Label>
              <Input
                type="number"
                value={avgLoss}
                onChange={(e) => setAvgLoss(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={calcKellyNow} className="w-full">
                Calculate
              </Button>
            </div>
          </div>
          {kelly > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Optimal Risk per Trade</span>
                <span className="text-2xl font-bold text-primary">{(kelly * 100).toFixed(1)}%</span>
              </div>
              <MeterBar value={kelly * 100} color="primary" showValue />
              <p className="text-xs text-muted-foreground">
                Half-Kelly ({(kelly * 50).toFixed(1)}%) is recommended for reduced variance.
              </p>
            </div>
          )}
        </ProCard>

        {/* Risk of Ruin */}
        <ProCard
          title="Risk of Ruin"
          description="Monte Carlo simulation of account blow-up probability"
          icon={<AlertTriangle className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs">Win Rate (%)</Label>
              <Input
                type="number"
                value={rorWinRate}
                onChange={(e) => setRorWinRate(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Risk/Trade (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={rorRisk}
                onChange={(e) => setRorRisk(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Win/Loss Ratio</Label>
              <Input
                type="number"
                step="0.1"
                value={rorRatio}
                onChange={(e) => setRorRatio(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={calcRorNow} className="w-full">
                Simulate
              </Button>
            </div>
          </div>
          {riskOfRuin > 0 && (
            <div
              className={`rounded-lg border p-4 ${riskOfRuin < 1 ? "border-bull/30 bg-bull/10" : "border-bear/30 bg-bear/10"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Probability of Ruin</span>
                <span
                  className={`text-3xl font-bold ${riskOfRuin < 1 ? "text-bull" : "text-bear"}`}
                >
                  {riskOfRuin.toFixed(2)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {riskOfRuin < 1
                  ? "Very low risk of ruin. Strategy is sustainable."
                  : riskOfRuin < 5
                    ? "Moderate risk. Consider reducing position size."
                    : "High risk of ruin. Reduce risk per trade."}
              </p>
            </div>
          )}
        </ProCard>

        {/* Fibonacci */}
        <ProCard
          title="Fibonacci Retracement"
          description="Key retracement levels"
          icon={<Percent className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div>
              <Label className="text-xs">Swing High</Label>
              <Input
                type="number"
                step="0.0001"
                value={fibHigh}
                onChange={(e) => setFibHigh(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Swing Low</Label>
              <Input
                type="number"
                step="0.0001"
                value={fibLow}
                onChange={(e) => setFibLow(parseFloat(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={calcFibNow} className="w-full">
                Calculate
              </Button>
            </div>
          </div>
          {fibLevels.length > 0 && (
            <div className="space-y-1">
              {fibLevels.map((fl) => (
                <div
                  key={fl.level}
                  className="flex items-center justify-between rounded border border-border bg-card px-3 py-1.5"
                >
                  <span className="text-xs font-mono text-muted-foreground">
                    {fl.level.toFixed(1)}%
                  </span>
                  <span
                    className={`text-sm font-mono font-bold ${fl.level > 0.5 ? "text-bull" : "text-warning"}`}
                  >
                    {fl.price.toFixed(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ProCard>

        {/* Sharpe Ratio */}
        <ProCard
          title="Sharpe Ratio"
          description="Risk-adjusted return measurement"
          icon={<Award className="w-4 h-4" />}
        >
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Returns (comma-separated, as decimals)</Label>
              <Input
                value={sharpeReturns}
                onChange={(e) => setSharpeReturns(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={calcSharpeNow}>Calculate</Button>
            {sharpeResult !== 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                <span
                  className={`text-2xl font-bold ${sharpeResult > 1 ? "text-bull" : sharpeResult > 0 ? "text-warning" : "text-bear"}`}
                >
                  {sharpeResult.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </ProCard>

        {/* Profit Factor */}
        <ProCard
          title="Profit Factor"
          description="Gross profit divided by gross loss"
          icon={<DollarSign className="w-4 h-4" />}
        >
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Trade P&Ls (comma-separated)</Label>
              <Input
                value={pfProfits}
                onChange={(e) => setPfProfits(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={calcPfNow}>Calculate</Button>
            {pfResult && (
              <KpiGrid
                tiles={[
                  {
                    label: "Profit Factor",
                    value: pfResult.profitFactor.toFixed(2),
                    sub: pfResult.profitFactor > 1.5 ? "Good" : "Needs improvement",
                    accent: pfResult.profitFactor > 1.5 ? "bull" : "warning",
                  },
                  {
                    label: "Expectancy",
                    value: `$${pfResult.expectancy.toFixed(2)}`,
                    sub: "per trade",
                    accent: pfResult.expectancy > 0 ? "bull" : "bear",
                  },
                  {
                    label: "Total Profit",
                    value: `$${pfResult.totalProfit.toFixed(0)}`,
                    accent: "bull",
                  },
                  {
                    label: "Total Loss",
                    value: `$${pfResult.totalLoss.toFixed(0)}`,
                    accent: "bear",
                  },
                ]}
              />
            )}
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}
