import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Grid } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/correlation-matrix")({
  head: () => ({ meta: [{ title: "Correlation Matrix — DivergenceIQ" }] }),
  component: CorrelationMatrixPage,
});

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);
  const aMean = aSlice.reduce((s, x) => s + x, 0) / n;
  const bMean = bSlice.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    aDen = 0,
    bDen = 0;
  for (let i = 0; i < n; i++) {
    const aDiff = aSlice[i] - aMean;
    const bDiff = bSlice[i] - bMean;
    num += aDiff * bDiff;
    aDen += aDiff * aDiff;
    bDen += bDiff * bDiff;
  }
  if (aDen === 0 || bDen === 0) return 0;
  return num / Math.sqrt(aDen * bDen);
}

function CorrelationMatrixPage() {
  const [input, setInput] = useState(
    "EURUSD: 1.085,1.083,1.081,1.080,1.079,1.078,1.077,1.076,1.075,1.076,1.077,1.078,1.080,1.082,1.084\nGBPUSD: 1.265,1.263,1.261,1.260,1.259,1.258,1.257,1.256,1.255,1.256,1.257,1.258,1.260,1.262,1.264\nUSDJPY: 150.2,150.4,150.6,150.8,151.0,151.2,151.4,151.6,151.8,151.6,151.4,151.2,151.0,150.8,150.6\nAUDUSD: 0.655,0.653,0.651,0.650,0.649,0.648,0.647,0.646,0.645,0.646,0.647,0.648,0.650,0.652,0.654",
  );

  const { symbols, matrix } = useMemo(() => {
    const lines = input
      .trim()
      .split("\n")
      .filter((l) => l.includes(":"));
    const data = lines
      .map((line) => {
        const [sym, pricesStr] = line.split(":");
        const prices = pricesStr
          .trim()
          .split(",")
          .map(Number)
          .filter((n) => !isNaN(n));
        return { symbol: sym.trim(), prices };
      })
      .filter((d) => d.prices.length >= 3);

    const syms = data.map((d) => d.symbol);
    const mat = data.map((d1) => data.map((d2) => pearson(d1.prices, d2.prices)));
    return { symbols: syms, matrix: mat };
  }, [input]);

  const getColor = (v: number) => {
    if (v > 0.7) return "bg-bull/60 text-bull-foreground";
    if (v > 0.3) return "bg-bull/30";
    if (v > -0.3) return "bg-muted";
    if (v > -0.7) return "bg-bear/30";
    return "bg-bear/60 text-bear-foreground";
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Grid className="w-6 h-6 text-primary" /> Correlation Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pearson correlation heatmap across currency pairs. Identify diversification
            opportunities and hedging pairs.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">Symbol Data (symbol: price1,price2,...)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
          </div>

          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4 overflow-x-auto">
            <div className="text-sm font-semibold mb-3">Correlation Heatmap</div>
            {symbols.length >= 2 ? (
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="p-2" />
                    {symbols.map((s) => (
                      <th key={s} className="p-2 font-mono font-bold">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {symbols.map((sym, i) => (
                    <tr key={sym}>
                      <td className="p-2 font-mono font-bold">{sym}</td>
                      {symbols.map((_, j) => (
                        <td
                          key={j}
                          className={`p-2 text-center font-mono ${getColor(matrix[i][j])}`}
                        >
                          {i === j ? "1.00" : matrix[i][j].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Add at least 2 symbols with 3+ data points each.
              </div>
            )}

            <div className="mt-4 flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-bull/60" /> Strong Positive
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-muted" /> Neutral
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-bear/60" /> Strong Negative
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
