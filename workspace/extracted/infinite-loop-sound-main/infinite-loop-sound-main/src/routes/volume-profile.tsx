import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { BarChart, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/volume-profile")({
  head: () => ({ meta: [{ title: "Volume Profile — DivergenceIQ" }] }),
  component: VolumeProfilePage,
});

type Candle = { h: number; l: number; c: number; v: number };

function calcVolumeProfile(candles: Candle[], bins = 20) {
  if (candles.length < 5) return null;
  const allHighs = candles.map((c) => c.h);
  const allLows = candles.map((c) => c.l);
  const maxPrice = Math.max(...allHighs);
  const minPrice = Math.min(...allLows);
  const range = maxPrice - minPrice;
  if (range === 0) return null;
  const binSize = range / bins;
  const profile = Array.from({ length: bins }, (_, i) => ({
    priceLow: minPrice + i * binSize,
    priceHigh: minPrice + (i + 1) * binSize,
    volume: 0,
    poc: false,
  }));

  for (const candle of candles) {
    const cRange = candle.h - candle.l || binSize;
    for (const bin of profile) {
      const overlap = Math.max(
        0,
        Math.min(candle.h, bin.priceHigh) - Math.max(candle.l, bin.priceLow),
      );
      if (overlap > 0) {
        bin.volume += (overlap / cRange) * candle.v;
      }
    }
  }

  const maxVol = Math.max(...profile.map((b) => b.volume));
  const pocBin = profile.reduce((max, b, i) => (b.volume > profile[max].volume ? i : max), 0);
  profile[pocBin].poc = true;

  const totalVol = profile.reduce((s, b) => s + b.volume, 0);
  let cumVol = 0;
  let vahIdx = profile.length - 1;
  for (let i = profile.length - 1; i >= 0; i--) {
    cumVol += profile[i].volume;
    if (cumVol / totalVol >= 0.7) {
      vahIdx = i;
      break;
    }
  }
  cumVol = 0;
  let valIdx = 0;
  for (let i = 0; i < profile.length; i++) {
    cumVol += profile[i].volume;
    if (cumVol / totalVol >= 0.7) {
      valIdx = i;
      break;
    }
  }

  const lastClose = candles[candles.length - 1].c;
  const abovePOC = lastClose > profile[pocBin].priceHigh;
  const belowPOC = lastClose < profile[pocBin].priceLow;

  return {
    profile,
    maxVol,
    poc: profile[pocBin],
    vah: profile[vahIdx],
    val: profile[valIdx],
    lastClose,
    abovePOC,
    belowPOC,
  };
}

function VolumeProfilePage() {
  const [input, setInput] = useState(
    "1.085,1.080,1.083,5000\n1.083,1.079,1.081,8000\n1.081,1.077,1.080,12000\n1.080,1.076,1.078,15000\n1.078,1.075,1.077,10000\n1.077,1.074,1.076,7000\n1.076,1.073,1.075,5000\n1.075,1.072,1.074,3000\n1.074,1.071,1.073,2000\n1.073,1.076,1.075,4000\n1.075,1.079,1.078,9000\n1.078,1.082,1.081,13000\n1.081,1.085,1.084,11000\n1.084,1.087,1.086,7000\n1.086,1.089,1.088,5000",
  );
  const [bins, setBins] = useState(20);

  const candles = useMemo<Candle[]>(() => {
    return input
      .trim()
      .split("\n")
      .map((line) => {
        const [h, l, c, v] = line.split(",").map(Number);
        return { h, l, c, v };
      })
      .filter((c) => !isNaN(c.h));
  }, [input]);

  const result = useMemo(() => calcVolumeProfile(candles, bins), [candles, bins]);
  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart className="w-6 h-6 text-primary" /> Volume Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Horizontal volume distribution with Point of Control (POC), Value Area High (VAH) and
            Value Area Low (VAL).
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">
              HLCV Data (high,low,close,volume per line)
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
            <div>
              <label className="text-sm font-medium mb-1 block">Bins: {bins}</label>
              <input
                type="range"
                min="5"
                max="50"
                value={bins}
                onChange={(e) => setBins(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-4">
            {result && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">POC</div>
                    <div className="font-mono font-bold text-sm mt-1">
                      {fmt((result.poc.priceLow + result.poc.priceHigh) / 2)}
                    </div>
                  </div>
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">VAH</div>
                    <div className="font-mono font-bold text-sm mt-1">
                      {fmt(result.vah.priceHigh)}
                    </div>
                  </div>
                  <div className="bg-card border border-border p-3 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">VAL</div>
                    <div className="font-mono font-bold text-sm mt-1">
                      {fmt(result.val.priceLow)}
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3">Profile Distribution</div>
                  <div className="space-y-1">
                    {result.profile.map((bin, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">
                          {fmt(bin.priceLow)}
                        </span>
                        <div className="flex-1 bg-muted rounded h-3 relative">
                          <div
                            className={`h-3 rounded transition-all ${bin.poc ? "bg-primary" : "bg-bull/60"}`}
                            style={{ width: `${(bin.volume / result.maxVol) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-12">
                          {bin.poc ? "POC" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
                  {result.abovePOC ? (
                    <TrendingUp className="w-5 h-5 text-bull" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-bear" />
                  )}
                  <span className="text-sm">
                    Price is {result.abovePOC ? "above" : result.belowPOC ? "below" : "at"} POC —{" "}
                    {result.abovePOC
                      ? "bullish bias"
                      : result.belowPOC
                        ? "bearish bias"
                        : "neutral"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
