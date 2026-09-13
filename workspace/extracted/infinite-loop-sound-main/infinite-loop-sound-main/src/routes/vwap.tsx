import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Gauge } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/vwap")({
  head: () => ({ meta: [{ title: "VWAP Bands — DivergenceIQ" }] }),
  component: VwapPage,
});

type Candle = { h: number; l: number; c: number; v: number };

function calcVwap(candles: Candle[], deviations = [1, 2, 3]) {
  if (candles.length < 2) return null;
  let cumVol = 0;
  let cumPV = 0;
  let cumPV2 = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    cumVol += c.v;
    cumPV += tp * c.v;
    cumPV2 += tp * tp * c.v;
  }
  const vwap = cumPV / cumVol;
  const variance = cumPV2 / cumVol - vwap * vwap;
  const stdDev = Math.sqrt(Math.max(0, variance));

  const bands = deviations.map((d) => ({
    upper: vwap + d * stdDev,
    lower: vwap - d * stdDev,
    dev: d,
  }));

  const lastClose = candles[candles.length - 1].c;
  const aboveVwap = lastClose > vwap;
  const distPct = ((lastClose - vwap) / vwap) * 100;

  let band = "AT VWAP";
  for (const b of bands) {
    if (lastClose > b.upper) {
      band = `ABOVE +${b.dev}σ`;
      break;
    }
    if (lastClose < b.lower) {
      band = `BELOW -${b.dev}σ`;
      break;
    }
  }

  return { vwap, stdDev, bands, lastClose, aboveVwap, distPct, band };
}

function VwapPage() {
  const [input, setInput] = useState(
    "1.085,1.080,1.083,5000\n1.083,1.078,1.081,8000\n1.081,1.076,1.079,12000\n1.079,1.075,1.078,15000\n1.078,1.074,1.077,10000\n1.077,1.073,1.076,7000\n1.076,1.075,1.076,5000\n1.076,1.078,1.077,9000\n1.077,1.081,1.080,13000\n1.080,1.084,1.083,11000\n1.083,1.086,1.085,7000\n1.085,1.088,1.087,5000",
  );

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

  const result = useMemo(() => calcVwap(candles), [candles]);
  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Gauge className="w-6 h-6 text-primary" /> VWAP Bands
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Volume-Weighted Average Price with standard deviation bands for institutional fair-value
            detection.
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
          </div>

          <div className="space-y-4">
            {result && (
              <>
                <div className="bg-card border border-border p-6 rounded-lg text-center">
                  <div className="text-[10px] text-muted-foreground uppercase">VWAP</div>
                  <div className="font-mono font-bold text-4xl mt-2">{fmt(result.vwap)}</div>
                  <div
                    className={`text-sm mt-2 font-medium ${result.aboveVwap ? "text-bull" : "text-bear"}`}
                  >
                    {result.aboveVwap ? "+" : ""}
                    {result.distPct.toFixed(3)}% from VWAP
                  </div>
                  <div className="mt-2">
                    <span className="px-3 py-1 bg-muted rounded-full text-xs font-bold">
                      {result.band}
                    </span>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 p-3 border-b border-border font-semibold">
                    Standard Deviation Bands
                  </div>
                  <div className="divide-y divide-border">
                    {result.bands.map((b) => (
                      <div key={b.dev} className="p-3 flex justify-between items-center">
                        <span className="font-mono text-sm text-muted-foreground">±{b.dev}σ</span>
                        <div className="flex gap-4 font-mono text-sm">
                          <span className="text-bear">{fmt(b.lower)}</span>
                          <span className="text-bull">{fmt(b.upper)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 text-sm">
                  <div className="font-semibold mb-2">Interpretation</div>
                  <p className="text-muted-foreground">
                    {result.aboveVwap
                      ? "Price is above VWAP — bullish bias. Institutional buyers are in control. Look for pullbacks to VWAP for long entries."
                      : "Price is below VWAP — bearish bias. Institutional sellers are in control. Look for rallies to VWAP for short entries."}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
