import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Calculator, BarChart } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/options-calc")({
  head: () => ({ meta: [{ title: "Options Pricing — DivergenceIQ" }] }),
  component: OptionsCalcPage,
});

// Normal cumulative distribution function
function CND(x: number) {
  const a1 = 0.31938153,
    a2 = -0.356563782,
    a3 = 1.781477937,
    a4 = -1.821255978,
    a5 = 1.330274429;
  const L = Math.abs(x);
  const K = 1.0 / (1.0 + 0.2316419 * L);
  let w =
    1.0 -
    (1.0 / Math.sqrt(2 * Math.PI)) *
      Math.exp((-L * L) / 2) *
      (a1 * K + a2 * K * K + a3 * Math.pow(K, 3) + a4 * Math.pow(K, 4) + a5 * Math.pow(K, 5));
  if (x < 0) w = 1.0 - w;
  return w;
}

function blackScholes(S: number, K: number, T: number, r: number, v: number, type: "call" | "put") {
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);
  if (type === "call") {
    return S * CND(d1) - K * Math.exp(-r * T) * CND(d2);
  } else {
    return K * Math.exp(-r * T) * CND(-d2) - S * CND(-d1);
  }
}

function OptionsCalcPage() {
  const [S, setS] = useState<number>(150); // Spot price
  const [K, setK] = useState<number>(155); // Strike price
  const [T, setT] = useState<number>(30); // Days to expiration
  const [r, setR] = useState<number>(5); // Risk-free rate %
  const [v, setV] = useState<number>(25); // Volatility %

  const timeInYears = T / 365;
  const rateDec = r / 100;
  const volDec = v / 100;

  const callPrice = blackScholes(S, K, timeInYears, rateDec, volDec, "call");
  const putPrice = blackScholes(S, K, timeInYears, rateDec, volDec, "put");

  // Greeks (simplified for Call)
  const d1 =
    (Math.log(S / K) + (rateDec + (volDec * volDec) / 2) * timeInYears) /
    (volDec * Math.sqrt(timeInYears));
  const deltaCall = CND(d1);
  const deltaPut = deltaCall - 1;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" /> Options Pricing (Black-Scholes)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calculate theoretical option premiums and Greeks based on market parameters.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Spot Price ($)</label>
                <input
                  type="number"
                  value={S}
                  onChange={(e) => setS(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Strike Price ($)</label>
                <input
                  type="number"
                  value={K}
                  onChange={(e) => setK(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block flex items-center justify-between">
                <span>Days to Expiration</span>
                <span className="text-muted-foreground font-normal">{T} days</span>
              </label>
              <input
                type="range"
                min="1"
                max="365"
                value={T}
                onChange={(e) => setT(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block flex items-center justify-between">
                <span>Implied Volatility (%)</span>
                <span className="text-muted-foreground font-normal">{v}%</span>
              </label>
              <input
                type="range"
                min="1"
                max="150"
                value={v}
                onChange={(e) => setV(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Risk-Free Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={r}
                onChange={(e) => setR(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col text-center">
                <div className="bg-bull/10 p-2 text-xs font-semibold text-bull uppercase tracking-wider border-b border-border">
                  Call Value
                </div>
                <div className="p-6 text-4xl font-bold font-mono">
                  ${isFinite(callPrice) ? callPrice.toFixed(2) : "0.00"}
                </div>
              </div>
              <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col text-center">
                <div className="bg-bear/10 p-2 text-xs font-semibold text-bear uppercase tracking-wider border-b border-border">
                  Put Value
                </div>
                <div className="p-6 text-4xl font-bold font-mono">
                  ${isFinite(putPrice) ? putPrice.toFixed(2) : "0.00"}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Greeks Estimation</h3>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted-foreground">Call Delta (Δ)</span>
                  <span className="font-bold">
                    {isFinite(deltaCall) ? deltaCall.toFixed(4) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted-foreground">Put Delta (Δ)</span>
                  <span className="font-bold">
                    {isFinite(deltaPut) ? deltaPut.toFixed(4) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 text-xs text-muted-foreground">
                  <span>Moneyness</span>
                  <span>
                    {S > K
                      ? "In The Money (Call)"
                      : S < K
                        ? "Out of The Money (Call)"
                        : "At The Money"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
