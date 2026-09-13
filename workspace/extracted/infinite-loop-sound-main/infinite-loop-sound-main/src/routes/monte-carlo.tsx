import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo } from "react";
import {
  runMonteCarlo,
  quickRiskAssessment,
  type MonteCarloResult,
} from "@/lib/engine/monte-carlo";
import { Dices, Play, BarChart, AlertTriangle, TrendingUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/monte-carlo")({
  head: () => ({
    meta: [
      { title: "Monte Carlo Simulator — DivergenceIQ" },
      {
        name: "description",
        content:
          "Run Monte Carlo simulations to stress-test your strategy and estimate probability of ruin.",
      },
    ],
  }),
  component: MonteCarloPage,
});

function MonteCarloPage() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [winRate, setWinRate] = useState(55);
  const [avgRR, setAvgRR] = useState(2.0);
  const [numSims, setNumSims] = useState(1000);
  const [numTrades, setNumTrades] = useState(200);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);

  // Generate synthetic trade history from win rate and avg RR
  const generateTrades = () => {
    const trades: number[] = [];
    for (let i = 0; i < 100; i++) {
      if (Math.random() < winRate / 100) {
        // Win: randomize around avg RR
        trades.push(avgRR * (0.5 + Math.random()));
      } else {
        // Loss: always -1R
        trades.push(-1);
      }
    }
    return trades;
  };

  const runSimulation = () => {
    setRunning(true);
    setTimeout(() => {
      const trades = generateTrades();
      const res = runMonteCarlo({
        trades,
        initialBalance: balance,
        riskPerTrade: riskPct / 100,
        numSimulations: numSims,
        numTrades,
      });
      setResult(res);
      setRunning(false);
    }, 100);
  };

  const quickAssess = useMemo(() => {
    return quickRiskAssessment(winRate / 100, avgRR, riskPct);
  }, [winRate, avgRR, riskPct]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Dices className="w-6 h-6 text-primary" /> Monte Carlo Simulator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stress-test your strategy with {numSims.toLocaleString()} randomized simulations.
            Understand the range of possible outcomes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Input Panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider">Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Initial Balance ($)
                </label>
                <input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Risk Per Trade (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Win Rate (%)
                </label>
                <input
                  type="number"
                  value={winRate}
                  onChange={(e) => setWinRate(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Average Risk:Reward
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={avgRR}
                  onChange={(e) => setAvgRR(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Simulations
                </label>
                <select
                  value={numSims}
                  onChange={(e) => setNumSims(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs mt-0.5"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Trades to Simulate
                </label>
                <input
                  type="number"
                  value={numTrades}
                  onChange={(e) => setNumTrades(Number(e.target.value))}
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono mt-0.5"
                />
              </div>

              <Button onClick={runSimulation} disabled={running} className="w-full mt-2">
                <Play className="w-4 h-4 mr-2" />
                {running ? "Running..." : "Run Simulation"}
              </Button>

              {/* Quick Assessment */}
              <div className="pt-3 border-t border-border space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Quick Assessment
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Expectancy</span>
                  <span
                    className={`font-mono font-semibold ${quickAssess.expectancy > 0 ? "text-bull" : "text-bear"}`}
                  >
                    {quickAssess.expectancy.toFixed(3)}R
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Kelly %</span>
                  <span className="font-mono font-semibold">
                    {quickAssess.kellyPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Ruin Estimate</span>
                  <span
                    className={`font-mono font-semibold ${quickAssess.ruinEstimate > 0.1 ? "text-bear" : "text-bull"}`}
                  >
                    {(quickAssess.ruinEstimate * 100).toFixed(2)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">{quickAssess.verdict}</p>
              </div>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-4">
            {!result ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Dices className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Configure parameters and run the simulation</p>
                  <p className="text-xs mt-1">
                    Results will show probability distributions and risk metrics
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg glass-card text-center">
                    <div className="text-[9px] text-muted-foreground uppercase">Profitable</div>
                    <div
                      className={`text-xl font-bold font-mono ${result.statistics.profitablePct > 60 ? "text-bull" : "text-bear"}`}
                    >
                      {result.statistics.profitablePct.toFixed(0)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg glass-card text-center">
                    <div className="text-[9px] text-muted-foreground uppercase">Ruin Prob</div>
                    <div
                      className={`text-xl font-bold font-mono ${result.ruinProbability > 0.05 ? "text-bear" : "text-bull"}`}
                    >
                      {(result.ruinProbability * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg glass-card text-center">
                    <div className="text-[9px] text-muted-foreground uppercase">Median Equity</div>
                    <div className="text-xl font-bold font-mono text-primary">
                      ${result.percentiles.p50.toFixed(0)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg glass-card text-center">
                    <div className="text-[9px] text-muted-foreground uppercase">Avg Max DD</div>
                    <div className="text-xl font-bold font-mono text-bear">
                      {result.statistics.meanMaxDrawdownPct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Percentile Distribution */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                      <BarChart className="w-4 h-4 text-primary" /> Equity Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {[
                        {
                          label: "Best Case (P95)",
                          value: result.percentiles.p95,
                          color: "bg-bull",
                        },
                        {
                          label: "Optimistic (P75)",
                          value: result.percentiles.p75,
                          color: "bg-bull/60",
                        },
                        {
                          label: "Median (P50)",
                          value: result.percentiles.p50,
                          color: "bg-primary",
                        },
                        {
                          label: "Conservative (P25)",
                          value: result.percentiles.p25,
                          color: "bg-medium",
                        },
                        {
                          label: "Worst Case (P5)",
                          value: result.percentiles.p5,
                          color: "bg-bear",
                        },
                      ].map((p) => (
                        <div key={p.label} className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground w-32">{p.label}</span>
                          <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                            <div
                              className={`h-full ${p.color} rounded transition-all`}
                              style={{
                                width: `${Math.min(100, Math.max(0, (p.value / result.statistics.bestCase) * 100))}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono font-semibold w-20 text-right">
                            ${p.value.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" /> Risk Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.recommendations.map((rec, i) => (
                        <div
                          key={i}
                          className="text-[11px] text-muted-foreground leading-relaxed p-2 rounded bg-muted/20"
                        >
                          {rec}
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                        <div className="p-2 rounded bg-primary/10 text-center">
                          <div className="text-[9px] text-muted-foreground uppercase">
                            Optimal Kelly
                          </div>
                          <div className="text-sm font-mono font-bold text-primary">
                            {(result.optimalKelly * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="p-2 rounded bg-bull/10 text-center">
                          <div className="text-[9px] text-muted-foreground uppercase">
                            Half Kelly (Recommended)
                          </div>
                          <div className="text-sm font-mono font-bold text-bull">
                            {(result.halfKelly * 100).toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Statistics Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm uppercase tracking-wider">
                      Detailed Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                      {[
                        ["Mean Final Equity", `$${result.statistics.meanFinalEquity.toFixed(0)}`],
                        ["Std Deviation", `$${result.statistics.stdDevFinalEquity.toFixed(0)}`],
                        ["Best Simulation", `$${result.statistics.bestCase.toFixed(0)}`],
                        ["Worst Simulation", `$${result.statistics.worstCase.toFixed(0)}`],
                        [
                          "Recovery Factor",
                          result.statistics.meanMaxDrawdown > 0
                            ? (
                                result.statistics.meanFinalEquity /
                                result.statistics.meanMaxDrawdown
                              ).toFixed(2)
                            : "N/A",
                        ],
                        ["Simulations Run", numSims.toLocaleString()],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex justify-between py-1 border-b border-border/50"
                        >
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
