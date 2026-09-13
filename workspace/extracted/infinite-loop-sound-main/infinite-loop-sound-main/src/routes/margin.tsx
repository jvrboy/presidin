import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Landmark, AlertCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/margin")({
  head: () => ({ meta: [{ title: "Margin Calculator — DivergenceIQ" }] }),
  component: MarginPage,
});

function MarginPage() {
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [pair, setPair] = useState("EUR/USD");
  const [exchangeRate, setExchangeRate] = useState<number>(1.085);
  const [lotSize, setLotSize] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(100);

  // Standard lot size = 100,000 units of the base currency (the first currency in the pair)
  // Margin = (Lot Size * 100,000 * Exchange Rate (Base / Account Currency)) / Leverage

  // Simplified calculation assuming account currency is USD for this tool:
  // If pair starts with USD (e.g., USD/JPY), Exchange rate is 1 for the margin formula because the base is USD.
  // If pair starts with EUR (e.g., EUR/USD), the exchange rate is the pair's price.
  // If cross pair (e.g., GBP/JPY), user needs to input the exchange rate of GBP/USD.

  const contractSize = lotSize * 100000;
  const marginRequired = (contractSize * exchangeRate) / leverage;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" /> Margin Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calculate the exact capital required to open and hold a position.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Account Currency</label>
                <select
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>AUD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Leverage 1:</label>
                <input
                  type="number"
                  value={leverage || ""}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Lot Size</label>
              <input
                type="number"
                step="0.01"
                value={lotSize || ""}
                onChange={(e) => setLotSize(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Exchange Rate (Base to Account Cur)
              </label>
              <div className="text-xs text-muted-foreground mb-2 leading-tight">
                If trading EUR/USD and account is USD, enter EUR/USD price. If trading USD/JPY and
                account is USD, enter 1.
              </div>
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
                <Landmark className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  Required Margin
                </h3>
                <div className="text-5xl font-mono font-bold">
                  {marginRequired > 0 && isFinite(marginRequired)
                    ? `$${marginRequired.toFixed(2)}`
                    : "$0.00"}
                </div>
              </div>
              <div className="text-sm text-muted-foreground mt-4 border border-border bg-muted/30 p-3 rounded text-left">
                <strong>Formula:</strong> (Contract Size × Exchange Rate) ÷ Leverage
              </div>
            </div>
            <div className="bg-amber-500/10 border-t border-amber-500/20 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600/90 leading-relaxed">
                Ensure you have adequate free margin beyond this required amount to withstand
                drawdowns without hitting a margin call or stop out.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
