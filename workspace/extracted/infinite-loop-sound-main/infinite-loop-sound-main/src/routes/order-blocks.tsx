import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Boxes, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/order-blocks")({
  head: () => ({ meta: [{ title: "Order Blocks — DivergenceIQ" }] }),
  component: OrderBlocksPage,
});

type Candle = { o: number; h: number; l: number; c: number; v: number };

function detectOrderBlocks(candles: Candle[], lookback = 10) {
  const blocks: Array<{
    type: "bull" | "bear";
    top: number;
    bottom: number;
    index: number;
    strength: number;
  }> = [];
  for (let i = lookback; i < candles.length - 2; i++) {
    const candle = candles[i];
    const isBull = candle.c > candle.o;
    const isBear = candle.c < candle.o;
    const body = Math.abs(candle.c - candle.o);
    const range = candle.h - candle.l;
    const volAvg = candles.slice(i - lookback, i).reduce((s, c) => s + c.v, 0) / lookback;
    const highVol = candle.v > volAvg * 1.5;
    const nextMove = candles[i + 1].c - candle.c;

    if (isBear && highVol && nextMove > body * 1.5) {
      blocks.push({
        type: "bull",
        top: candle.o,
        bottom: candle.l,
        index: i,
        strength: (candle.v / volAvg) * (nextMove / body),
      });
    }
    if (isBull && highVol && nextMove < -body * 1.5) {
      blocks.push({
        type: "bear",
        top: candle.h,
        bottom: candle.o,
        index: i,
        strength: (candle.v / volAvg) * Math.abs(nextMove / body),
      });
    }
  }
  return blocks.sort((a, b) => b.strength - a.strength).slice(0, 10);
}

function OrderBlocksPage() {
  const [input, setInput] = useState(
    "1.08,1.085,1.079,1.083,5000\n1.083,1.084,1.081,1.081,8000\n1.081,1.082,1.078,1.079,12000\n1.079,1.080,1.075,1.077,15000\n1.077,1.083,1.076,1.082,6000\n1.082,1.088,1.081,1.087,9000\n1.087,1.090,1.086,1.089,7000\n1.089,1.091,1.085,1.086,11000\n1.086,1.087,1.082,1.083,14000\n1.083,1.089,1.082,1.088,8000\n1.088,1.092,1.087,1.091,5000\n1.091,1.093,1.088,1.089,10000\n1.089,1.090,1.085,1.086,13000\n1.086,1.091,1.085,1.090,7000\n1.090,1.094,1.089,1.093,6000",
  );

  const candles = useMemo<Candle[]>(() => {
    return input
      .trim()
      .split("\n")
      .map((line) => {
        const [o, h, l, c, v] = line.split(",").map(Number);
        return { o, h, l, c, v };
      })
      .filter((c) => !isNaN(c.o));
  }, [input]);

  const blocks = useMemo(() => detectOrderBlocks(candles), [candles]);
  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-primary" /> Order Block Detector
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identify institutional order blocks — high-volume candles that precede strong
            directional moves. Used for SMC entry zones.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">
              OHLCV Data (open,high,low,close,volume per line)
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{candles.length} candles parsed</p>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/50 p-3 border-b border-border font-semibold">
                Detected Order Blocks
              </div>
              {blocks.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No order blocks detected. Try adding more data.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {blocks.map((b, i) => (
                    <div
                      key={i}
                      className="p-3 flex items-center justify-between hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-3">
                        {b.type === "bull" ? (
                          <TrendingUp className="w-4 h-4 text-bull" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-bear" />
                        )}
                        <div>
                          <div className="font-medium text-sm">
                            {b.type === "bull" ? "Bullish" : "Bearish"} OB
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            Zone: {fmt(b.bottom)} — {fmt(b.top)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Strength</div>
                        <div className="font-mono font-bold text-sm">{b.strength.toFixed(2)}x</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {blocks.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-sm font-semibold mb-3">Trading Plan</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Strongest Block:</span>
                    <span className="font-bold">
                      {blocks[0].type === "bull" ? "Bullish" : "Bearish"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry Zone:</span>
                    <span className="font-mono">
                      {fmt(blocks[0].bottom)} — {fmt(blocks[0].top)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Block Index:</span>
                    <span className="font-mono">#{blocks[0].index}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    Wait for price to return to the order block zone, then enter in the block
                    direction. Place stop loss beyond the block.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
