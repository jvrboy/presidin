import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { SplitSquareHorizontal, Layers } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/scaling")({
  head: () => ({ meta: [{ title: "Position Scaling — DivergenceIQ" }] }),
  component: ScalingPage,
});

function ScalingPage() {
  const [totalLots, setTotalLots] = useState<number>(1.0);
  const [tp1Percent, setTp1Percent] = useState<number>(50);
  const [tp2Percent, setTp2Percent] = useState<number>(30);
  // tp3 takes the rest

  const tp1Lots = (totalLots * (tp1Percent / 100)).toFixed(2);
  const tp2Lots = (totalLots * (tp2Percent / 100)).toFixed(2);
  const tp3Percent = Math.max(0, 100 - tp1Percent - tp2Percent);
  const tp3Lots = (totalLots * (tp3Percent / 100)).toFixed(2);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <SplitSquareHorizontal className="w-6 h-6 text-primary" /> Position Scaling Tool
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calculate partial profit lot sizes for multiple Take Profit levels.
          </p>
        </div>

        <div className="max-w-xl bg-card border border-border p-6 rounded-lg space-y-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Total Entry Lot Size</label>
            <input
              type="number"
              step="0.01"
              value={totalLots || ""}
              onChange={(e) => setTotalLots(Number(e.target.value))}
              className="w-full p-2 border border-input rounded bg-background font-mono text-xl"
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Close at TP1 (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tp1Percent}
                  onChange={(e) => setTp1Percent(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Close Size</div>
                <div className="font-mono text-xl font-bold text-bull">{tp1Lots} Lots</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Close at TP2 (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tp2Percent}
                  onChange={(e) => setTp2Percent(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Close Size</div>
                <div className="font-mono text-xl font-bold text-bull">{tp2Lots} Lots</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center bg-muted/30 p-3 rounded border border-border">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Leave for TP3 / Runner (%)
                </label>
                <div className="p-2 font-mono">{tp3Percent}%</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Runner Size</div>
                <div className="font-mono text-xl font-bold text-primary">{tp3Lots} Lots</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="w-4 h-4" />
            <span>
              Ensure your broker allows partial closing of positions down to 0.01 micro lots.
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
