import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { deriv, ALL_ASSETS, displayPair, type TF } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";
import { identifySRZones } from "@/lib/engine/support-resistance";
import { fibLevels } from "@/lib/engine/fibonacci";
import type { Candle } from "@/lib/engine/indicators";

export const Route = createFileRoute("/mtf")({
  head: () => ({
    meta: [
      { title: "Multi-Timeframe Analyzer" },
      { name: "description", content: "Aligned bias across M15/H1/H4/D1 with SR + Fib overlay." },
    ],
  }),
  component: MTFPage,
});

const TFS: TF[] = ["M15", "H1", "H4", "D1"];

interface TFRow {
  tf: TF;
  bias: "BUY" | "SELL" | null;
  score: number;
  rating: string;
  price: number;
  candles: Candle[];
}

function MTFPage() {
  const [symbol, setSymbol] = useState<string>("frxEURUSD");
  const [rows, setRows] = useState<TFRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const out: TFRow[] = [];
      for (const tf of TFS) {
        const candles = await deriv.getCandles(symbol, tf, 220);
        const a = analyze(symbol, tf, candles);
        out.push({
          tf,
          bias: a.direction,
          score: a.scorePct,
          rating: a.rating,
          price: candles[candles.length - 1]?.close ?? 0,
          candles,
        });
      }
      setRows(out);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const alignment = useMemo(() => {
    const dirs = rows.map((r) => r.bias).filter(Boolean) as ("BUY" | "SELL")[];
    if (dirs.length === 0) return { verdict: "NO SIGNAL", tone: "text-muted-foreground" };
    const buys = dirs.filter((d) => d === "BUY").length;
    const sells = dirs.filter((d) => d === "SELL").length;
    if (buys === TFS.length) return { verdict: "STRONG BUY", tone: "text-emerald-500" };
    if (sells === TFS.length) return { verdict: "STRONG SELL", tone: "text-rose-500" };
    if (buys >= 3) return { verdict: "BUY BIAS", tone: "text-emerald-400" };
    if (sells >= 3) return { verdict: "SELL BIAS", tone: "text-rose-400" };
    return { verdict: "MIXED", tone: "text-amber-400" };
  }, [rows]);

  const highestTF = rows[rows.length - 1];
  const zones = useMemo(
    () => (highestTF ? identifySRZones(highestTF.candles, 120).slice(0, 6) : []),
    [highestTF],
  );
  const fib = useMemo(() => (highestTF ? fibLevels(highestTF.candles, 120) : null), [highestTF]);

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Multi-Timeframe Analyzer</h1>
          <select
            className="ml-auto rounded-md bg-background border border-border px-3 py-2 text-sm"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {ALL_ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {displayPair(a.symbol)}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{displayPair(symbol)}</span>
              <span className={"text-lg font-bold " + alignment.tone}>{alignment.verdict}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {rows.map((r) => (
                <div
                  key={r.tf}
                  className="rounded-lg border border-border bg-card/40 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{r.tf}</span>
                    <Badge
                      variant="outline"
                      className={
                        r.bias === "BUY"
                          ? "border-emerald-500 text-emerald-400"
                          : r.bias === "SELL"
                            ? "border-rose-500 text-rose-400"
                            : ""
                      }
                    >
                      {r.bias ?? "—"}
                    </Badge>
                  </div>
                  <div className="text-sm font-mono">{r.price.toFixed(5)}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.rating} · {r.score.toFixed(0)}%
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={
                        "h-full transition-all " +
                        (r.bias === "BUY"
                          ? "bg-emerald-500"
                          : r.bias === "SELL"
                            ? "bg-rose-500"
                            : "bg-muted-foreground/40")
                      }
                      style={{ width: `${Math.min(100, r.score)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key S/R Zones ({highestTF?.tf ?? "—"})</CardTitle>
            </CardHeader>
            <CardContent>
              {zones.length === 0 && (
                <div className="text-sm text-muted-foreground">No zones detected.</div>
              )}
              <div className="space-y-1.5">
                {zones.map((z, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-sm"
                  >
                    <span className={z.type === "support" ? "text-emerald-400" : "text-rose-400"}>
                      {z.type.toUpperCase()}
                      {z.isFlipZone ? " · FLIP" : ""}
                    </span>
                    <span className="font-mono">{z.level.toFixed(5)}</span>
                    <span className="text-xs text-muted-foreground">
                      {z.touches}× · str {z.strength}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fibonacci ({highestTF?.tf ?? "—"})</CardTitle>
            </CardHeader>
            <CardContent>
              {!fib ? (
                <div className="text-sm text-muted-foreground">Insufficient candles.</div>
              ) : (
                <div className="space-y-1 text-sm font-mono">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Swing: {fib.direction.toUpperCase()}</span>
                    <span>
                      {fib.swingLow.toFixed(5)} → {fib.swingHigh.toFixed(5)}
                    </span>
                  </div>
                  {fib.levels.map((l) => (
                    <div
                      key={l.label + l.kind}
                      className={
                        "flex items-center justify-between rounded px-2 py-1 " +
                        (l.kind === "retracement" ? "bg-muted/20" : "bg-muted/10")
                      }
                    >
                      <span>
                        {l.label}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {l.kind === "extension" ? "ext" : ""}
                        </span>
                      </span>
                      <span>{l.price.toFixed(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
