import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Grid } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/renko")({
  head: () => ({ meta: [{ title: "Renko Chart — DivergenceIQ" }] }),
  component: RenkoPage,
});

type Brick = { open: number; close: number; direction: "up" | "down"; index: number };

function buildRenko(prices: number[], brickSize: number): Brick[] {
  if (prices.length < 2 || brickSize <= 0) return [];
  const bricks: Brick[] = [];
  let lastBrickClose = prices[0];
  let brickIndex = 0;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i];
    const diff = price - lastBrickClose;

    if (Math.abs(diff) >= brickSize) {
      const numBricks = Math.floor(Math.abs(diff) / brickSize);
      for (let j = 0; j < numBricks; j++) {
        const direction = diff > 0 ? "up" : "down";
        const open = lastBrickClose;
        const close = direction === "up" ? open + brickSize : open - brickSize;
        bricks.push({ open, close, direction, index: brickIndex++ });
        lastBrickClose = close;
      }
    }
  }
  return bricks;
}

function calcRenkoATR(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const tr = Math.abs(prices[i] - prices[i - 1]);
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function RenkoPage() {
  const [input, setInput] = useState(
    "1.085,1.083,1.081,1.080,1.079,1.078,1.077,1.076,1.075,1.076,1.077,1.078,1.080,1.082,1.084,1.086,1.088,1.089,1.090,1.091,1.090,1.089,1.087,1.085,1.083,1.081,1.080,1.079,1.080,1.081,1.083,1.085",
  );
  const [brickSize, setBrickSize] = useState(0);

  const { prices, bricks, autoBrickSize } = useMemo(() => {
    const p = input
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    const atr = calcRenkoATR(p, 14);
    const size = brickSize > 0 ? brickSize : atr;
    const b = buildRenko(p, size);
    return { prices: p, bricks: b, autoBrickSize: atr };
  }, [input, brickSize]);

  const fmt = (n: number) => n.toFixed(5);
  const upBricks = bricks.filter((b) => b.direction === "up").length;
  const downBricks = bricks.filter((b) => b.direction === "down").length;
  const trend =
    upBricks > downBricks * 1.5 ? "BULLISH" : downBricks > upBricks * 1.5 ? "BEARISH" : "NEUTRAL";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Grid className="w-6 h-6 text-primary" /> Renko Chart Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Noise-filtering Renko bricks from price data. Auto-calculates brick size from ATR or use
            custom size.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-lg space-y-3">
              <label className="text-sm font-medium">Price Series (comma-separated)</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={6}
                className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
              />
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Brick Size (0 = auto ATR: {autoBrickSize.toFixed(5)})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={brickSize || ""}
                  onChange={(e) => setBrickSize(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border p-3 rounded-lg text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Up Bricks</div>
                <div className="font-mono font-bold text-lg mt-1 text-bull">{upBricks}</div>
              </div>
              <div className="bg-card border border-border p-3 rounded-lg text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Down Bricks</div>
                <div className="font-mono font-bold text-lg mt-1 text-bear">{downBricks}</div>
              </div>
              <div className="bg-card border border-border p-3 rounded-lg text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Trend</div>
                <div
                  className={`font-bold text-sm mt-1 ${trend === "BULLISH" ? "text-bull" : trend === "BEARISH" ? "text-bear" : "text-muted-foreground"}`}
                >
                  {trend}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-sm font-semibold mb-3">Renko Bricks</div>
            <div className="space-y-0.5 max-h-96 overflow-y-auto">
              {bricks.map((b, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-1.5 rounded ${b.direction === "up" ? "bg-bull/10" : "bg-bear/10"}`}
                >
                  <div
                    className={`w-6 h-6 rounded grid place-items-center text-xs font-bold ${b.direction === "up" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}
                  >
                    {b.direction === "up" ? "▲" : "▼"}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{fmt(b.open)}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="font-mono text-xs font-bold">{fmt(b.close)}</span>
                </div>
              ))}
              {bricks.length === 0 && (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  No bricks generated. Adjust brick size or add more data.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
