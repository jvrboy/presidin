import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useCallback } from "react";
import { deriv, ALL_ASSETS, displayPair, type TF } from "@/lib/engine/deriv";
import {
  scanPatterns,
  type PatternScanResult,
  type DetectedPattern,
} from "@/lib/agents/pattern-agent";
import {
  Activity,
  RefreshCw,
  Loader as Loader,
  TrendingUp,
  TrendingDown,
  Gauge,
  Flame,
  ChartCandlestick as CandlestickChart,
  Layers,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/technical-analysis")({
  head: () => ({
    meta: [
      { title: "Technical Analysis — Divergence IQ" },
      {
        name: "description",
        content:
          "Agentic pattern-recognition engine: candlestick patterns, trend filters, momentum, and volatility compression scored into a composite bias.",
      },
    ],
  }),
  component: TechnicalAnalysisPage,
});

const TFS: TF[] = ["M15", "H1", "H4", "D1"];

function TechnicalAnalysisPage() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("H4");
  const [result, setResult] = useState<PatternScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      await deriv.connect();
      const candles = await deriv.getCandles(symbol, tf, 250);
      if (candles.length < 35) {
        setError("Not enough candles to scan patterns.");
        return;
      }
      setResult(scanPatterns(candles));
    } catch (e: any) {
      setError(e?.message || "Failed to fetch candles from Deriv.");
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  useEffect(() => {
    run();
  }, [run]);

  const bias = result?.compositeBias ?? "neutral";
  const biasLabel = bias === "bull" ? "BULLISH" : bias === "bear" ? "BEARISH" : "NEUTRAL";
  const biasCls =
    bias === "bull" ? "text-bull" : bias === "bear" ? "text-bear" : "text-muted-foreground";

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-24 pt-4 sm:px-5 md:px-6 md:pb-8 md:pt-6">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card/80 p-4 shadow-sm md:flex-row md:items-end md:justify-between md:p-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
                <Sparkles className="h-3 w-3" /> Agentic Pattern Engine
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
              Technical Analysis
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Candlestick patterns, trend filters, momentum, and volatility compression scored into
              a composite bias by the pattern-recognition agent.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {ALL_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.display}
                </option>
              ))}
            </select>
            <select
              value={tf}
              onChange={(e) => setTf(e.target.value as TF)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {TFS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={run}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent disabled:opacity-50"
            >
              {loading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Rescan
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-bear/40 bg-bear/10 p-3 text-sm text-bear">
            {error}
          </div>
        )}

        {result && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={bias === "bull" ? TrendingUp : bias === "bear" ? TrendingDown : Gauge}
                label="Composite Bias"
                value={biasLabel}
                tone={bias}
              />
              <StatCard
                icon={Activity}
                label="Composite Score"
                value={`${result.compositeScore > 0 ? "+" : ""}${result.compositeScore}`}
                tone={
                  result.compositeScore > 0
                    ? "bull"
                    : result.compositeScore < 0
                      ? "bear"
                      : "neutral"
                }
              />
              <StatCard
                icon={Flame}
                label="HA Trend"
                value={result.haTrend.toUpperCase()}
                tone={
                  result.haTrend === "up" ? "bull" : result.haTrend === "down" ? "bear" : "neutral"
                }
              />
              <StatCard
                icon={Layers}
                label="Keltner Squeeze"
                value={result.squeeze ? "ACTIVE" : "OFF"}
                tone={result.squeeze ? "bull" : "neutral"}
              />
            </section>

            <section className="rounded-lg border border-border bg-card/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CandlestickChart className="h-4 w-4 text-primary" />
                Detected Patterns ({result.patterns.length})
              </div>
              {result.patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No high-confidence patterns detected on this timeframe.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Pattern</th>
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4">Bias</th>
                        <th className="py-2 pr-4">Confidence</th>
                        <th className="py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.patterns.map((p, i) => (
                        <PatternRow key={`${p.name}-${i}`} p={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card/80 p-4 text-xs text-muted-foreground shadow-sm">
              <span className="font-medium text-foreground">Momentum score:</span>{" "}
              {result.momentum > 0 ? "+" : ""}
              {result.momentum.toFixed(1)} (−100 … +100). Scan runs candlestick detectors,
              Supertrend, Ichimoku TK cross, ADX trend strength, RSI/MACD momentum, and Keltner
              squeeze, then weight-averages them into the composite score.
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: "bull" | "bear" | "neutral";
}) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular ${cls}`}>{value}</div>
    </div>
  );
}

function PatternRow({ p }: { p: DetectedPattern }) {
  const biasCls =
    p.bias === "bull" ? "text-bull" : p.bias === "bear" ? "text-bear" : "text-muted-foreground";
  const confCls =
    p.confidence >= 80 ? "text-elite" : p.confidence >= 65 ? "text-bull" : "text-muted-foreground";
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
      <td className="py-2.5 pr-4 capitalize text-muted-foreground">{p.category}</td>
      <td className={`py-2.5 pr-4 font-semibold uppercase ${biasCls}`}>{p.bias}</td>
      <td className={`py-2.5 pr-4 font-mono ${confCls}`}>{p.confidence.toFixed(0)}%</td>
      <td className="py-2.5 text-muted-foreground">{p.note}</td>
    </tr>
  );
}
