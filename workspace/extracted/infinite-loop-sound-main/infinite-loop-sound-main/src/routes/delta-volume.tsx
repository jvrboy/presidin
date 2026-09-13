import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Activity } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/delta-volume")({
  head: () => ({ meta: [{ title: "Delta Volume — DivergenceIQ" }] }),
  component: DeltaVolumePage,
});

type Candle = { o: number; c: number; v: number };

function calcDelta(candles: Candle[]) {
  if (candles.length < 2) return null;
  const deltas = candles.map((c) => {
    const isUp = c.c >= c.o;
    const delta = isUp ? c.v : -c.v;
    return { ...c, delta, isUp, cumDelta: 0 };
  });

  let cum = 0;
  for (const d of deltas) {
    cum += d.delta;
    d.cumDelta = cum;
  }

  const totalDelta = deltas.reduce((s, d) => s + d.delta, 0);
  const posDelta = deltas.filter((d) => d.delta > 0).reduce((s, d) => s + d.delta, 0);
  const negDelta = Math.abs(deltas.filter((d) => d.delta < 0).reduce((s, d) => s + d.delta, 0));
  const deltaRatio = negDelta > 0 ? posDelta / negDelta : posDelta;

  const lastPrice = candles[candles.length - 1].c;
  const lastDelta = deltas[deltas.length - 1].delta;
  const lastCumDelta = deltas[deltas.length - 1].cumDelta;

  const divergence = [];
  for (let i = 1; i < deltas.length; i++) {
    const priceUp = candles[i].c > candles[i - 1].c;
    const deltaDown = deltas[i].cumDelta < deltas[i - 1].cumDelta;
    const priceDown = candles[i].c < candles[i - 1].c;
    const deltaUp = deltas[i].cumDelta > deltas[i - 1].cumDelta;
    if ((priceUp && deltaDown) || (priceDown && deltaUp)) {
      divergence.push({
        index: i,
        type: priceUp ? "BEARISH DIV" : "BULLISH DIV",
        price: candles[i].c,
        cumDelta: deltas[i].cumDelta,
      });
    }
  }

  return {
    deltas,
    totalDelta,
    posDelta,
    negDelta,
    deltaRatio,
    lastPrice,
    lastDelta,
    lastCumDelta,
    divergence,
  };
}

function DeltaVolumePage() {
  const [input, setInput] = useState(
    "1.080,1.083,5000\n1.083,1.081,7000\n1.081,1.085,9000\n1.085,1.082,6000\n1.082,1.087,11000\n1.087,1.084,8000\n1.084,1.089,13000\n1.089,1.086,5000\n1.086,1.091,15000\n1.091,1.088,7000\n1.088,1.093,12000\n1.093,1.090,4000\n1.090,1.085,9000\n1.085,1.082,11000\n1.082,1.088,8000",
  );

  const candles = useMemo<Candle[]>(() => {
    return input
      .trim()
      .split("\n")
      .map((line) => {
        const [o, c, v] = line.split(",").map(Number);
        return { o, c, v };
      })
      .filter((c) => !isNaN(c.o));
  }, [input]);

  const result = useMemo(() => calcDelta(candles), [candles]);
  const fmt = (n: number) => n.toFixed(0);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Delta Volume Analyzer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cumulative delta volume with divergence detection between price action and order flow.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">OCV Data (open,close,volume per line)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
          </div>

          <div className="space-y-4">
            {result && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card border border-border p-4 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">Total Delta</div>
                    <div
                      className={`font-mono font-bold text-2xl mt-1 ${result.totalDelta >= 0 ? "text-bull" : "text-bear"}`}
                    >
                      {result.totalDelta >= 0 ? "+" : ""}
                      {fmt(result.totalDelta)}
                    </div>
                  </div>
                  <div className="bg-card border border-border p-4 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">Delta Ratio</div>
                    <div className="font-mono font-bold text-2xl mt-1">
                      {result.deltaRatio.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3">Cumulative Delta Flow</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.deltas.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-6">{i}</span>
                        <div className="flex-1 flex items-center gap-1">
                          <div
                            className={`flex-1 h-3 rounded ${d.isUp ? "bg-bull/60" : "bg-bear/60"}`}
                            style={{
                              width: `${Math.min(100, (Math.abs(d.delta) / result.posDelta) * 100)}%`,
                              minWidth: "4px",
                            }}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-mono w-12 text-right ${d.delta >= 0 ? "text-bull" : "text-bear"}`}
                        >
                          {d.delta >= 0 ? "+" : ""}
                          {fmt(d.delta)}
                        </span>
                        <span className="text-[10px] font-mono w-16 text-right text-muted-foreground">
                          {fmt(d.cumDelta)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {result.divergence.length > 0 && (
                  <div className="bg-card border-2 border-warning/40 rounded-lg p-4">
                    <div className="text-sm font-semibold mb-2">Divergence Detected</div>
                    <div className="space-y-1">
                      {result.divergence.map((d, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span
                            className={`font-bold ${d.type.includes("BULL") ? "text-bull" : "text-bear"}`}
                          >
                            {d.type}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            Bar {d.index} · Price {d.price.toFixed(5)} · CumΔ {fmt(d.cumDelta)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
