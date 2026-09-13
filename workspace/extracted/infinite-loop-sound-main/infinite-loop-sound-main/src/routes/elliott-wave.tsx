import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/elliott-wave")({
  head: () => ({ meta: [{ title: "Elliott Wave — DivergenceIQ" }] }),
  component: ElliottWavePage,
});

type Swing = { index: number; price: number; type: "high" | "low" };

function detectSwings(prices: number[], lookback = 3): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < prices.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (prices[j] >= prices[i]) isHigh = false;
      if (prices[j] <= prices[i]) isLow = false;
    }
    if (isHigh) swings.push({ index: i, price: prices[i], type: "high" });
    if (isLow) swings.push({ index: i, price: prices[i], type: "low" });
  }
  return swings;
}

function analyzeElliottWave(swings: Swing[]) {
  if (swings.length < 5) return null;
  const recent = swings.slice(-6);
  const wave1 = recent[0];
  const wave2 = recent[1];
  const wave3 = recent[2];
  const wave4 = recent[3];
  const wave5 = recent[4];

  const isImpulse = wave1.type === "low" && wave2.type === "high" && wave3.type === "low";
  const isAltImpulse = wave1.type === "high" && wave2.type === "low" && wave3.type === "high";

  if (!isImpulse && !isAltImpulse) return null;

  const direction = isImpulse ? "UP" : "DOWN";
  const w1Ret = Math.abs((wave2.price - wave1.price) / (wave1.price || 1)) * 100;
  const w3Ext = Math.abs((wave3.price - wave2.price) / (wave2.price || 1)) * 100;
  const w4Ret = Math.abs((wave4.price - wave3.price) / (wave3.price || 1)) * 100;

  const fibCheck = {
    w2Ret: w1Ret,
    w2Valid: w1Ret >= 30 && w1Ret <= 80,
    w3Ext: w3Ext,
    w3Valid: w3Ext >= 100,
    w4Ret: w4Ret,
    w4Valid: w4Ret >= 23 && w4Ret <= 50,
  };

  const score = [fibCheck.w2Valid, fibCheck.w3Valid, fibCheck.w4Valid].filter(Boolean).length;
  const completionScore = (score / 3) * 100;

  const target =
    direction === "UP"
      ? wave3.price + (wave3.price - wave1.price) * 0.618
      : wave3.price - (wave1.price - wave3.price) * 0.618;

  return { direction, wave1, wave2, wave3, wave4, wave5, fibCheck, completionScore, target };
}

function ElliottWavePage() {
  const [input, setInput] = useState(
    "1.085,1.082,1.088,1.084,1.092,1.087,1.095,1.090,1.098,1.093,1.100,1.096,1.103,1.098,1.105",
  );

  const { prices, swings, analysis } = useMemo(() => {
    const p = input
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    const sw = detectSwings(p, 2);
    const an = analyzeElliottWave(sw);
    return { prices: p, swings: sw, analysis: an };
  }, [input]);

  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Elliott Wave Analyzer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detect 5-wave impulse patterns with Fibonacci ratio validation per Elliott Wave Theory.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">Price Series (comma-separated)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {prices.length} data points. {swings.length} swing points detected.
            </p>
          </div>

          <div className="space-y-4">
            {analysis ? (
              <>
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Wave Pattern
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${analysis.direction === "UP" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}
                    >
                      {analysis.direction === "UP" ? "Bullish Impulse" : "Bearish Impulse"}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-1">
                    <div
                      className="h-3 rounded-full bg-primary transition-all"
                      style={{ width: `${analysis.completionScore}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Pattern Confidence: {analysis.completionScore.toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "W2 Ret of W1",
                      value: analysis.fibCheck.w2Ret,
                      valid: analysis.fibCheck.w2Valid,
                      target: "50-61.8%",
                    },
                    {
                      label: "W3 Extension",
                      value: analysis.fibCheck.w3Ext,
                      valid: analysis.fibCheck.w3Valid,
                      target: "≥100%",
                    },
                    {
                      label: "W4 Ret of W3",
                      value: analysis.fibCheck.w4Ret,
                      valid: analysis.fibCheck.w4Valid,
                      target: "38.2%",
                    },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className={`bg-card border p-3 rounded-lg ${r.valid ? "border-bull/40" : "border-bear/40"}`}
                    >
                      <div className="text-[10px] text-muted-foreground uppercase">{r.label}</div>
                      <div className="font-mono font-bold text-lg mt-1">{r.value.toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground">Target: {r.target}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3">Wave Labels</div>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: "Wave 1", swing: analysis.wave1 },
                      { label: "Wave 2", swing: analysis.wave2 },
                      { label: "Wave 3", swing: analysis.wave3 },
                      { label: "Wave 4", swing: analysis.wave4 },
                      { label: "Wave 5", swing: analysis.wave5 },
                    ].map((w) => (
                      <div key={w.label} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{w.label}</span>
                        <div className="flex items-center gap-2">
                          {w.swing.type === "high" ? (
                            <TrendingUp className="w-3 h-3 text-bull" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-bear" />
                          )}
                          <span className="font-mono">{fmt(w.swing.price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                    <span className="text-muted-foreground">Projected Target (W5):</span>
                    <span className="font-mono font-bold text-primary">{fmt(analysis.target)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-card border border-border p-6 rounded-lg text-center text-muted-foreground">
                Not enough swing points for Elliott Wave analysis. Need at least 5 swings.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
