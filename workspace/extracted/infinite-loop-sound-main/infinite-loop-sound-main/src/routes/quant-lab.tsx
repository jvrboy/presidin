import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deflatedSharpeRatio,
  probabilityOfBacktestOverfitting,
} from "@/tools/backtesting/overfitting-statistics";
import { buildRecoveryPlan, recoveryTable, type RecoveryPlan } from "@/tools/risk/recovery-planner";

export const Route = createFileRoute("/quant-lab")({
  head: () => ({ meta: [{ title: "Quant Lab — DivergenceIQ" }] }),
  component: QuantLabPage,
});

function seededReturns(n: number, seed: number): number[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    out.push(0.0006 + 0.01 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}

function verdictBadge(verdict: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    robust: "default",
    marginal: "secondary",
    likely_overfit: "destructive",
    conservative: "secondary",
    balanced: "default",
    aggressive: "secondary",
    dangerous: "destructive",
  };
  return <Badge variant={map[verdict] ?? "outline"}>{verdict.replace("_", " ")}</Badge>;
}

function QuantLabPage() {
  const [trials, setTrials] = useState(50);
  const [drawdown, setDrawdown] = useState(25);
  const [winRatePct, setWinRatePct] = useState(52);
  const [rewardRisk, setRewardRisk] = useState(1.5);
  const [riskPct, setRiskPct] = useState(4);
  const [pboMatrixSeed, setPboMatrixSeed] = useState(7);

  const dsr = useMemo(
    () => deflatedSharpeRatio(seededReturns(500, 1337), { trials, periodsPerYear: 252 }),
    [trials],
  );

  const pbo = useMemo(() => {
    // Simulate a small parameter-sweep performance matrix (blocks × configs)
    let s = pboMatrixSeed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const blocks = 8;
    const configs = 5;
    const matrix: number[][] = [];
    for (let b = 0; b < blocks; b++) {
      const row: number[] = [];
      for (let c = 0; c < configs; c++) {
        row.push((rand() - 0.45) * 0.02 + (c === 0 ? 0.003 : 0));
      }
      matrix.push(row);
    }
    return probabilityOfBacktestOverfitting(matrix);
  }, [pboMatrixSeed]);

  const plan: RecoveryPlan = buildRecoveryPlan(
    drawdown,
    winRatePct / 100,
    rewardRisk,
    riskPct / 100,
  );
  const table = recoveryTable();

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold">Quant Lab</h1>
          <p className="text-muted-foreground text-sm">
            Research-grade statistics for strategy validation and drawdown recovery.
          </p>
        </div>

        {/* Deflated Sharpe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Deflated Sharpe Ratio
              {verdictBadge(dsr.verdict)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">Observed SR</div>
                <div className="text-lg font-semibold">{dsr.observedSharpe.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">P(True SR &gt; 0)</div>
                <div className="text-lg font-semibold">
                  {(dsr.deflatedSharpeProbability * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Expected Max SR</div>
                <div className="text-lg font-semibold">{dsr.expectedMaxSharpe.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Trials</div>
                <div className="text-lg font-semibold">{dsr.effectiveTrialsUsed}</div>
              </div>
            </div>
            <label className="text-sm font-medium">
              Strategy trials tried before selecting this one: {trials}
            </label>
            <Slider
              min={1}
              max={5000}
              step={1}
              value={[trials]}
              onValueChange={(v) => setTrials(v[0])}
            />
            <p className="text-muted-foreground text-xs">
              The more configurations you tested, the higher the bar the surviving backtest must
              clear. This is the Bailey/López de Prado multiple-testing correction.
            </p>
          </CardContent>
        </Card>

        {/* PBO */}
        <Card>
          <CardHeader>
            <CardTitle>Probability of Backtest Overfitting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-muted-foreground text-xs">PBO</div>
                <div
                  className={`text-lg font-semibold ${
                    pbo.pbo > 0.5 ? "text-red-500" : "text-emerald-500"
                  }`}
                >
                  {(pbo.pbo * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Logit Range</div>
                <div className="text-lg font-semibold">{pbo.logitRange.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Combinations</div>
                <div className="text-lg font-semibold">{pbo.combinationsTested}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPboMatrixSeed((s) => s + 1)}>
              Re-run combinatorial split
            </Button>
          </CardContent>
        </Card>

        {/* Recovery planner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Drawdown Recovery Planner
              {verdictBadge(plan.verdict)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Drawdown: {drawdown}%</label>
                <Slider
                  min={0}
                  max={95}
                  step={1}
                  value={[drawdown]}
                  onValueChange={(v) => setDrawdown(v[0])}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Win rate: {winRatePct}%</label>
                <Slider
                  min={20}
                  max={90}
                  step={1}
                  value={[winRatePct]}
                  onValueChange={(v) => setWinRatePct(v[0])}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reward:risk: {rewardRisk.toFixed(1)}</label>
                <Slider
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={[rewardRisk]}
                  onValueChange={(v) => setRewardRisk(v[0])}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Risk per trade: {riskPct}%</label>
                <Slider
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={[riskPct]}
                  onValueChange={(v) => setRiskPct(v[0])}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">Gain required</div>
                <div className="text-lg font-semibold text-amber-500">
                  {drawdown > 0 ? `${((100 / (100 - drawdown) - 1) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Trades to recover (exp.)</div>
                <div className="text-lg font-semibold">
                  {Number.isFinite(plan.expectedTradesToRecover)
                    ? plan.expectedTradesToRecover.toFixed(0)
                    : "∞"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Ruin probability</div>
                <div className="text-lg font-semibold text-red-500">
                  {(plan.ruinProbability * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Kelly optimum</div>
                <div className="text-lg font-semibold">
                  {(
                    Math.max(
                      0,
                      ((winRatePct / 100) * rewardRisk - (1 - winRatePct / 100)) / rewardRisk,
                    ) * 100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            <ul className="space-y-1">
              {plan.notes.map((n, i) => (
                <li key={i} className="text-muted-foreground text-sm">
                  • {n}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Recovery reference table */}
        <Card>
          <CardHeader>
            <CardTitle>Required Gain Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drawdown</TableHead>
                  <TableHead>Gain needed to recover</TableHead>
                  <TableHead>Asymmetry ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((row) => (
                  <TableRow key={row.drawdown}>
                    <TableCell>{row.drawdown}%</TableCell>
                    <TableCell className="font-medium">{row.requiredGain.toFixed(1)}%</TableCell>
                    <TableCell>{(row.requiredGain / row.drawdown).toFixed(2)}×</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
