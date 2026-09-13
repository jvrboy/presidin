import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { Calculator, Shield, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/risk-calculator")({
  head: () => ({ meta: [{ title: "Risk Calculator — DivergenceIQ" }] }),
  component: RiskCalculatorPage,
});

function RiskCalculatorPage() {
  const [balance, setBalance] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [stopLoss, setStopLoss] = useState<number>(20);
  const [pipValue, setPipValue] = useState<number>(10); // Standard lot default

  const riskAmount = (balance * riskPercent) / 100;
  // Lot Size = Risk Amount / (Stop Loss Pips * Pip Value per Standard Lot)
  const lotSize = riskAmount / (stopLoss * pipValue);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" /> Risk & Lot Size Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Determine the exact lot size to use to keep your risk within limits.
          </p>
        </div>

        <div className="max-w-xl bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Account Balance ($)</label>
                <input
                  type="number"
                  value={balance || ""}
                  onChange={(e) => setBalance(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Risk Percentage (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={riskPercent || ""}
                    onChange={(e) => setRiskPercent(Number(e.target.value))}
                    className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Stop Loss (Pips)</label>
                  <input
                    type="number"
                    value={stopLoss || ""}
                    onChange={(e) => setStopLoss(Number(e.target.value))}
                    className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                  Pip Value per Standard Lot ($)
                  <span className="text-xs text-muted-foreground font-normal">
                    (Default 10 for XXX/USD pairs)
                  </span>
                </label>
                <input
                  type="number"
                  value={pipValue || ""}
                  onChange={(e) => setPipValue(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
                />
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Shield className="w-4 h-4" /> Capital at Risk
                </span>
                <span className="font-mono font-bold text-red-500">${riskAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Recommended Lot Size</span>
                <span className="font-mono text-2xl font-bold text-primary">
                  {isFinite(lotSize) && lotSize > 0 ? lotSize.toFixed(2) : "0.00"}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-accent/30 p-3 rounded">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                Always double check pip values for non-USD quoted pairs (like EUR/GBP) or indices,
                as their pip values differ from the standard $10 per lot.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
