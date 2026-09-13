import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Activity } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/hurst")({
  head: () => ({ meta: [{ title: "Hurst Exponent — DivergenceIQ" }] }),
  component: HurstPage,
});

function hurstExponent(prices: number[]): number | null {
  if (prices.length < 20) return null;
  const lags = [2, 4, 8, 16, 32].filter((l) => l < prices.length / 2);
  if (lags.length < 3) return null;
  const logLags: number[] = [];
  const logStd: number[] = [];
  for (const lag of lags) {
    const diffs: number[] = [];
    for (let i = lag; i < prices.length; i++) {
      diffs.push(prices[i] - prices[i - lag]);
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length;
    const std = Math.sqrt(variance);
    if (std > 0) {
      logLags.push(Math.log(lag));
      logStd.push(Math.log(std));
    }
  }
  if (logLags.length < 3) return null;
  const n = logLags.length;
  const sumX = logLags.reduce((a, b) => a + b, 0);
  const sumY = logStd.reduce((a, b) => a + b, 0);
  const sumXY = logLags.reduce((s, x, i) => s + x * logStd[i], 0);
  const sumX2 = logLags.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

function fractalDimension(hurst: number): number {
  return 2 - hurst;
}

function HurstPage() {
  const [input, setInput] = useState(
    "1.085,1.083,1.081,1.080,1.079,1.078,1.077,1.076,1.075,1.076,1.077,1.078,1.080,1.082,1.084,1.086,1.088,1.089,1.090,1.091,1.090,1.089,1.087,1.085,1.083,1.081,1.080,1.079,1.080,1.081,1.083,1.085,1.087,1.089,1.091,1.093,1.092,1.090,1.088,1.086,1.084,1.082,1.080,1.079,1.081,1.083,1.085,1.087,1.089,1.091",
  );

  const { prices, hurst, fd, interpretation } = useMemo(() => {
    const p = input
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    const h = hurstExponent(p);
    if (h === null) return { prices: p, hurst: null, fd: null, interpretation: null };
    const fd = fractalDimension(h);
    let interp = "";
    if (h > 0.6)
      interp = `H = ${h.toFixed(3)} — PERSISTENT (trending). The series has memory: past trends tend to continue. Favor trend-following strategies.`;
    else if (h < 0.4)
      interp = `H = ${h.toFixed(3)} — ANTI-PERSISTENT (mean-reverting). The series tends to reverse direction. Favor mean-reversion strategies.`;
    else
      interp = `H = ${h.toFixed(3)} — RANDOM WALK (Brownian motion). No predictable structure. Use range-bound or option-selling strategies.`;
    return { prices: p, hurst: h, fd, interpretation: interp };
  }, [input]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Hurst Exponent & Fractal Dimension
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Classify market behavior as trending, mean-reverting, or random using the Hurst exponent
            (H) and fractal dimension (D).
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">Price Series (comma-separated)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={8}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {prices.length} data points. Minimum 20 required.
            </p>
          </div>

          <div className="space-y-4">
            {hurst !== null ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card border border-border p-6 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Hurst Exponent
                    </div>
                    <div className="font-mono font-bold text-4xl mt-2">{hurst.toFixed(3)}</div>
                  </div>
                  <div className="bg-card border border-border p-6 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Fractal Dimension
                    </div>
                    <div className="font-mono font-bold text-4xl mt-2">{fd!.toFixed(3)}</div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="text-sm font-semibold mb-3">Market Classification</div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full ${hurst > 0.6 ? "bg-bull" : hurst < 0.4 ? "bg-bear" : "bg-muted"}`}
                      />
                      <span className="text-sm font-medium">
                        {hurst > 0.6
                          ? "Trending Market"
                          : hurst < 0.4
                            ? "Mean-Reverting Market"
                            : "Random Walk"}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 relative">
                      <div className="absolute top-0 left-[40%] w-px h-2 bg-muted-foreground/40" />
                      <div className="absolute top-0 left-[60%] w-px h-2 bg-muted-foreground/40" />
                      <div className="absolute top-[-18px] left-[40%] text-[9px] text-muted-foreground -translate-x-1/2">
                        MR
                      </div>
                      <div className="absolute top-[-18px] left-[50%] text-[9px] text-muted-foreground -translate-x-1/2">
                        RW
                      </div>
                      <div className="absolute top-[-18px] left-[60%] text-[9px] text-muted-foreground -translate-x-1/2">
                        Trend
                      </div>
                      <div
                        className={`h-2 rounded-full ${hurst > 0.5 ? "bg-bull" : "bg-bear"}`}
                        style={{ width: `${hurst * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground pt-2">{interpretation}</p>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 text-sm space-y-2">
                  <div className="font-semibold">Strategy Recommendation</div>
                  <p className="text-muted-foreground">
                    {hurst > 0.6
                      ? "Use trend-following: moving average crossovers, breakout systems, momentum indicators. Trail stops to capture extended moves."
                      : hurst < 0.4
                        ? "Use mean-reversion: Bollinger Bands, RSI extremes, stochastic oscillators. Buy oversold, sell overbought with tight stops beyond the range."
                        : "Market is efficient. Consider option-selling (theta decay), grid trading in ranges, or reduce position size since edge is minimal."}
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-card border border-border p-6 rounded-lg text-center text-muted-foreground">
                Need at least 20 data points for Hurst exponent calculation.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
