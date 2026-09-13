import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { riskOfRuin } from "@/lib/engine/risk-of-ruin";

/**
 * RiskOfRuinCalculator — closed-form RoR + Kelly. Pure UI on top of
 * `engine/risk-of-ruin`. Persists nothing; computes on every input change.
 */
export function RiskOfRuinCalculator() {
  const [winRate, setWinRate] = useState(0.55);
  const [payoff, setPayoff] = useState(1.5);
  const [risk, setRisk] = useState(1);

  const result = useMemo(
    () => riskOfRuin({ winRate, payoffRatio: payoff, riskPerTradePct: risk }),
    [winRate, payoff, risk],
  );

  const tone =
    result.ror < 0.05
      ? "bg-emerald-500/20 text-emerald-300"
      : result.ror < 0.25
        ? "bg-yellow-500/20 text-yellow-300"
        : "bg-red-500/20 text-red-300 animate-pulse";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Risk of Ruin / Kelly</CardTitle>
        <Badge className={tone}>{(result.ror * 100).toFixed(2)}% RoR</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="ror-wr">Win rate</Label>
            <Input
              id="ror-wr"
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={winRate}
              onChange={(e) => setWinRate(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="ror-pay">Payoff (R)</Label>
            <Input
              id="ror-pay"
              type="number"
              step="0.1"
              min={0.1}
              value={payoff}
              onChange={(e) => setPayoff(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="ror-risk">Risk %</Label>
            <Input
              id="ror-risk"
              type="number"
              step="0.1"
              min={0.1}
              value={risk}
              onChange={(e) => setRisk(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Edge / trade</div>
            <div className="font-mono">{result.edge.toFixed(3)} R</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Kelly fraction</div>
            <div className="font-mono">{(result.kellyFraction * 100).toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Half-Kelly risk</div>
            <div className="font-mono">{result.recommendedRiskPct.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Profitable?</div>
            <div className="font-mono">{result.isProfitable ? "yes" : "NO — negative EV"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RiskOfRuinCalculator;
