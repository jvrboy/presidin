import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { LifeBuoy, AlertTriangle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/recovery")({
  head: () => ({ meta: [{ title: "Drawdown Recovery — DivergenceIQ" }] }),
  component: RecoveryPage,
});

function RecoveryPage() {
  const [lossPercent, setLossPercent] = useState<number>(10);

  // Recovery Math: (1 / (1 - loss/100)) - 1
  const requiredGain = lossPercent < 100 ? (1 / (1 - lossPercent / 100) - 1) * 100 : Infinity;

  const standardDrawdowns = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-primary" /> Drawdown Recovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calculate the exact percentage gain required to recover from a specific drawdown.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Current Drawdown (%)</label>
              <input
                type="number"
                min="0"
                max="99.9"
                step="0.1"
                value={lossPercent || ""}
                onChange={(e) => setLossPercent(Number(e.target.value))}
                className="w-full p-3 border border-input rounded bg-background font-mono text-xl"
              />
            </div>

            <div className="bg-muted/30 p-6 rounded-lg border border-border text-center space-y-2">
              <div className="text-sm text-muted-foreground uppercase tracking-wider">
                Required Gain to Breakeven
              </div>
              <div
                className={`text-4xl font-mono font-bold ${requiredGain > lossPercent * 1.5 ? "text-bear" : "text-bull"}`}
              >
                {requiredGain === Infinity ? "Bankruptcy" : `+${requiredGain.toFixed(2)}%`}
              </div>
            </div>

            {requiredGain > 100 && requiredGain !== Infinity && (
              <div className="flex items-start gap-3 text-sm text-bear bg-bear/10 p-3 rounded border border-bear/20">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p>
                  Recovering from a {lossPercent}% drawdown requires more than doubling your
                  account. Consider adjusting your risk management to prevent drawdowns of this
                  magnitude.
                </p>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h3 className="font-medium">Standard Drawdown Table</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Drawdown
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Required Gain
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {standardDrawdowns.map((dd) => {
                  const req = (1 / (1 - dd / 100) - 1) * 100;
                  return (
                    <tr key={dd} className="hover:bg-accent/30">
                      <td className="px-4 py-2.5 font-mono text-bear">-{dd}%</td>
                      <td className="px-4 py-2.5 text-right font-mono text-bull">
                        +{req.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
