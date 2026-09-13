import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssetSelect } from "@/components/app/AssetSelect";
import { deriv, ALL_ASSETS, displayPair, type TF } from "@/lib/engine/deriv";
import type { Candle } from "@/lib/engine/indicators";
import {
  consensusForecast,
  PERIODS_PER_YEAR,
  type VolEstimate,
  type GarchFit,
} from "@/tools/analytics/volatility-suite";

export const Route = createFileRoute("/volatility-lab")({
  head: () => ({ meta: [{ title: "Volatility Lab — DivergenceIQ" }] }),
  component: VolatilityLabPage,
});

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function VolatilityLabPage() {
  const [symbol, setSymbol] = useState(ALL_ASSETS[0].symbol);
  const [tf, setTf] = useState<TF>("H1");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const c = await deriv.getCandles(symbol, tf, 500);
        if (!cancelled) setCandles(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load candles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, tf]);

  // Convert to OHLC bars for the estimators
  const bars = useMemo(
    () =>
      candles.map((c) => ({
        timestamp: c.epoch * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    [candles],
  );

  const result = useMemo(() => {
    if (bars.length < 50) return null;
    return consensusForecast(bars);
  }, [bars]);

  const estimates: VolEstimate[] = result?.estimates ?? [];
  const garch: GarchFit | null = result?.garch ?? null;

  const regimeLabel = (
    vol: number,
  ): { label: string; variant: "default" | "secondary" | "destructive" } => {
    if (vol < 0.08) return { label: "Low vol", variant: "secondary" };
    if (vol <= 0.25) return { label: "Normal", variant: "default" };
    return { label: "High vol", variant: "destructive" };
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Volatility Lab</h1>
            <p className="text-muted-foreground text-sm">
              Institutional volatility estimators and GARCH/EWMA forecasts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-56">
              <AssetSelect value={symbol} onChange={setSymbol} />
            </div>
            <select
              className="bg-background border-border rounded-md border px-2 py-2 text-sm"
              value={tf}
              onChange={(e) => setTf(e.target.value as TF)}
            >
              {(["M15", "M30", "H1", "H4", "D1"] as TF[]).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <Card>
            <CardContent className="pt-6 text-red-500">{error}</CardContent>
          </Card>
        )}

        {loading && !result && (
          <Card>
            <CardContent className="text-muted-foreground pt-6">Loading candles…</CardContent>
          </Card>
        )}

        {result && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Consensus Vol</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pct(result.consensusAnnualizedVol)}</div>
                  <Badge variant={regimeLabel(result.consensusAnnualizedVol).variant}>
                    {regimeLabel(result.consensusAnnualizedVol).label}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">EWMA Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pct(result.ewmaAnnualizedVol)}</div>
                  <div className="text-muted-foreground text-xs">RiskMetrics λ=0.94</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">GARCH Next-Bar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {garch ? pct(garch.nextPeriodVol * Math.sqrt(PERIODS_PER_YEAR)) : "—"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {garch
                      ? `α=${garch.params.alpha.toFixed(2)} β=${garch.params.beta.toFixed(2)}`
                      : "insufficient data"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Estimator Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estimator</TableHead>
                      <TableHead>Annualized</TableHead>
                      <TableHead>Per bar</TableHead>
                      <TableHead>Samples</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estimates.map((e) => (
                      <TableRow key={e.estimator}>
                        <TableCell className="font-medium">
                          {e.estimator.replace(/_/g, "-")}
                        </TableCell>
                        <TableCell>{pct(e.annualizedVol)}</TableCell>
                        <TableCell>{(e.perPeriodVol * 100).toFixed(3)}%</TableCell>
                        <TableCell>{e.sampleSize}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-muted-foreground mt-3 text-xs">
                  Yang-Zhang handles overnight gaps and is drift-independent — the recommended
                  default for OHLC data. Range-based estimators use high/low information and are
                  more efficient under continuous trading.
                </p>
              </CardContent>
            </Card>

            {garch && (
              <Card>
                <CardHeader>
                  <CardTitle>GARCH(1,1) Forecast Path</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {garch.multiStepForecast.map((v, i) => (
                      <div key={i} className="bg-muted rounded-md px-3 py-2 text-center">
                        <div className="text-muted-foreground text-[10px]">+{i + 1}</div>
                        <div className="text-sm font-semibold">{pct(v)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-muted-foreground mt-3 space-y-1 text-xs">
                    <div>
                      Persistence α+β = {garch.params.persistence.toFixed(3)}{" "}
                      {garch.params.persistence > 0.97 && "(near unit-root — shocks decay slowly)"}
                    </div>
                    <div>Long-run vol: {pct(garch.params.longRunVol)}</div>
                    <div>Log-likelihood: {garch.params.logLikelihood.toFixed(2)}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="text-muted-foreground text-xs">
              Symbol: {displayPair(symbol)} · {bars.length} bars · {tf} timeframe
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
