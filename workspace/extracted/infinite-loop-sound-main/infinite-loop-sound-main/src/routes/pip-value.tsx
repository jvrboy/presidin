import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Coins, AlertCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/pip-value")({
  head: () => ({ meta: [{ title: "Pip Value Calculator — DivergenceIQ" }] }),
  component: PipValuePage,
});

function PipValuePage() {
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [pair, setPair] = useState("EUR/USD");
  const [exchangeRate, setExchangeRate] = useState<number>(1.085);
  const [lotSize, setLotSize] = useState<number>(1.0);

  // Pip value formula: (0.0001 / Exchange Rate) * Lot Size * 100,000
  // Note: For JPY pairs, pip is 0.01 instead of 0.0001
  const isJpy = pair.includes("JPY");
  const pipMultiplier = isJpy ? 0.01 : 0.0001;

  // Base pip value in quote currency
  const quotePipValue = pipMultiplier * (lotSize * 100000);

  // Converted to account currency (simplified)
  let finalPipValue = quotePipValue;
  // If account currency isn't the quote currency, we divide by the exchange rate
  // This is a simplified educational calc.
  if (accountCurrency !== pair.split("/")[1]) {
    finalPipValue = quotePipValue / (exchangeRate || 1);
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary" /> Pip Value Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Determine exactly how much 1 pip is worth in your account currency.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Account Currency</label>
                <select
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                  value={accountCurrency}
                  onChange={(e) => setAccountCurrency(e.target.value)}
                >
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>AUD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Currency Pair</label>
                <input
                  type="text"
                  value={pair}
                  onChange={(e) => setPair(e.target.value.toUpperCase())}
                  className="w-full p-2 border border-input rounded bg-background font-mono uppercase"
                  placeholder="e.g. EUR/USD"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Lot Size</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setLotSize(0.01)}
                  className="flex-1 py-1 text-xs border border-border rounded bg-muted/50 hover:bg-accent"
                >
                  0.01 (Micro)
                </button>
                <button
                  onClick={() => setLotSize(0.1)}
                  className="flex-1 py-1 text-xs border border-border rounded bg-muted/50 hover:bg-accent"
                >
                  0.10 (Mini)
                </button>
                <button
                  onClick={() => setLotSize(1.0)}
                  className="flex-1 py-1 text-xs border border-border rounded bg-muted/50 hover:bg-accent"
                >
                  1.00 (Standard)
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={lotSize || ""}
                onChange={(e) => setLotSize(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Exchange Rate</label>
              <input
                type="number"
                step="0.00001"
                value={exchangeRate || ""}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
            <div className="p-6 flex-1 flex flex-col justify-center items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 grid place-items-center mb-2">
                <Coins className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  Value Per Pip
                </h3>
                <div className="text-5xl font-mono font-bold text-bull">
                  {isFinite(finalPipValue) ? `$${finalPipValue.toFixed(2)}` : "$0.00"}
                </div>
              </div>
              <div className="text-sm text-muted-foreground mt-4 border border-border bg-muted/30 p-3 rounded">
                This means a 10 pip movement will result in a{" "}
                <strong>${(finalPipValue * 10).toFixed(2)}</strong> profit or loss.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
