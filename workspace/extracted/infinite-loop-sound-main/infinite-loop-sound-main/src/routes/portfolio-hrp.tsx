import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deriv, displayPair } from "@/lib/engine/deriv";
import type { Candle } from "@/lib/engine/indicators";
import { hierarchicalRiskParity, type HrpResult } from "@/tools/portfolio/hrp-optimizer";

export const Route = createFileRoute("/portfolio-hrp")({
  head: () => ({ meta: [{ title: "HRP Allocator — DivergenceIQ" }] }),
  component: HrpPage,
});

const DEFAULT_UNIVERSE = [
  "frxEURUSD",
  "frxGBPUSD",
  "frxUSDJPY",
  "frxAUDUSD",
  "frxXAUUSD",
  "frxBTCUSD",
];

const ALTERNATIVES = [
  "frxUSDCAD",
  "frxNZDUSD",
  "frxUSDCHF",
  "frxEURGBP",
  "frxXAGUSD",
  "frxETHUSD",
  "OTC_SPX",
  "R_100",
];

function returnsFrom(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close > 0) {
      out.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  return out;
}

function HrpPage() {
  const [universe, setUniverse] = useState<string[]>(DEFAULT_UNIVERSE);
  const [results, setResults] = useState<{
    hrp: HrpResult;
    vols: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUniverse = useMemo(
    () => async (symbols: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const assets: { symbol: string; returns: number[] }[] = [];
        const vols: Record<string, number> = {};
        for (const sym of symbols) {
          const candles = await deriv.getCandles(sym, "H1", 300);
          if (candles.length < 50) continue;
          const rets = returnsFrom(candles);
          assets.push({ symbol: sym, returns: rets });
          const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
          const varr = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
          vols[sym] = Math.sqrt(varr * 252 * 24); // hourly bars → annualize
        }
        if (assets.length < 2) throw new Error("not enough symbols with data");
        const hrp = hierarchicalRiskParity(assets);
        if (!hrp) throw new Error("HRP failed on this universe");
        setResults({ hrp, vols });
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to build allocation");
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadUniverse(universe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSymbol = (sym: string) => {
    setUniverse((u) =>
      u.includes(sym)
        ? u.filter((s) => s !== sym).length >= 2
          ? u.filter((s) => s !== sym)
          : u
        : [...u, sym],
    );
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Hierarchical Risk Parity Allocator</h1>
            <p className="text-muted-foreground text-sm">
              López de Prado's HRP: cluster-based allocation that needs no covariance inversion and
              stays stable when correlations are ill-conditioned.
            </p>
          </div>
          <Button onClick={() => void loadUniverse(universe)} disabled={loading}>
            {loading ? "Computing…" : "Rebalance"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Universe ({universe.length} assets)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...new Set([...DEFAULT_UNIVERSE, ...ALTERNATIVES])].map((sym) => (
              <button
                key={sym}
                onClick={() => toggleSymbol(sym)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  universe.includes(sym)
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {displayPair(sym)}
              </button>
            ))}
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="pt-6 text-red-500">{error}</CardContent>
          </Card>
        )}

        {loading && !results && (
          <Card>
            <CardContent className="text-muted-foreground pt-6">
              Fetching history and clustering…
            </CardContent>
          </Card>
        )}

        {results && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  Allocation · portfolio vol {(results.hrp.portfolioVol * 100).toFixed(1)}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>HRP Weight</TableHead>
                      <TableHead>Annualized Vol</TableHead>
                      <TableHead>Diversification bar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(results.hrp.weights)
                      .sort((a, b) => b[1] - a[1])
                      .map(([sym, w]) => (
                        <TableRow key={sym}>
                          <TableCell className="font-medium">{displayPair(sym)}</TableCell>
                          <TableCell>{(w * 100).toFixed(1)}%</TableCell>
                          <TableCell>{((results.vols[sym] ?? 0) * 100).toFixed(1)}%</TableCell>
                          <TableCell>
                            <div className="bg-muted h-2 w-full max-w-[160px] overflow-hidden rounded">
                              <div
                                className="bg-primary h-full"
                                style={{ width: `${Math.min(100, w * 400)}%` }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quasi-Diagonal Leaf Order</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Assets grouped by correlation structure — neighbors are the most similar and
                  should be treated as risk clusters rather than independent bets:
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
                  {results.hrp.order.map((sym, i) => (
                    <span key={`${sym}-${i}`} className="flex items-center gap-1">
                      <span className="bg-muted rounded px-2 py-1">{displayPair(sym)}</span>
                      {i < results.hrp.order.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
