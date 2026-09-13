import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Calculator } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/kelly-criterion")({
  head: () => ({ meta: [{ title: "Kelly Criterion — DivergenceIQ" }] }),
  component: KellyPage,
});

function KellyPage() {
  const [winRate, setWinRate] = useState(55);
  const [avgWin, setAvgWin] = useState(200);
  const [avgLoss, setAvgLoss] = useState(150);
  const [bankroll, setBankroll] = useState(10000);
  const [fraction, setFraction] = useState(50);

  const result = useMemo(() => {
    const p = winRate / 100;
    const q = 1 - p;
    const b = avgWin / avgLoss;
    const kelly = (b * p - q) / b;
    const kellyPct = kelly * 100;
    const fractionalKelly = kelly * (fraction / 100);
    const fractionalPct = fractionalKelly * 100;
    const optimalBet = bankroll * kelly;
    const fractionalBet = bankroll * fractionalKelly;
    const edge = kelly > 0;

    const scenarios = [25, 50, 75, 100].map((f) => {
      const bet = bankroll * kelly * (f / 100);
      return { fraction: f, bet, pct: kelly * f };
    });

    return {
      kelly,
      kellyPct,
      fractionalKelly,
      fractionalPct,
      optimalBet,
      fractionalBet,
      edge,
      scenarios,
    };
  }, [winRate, avgWin, avgLoss, bankroll, fraction]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" /> Kelly Criterion
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Optimal position sizing based on win rate and payoff ratio. Prevents over-leveraging
            while maximizing geometric growth.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Win Rate: {winRate}%</label>
              <input
                type="range"
                min="1"
                max="99"
                value={winRate}
                onChange={(e) => setWinRate(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Avg Win ($)</label>
              <input
                type="number"
                value={avgWin}
                onChange={(e) => setAvgWin(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Avg Loss ($)</label>
              <input
                type="number"
                value={avgLoss}
                onChange={(e) => setAvgLoss(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Bankroll ($)</label>
              <input
                type="number"
                value={bankroll}
                onChange={(e) => setBankroll(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Kelly Fraction: {fraction}%</label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={fraction}
                onChange={(e) => setFraction(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div
              className={`bg-card border-2 rounded-lg p-6 text-center ${result.edge ? "border-bull/50" : "border-bear/50"}`}
            >
              <div className="text-[10px] text-muted-foreground uppercase">
                {result.edge ? "Full Kelly" : "No Edge"}
              </div>
              <div
                className={`font-mono font-bold text-4xl mt-2 ${result.edge ? "text-bull" : "text-bear"}`}
              >
                {result.kellyPct.toFixed(2)}%
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {result.edge
                  ? `Optimal bet: $${result.optimalBet.toFixed(2)}`
                  : "Negative Kelly — do not trade this system"}
              </div>
            </div>

            {result.edge && (
              <>
                <div className="bg-card border border-primary/40 rounded-lg p-6 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {fraction}% Kelly
                  </div>
                  <div className="font-mono font-bold text-3xl mt-2 text-primary">
                    {result.fractionalPct.toFixed(2)}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Bet size: ${result.fractionalBet.toFixed(2)}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 p-3 border-b border-border font-semibold text-sm">
                    Fractional Kelly Comparison
                  </div>
                  <div className="divide-y divide-border">
                    {result.scenarios.map((s) => (
                      <div
                        key={s.fraction}
                        className={`p-3 flex justify-between items-center ${s.fraction === fraction ? "bg-primary/10" : ""}`}
                      >
                        <span className="font-medium text-sm">{s.fraction}% Kelly</span>
                        <div className="flex gap-6 font-mono text-sm">
                          <span>{(s.pct * 100).toFixed(2)}%</span>
                          <span className="font-bold">${s.bet.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="bg-card border border-border rounded-lg p-4 text-sm">
              <div className="font-semibold mb-2">Payoff Ratio</div>
              <div className="font-mono text-lg">{(avgWin / avgLoss).toFixed(3)} : 1</div>
              <p className="text-xs text-muted-foreground mt-2">
                {result.edge
                  ? "Your system has a positive edge. Full Kelly maximizes growth but has high variance. Most professionals use 25-50% Kelly for smoother equity curves."
                  : "Your system has no edge with these parameters. Either improve your win rate or payoff ratio before trading."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
