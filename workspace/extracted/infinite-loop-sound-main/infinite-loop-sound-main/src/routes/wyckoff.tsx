import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Layers, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/wyckoff")({
  head: () => ({ meta: [{ title: "Wyckoff Analysis — DivergenceIQ" }] }),
  component: WyckoffPage,
});

type Candle = { o: number; h: number; l: number; c: number; v: number };

function analyzeWyckoff(candles: Candle[], window = 20) {
  if (candles.length < window) return null;
  const recent = candles.slice(-window);
  const prices = recent.map((c) => c.c);
  const vols = recent.map((c) => c.v);
  const maxPrice = Math.max(...recent.map((c) => c.h));
  const minPrice = Math.min(...recent.map((c) => c.l));
  const range = maxPrice - minPrice;
  const lastClose = prices[prices.length - 1];
  const posInRange = ((lastClose - minPrice) / range) * 100;

  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volRatio = recentVol / avgVol;

  const priceChanges = prices.map((p, i) => (i === 0 ? 0 : p - prices[i - 1]));
  const volChanges = vols.map((v, i) => (i === 0 ? 0 : v - vols[i - 1]));
  let positiveCorrelation = 0;
  let negativeCorrelation = 0;
  for (let i = 1; i < priceChanges.length; i++) {
    if (priceChanges[i] > 0 && volChanges[i] > 0) positiveCorrelation++;
    if (priceChanges[i] < 0 && volChanges[i] > 0) negativeCorrelation++;
  }
  const total = positiveCorrelation + negativeCorrelation;
  const bullishVol = total > 0 ? (positiveCorrelation / total) * 100 : 50;

  const effortResult = [];
  for (let i = 1; i < recent.length; i++) {
    const priceMove = Math.abs(prices[i] - prices[i - 1]);
    const volMove = vols[i];
    const ratio = volMove > 0 ? priceMove / volMove : 0;
    effortResult.push({ index: i, ratio, bullish: prices[i] > prices[i - 1] });
  }
  const avgER = effortResult.reduce((s, e) => s + e.ratio, 0) / effortResult.length;

  let phase = "ACCUMULATION";
  let phaseDesc = "";
  if (posInRange < 30 && volRatio < 1.2) {
    phase = "ACCUMULATION";
    phaseDesc =
      "Price in lower range with declining volume — smart money accumulating. Look for Spring or LPS entry.";
  } else if (posInRange > 70 && volRatio < 1.2) {
    phase = "DISTRIBUTION";
    phaseDesc =
      "Price in upper range with declining volume — smart money distributing. Look for Upthrust or LPSY entry.";
  } else if (posInRange > 50 && volRatio > 1.5 && bullishVol > 60) {
    phase = "MARKUP";
    phaseDesc =
      "Price advancing with increasing volume — bullish markup phase. Look for retests of support for longs.";
  } else if (posInRange < 50 && volRatio > 1.5 && bullishVol < 40) {
    phase = "MARKDOWN";
    phaseDesc =
      "Price declining with increasing volume — bearish markdown phase. Look for retests of resistance for shorts.";
  } else {
    phase = "TRADING RANGE";
    phaseDesc =
      "Price consolidating without clear directional bias. Wait for range break with volume confirmation.";
  }

  const spring = posInRange < 20 && volRatio > 1.3;
  const upthrust = posInRange > 80 && volRatio > 1.3;

  return {
    phase,
    phaseDesc,
    posInRange,
    volRatio,
    bullishVol,
    avgER,
    spring,
    upthrust,
    maxPrice,
    minPrice,
    range,
    lastClose,
  };
}

function WyckoffPage() {
  const [input, setInput] = useState(
    "1.085,1.088,1.082,1.086,5000\n1.086,1.089,1.083,1.085,4000\n1.085,1.087,1.080,1.082,6000\n1.082,1.085,1.078,1.081,8000\n1.081,1.083,1.077,1.080,10000\n1.080,1.082,1.076,1.079,7000\n1.079,1.081,1.075,1.078,5000\n1.078,1.080,1.074,1.077,3000\n1.077,1.079,1.073,1.076,2000\n1.076,1.078,1.072,1.075,1500\n1.075,1.077,1.071,1.074,1000\n1.074,1.078,1.073,1.077,3000\n1.077,1.082,1.076,1.081,6000\n1.081,1.086,1.080,1.085,9000\n1.085,1.090,1.084,1.089,12000\n1.089,1.094,1.088,1.093,15000\n1.093,1.097,1.092,1.096,11000\n1.096,1.100,1.095,1.099,8000\n1.099,1.103,1.098,1.102,6000\n1.102,1.105,1.100,1.103,4000",
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

  const result = useMemo(() => analyzeWyckoff(candles), [candles]);
  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Wyckoff Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identify accumulation/distribution phases, springs, upthrusts, and effort vs. result
            using Wyckoff Method.
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
          </div>

          <div className="space-y-4">
            {result && (
              <>
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Current Phase
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        result.phase === "MARKUP"
                          ? "bg-bull/20 text-bull"
                          : result.phase === "MARKDOWN"
                            ? "bg-bear/20 text-bear"
                            : result.phase === "ACCUMULATION"
                              ? "bg-primary/20 text-primary"
                              : result.phase === "DISTRIBUTION"
                                ? "bg-warning/20 text-warning"
                                : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {result.phase}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{result.phaseDesc}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Range Position
                    </div>
                    <div className="font-mono font-bold text-lg mt-1">
                      {result.posInRange.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">Volume Ratio</div>
                    <div className="font-mono font-bold text-lg mt-1">
                      {result.volRatio.toFixed(2)}x
                    </div>
                  </div>
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Bullish Volume
                    </div>
                    <div className="font-mono font-bold text-lg mt-1">
                      {result.bullishVol.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">Effort/Result</div>
                    <div className="font-mono font-bold text-lg mt-1">
                      {result.avgER.toFixed(6)}
                    </div>
                  </div>
                </div>

                {(result.spring || result.upthrust) && (
                  <div
                    className={`bg-card border-2 rounded-lg p-4 ${result.spring ? "border-bull/50" : "border-bear/50"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.spring ? (
                        <TrendingUp className="w-5 h-5 text-bull" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-bear" />
                      )}
                      <span className="font-bold text-sm">
                        {result.spring ? "SPRING DETECTED" : "UPTHRUST DETECTED"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {result.spring
                        ? "Price dipped below range support on increased volume then recovered — classic Wyckoff Spring. Bullish entry signal."
                        : "Price spiked above range resistance on increased volume then fell back — classic Wyckoff Upthrust. Bearish entry signal."}
                    </p>
                  </div>
                )}

                <div className="bg-card border border-border rounded-lg p-4 text-sm">
                  <div className="font-semibold mb-2">Range Statistics</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-muted-foreground">High:</span>{" "}
                      <span className="font-mono">{fmt(result.maxPrice)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Low:</span>{" "}
                      <span className="font-mono">{fmt(result.minPrice)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Range:</span>{" "}
                      <span className="font-mono">{fmt(result.range)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
