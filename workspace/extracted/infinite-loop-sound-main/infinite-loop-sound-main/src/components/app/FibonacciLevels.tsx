import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriv, type TF } from "@/lib/engine/deriv";
import { fibLevels, nearestFib, type FibResult } from "@/lib/engine/fibonacci";

interface Props {
  symbol?: string;
  tf?: TF;
  lookback?: number;
}

/**
 * FibonacciLevels — auto-detects the dominant swing in the last N candles
 * and plots retracements + extensions. Refreshes every 60s.
 */
export function FibonacciLevels({ symbol = "frxEURUSD", tf = "H1", lookback = 100 }: Props) {
  const [result, setResult] = useState<FibResult | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const candles = await deriv.getCandles(symbol, tf, lookback);
      if (!mounted || !candles.length) return;
      setPrice(candles[candles.length - 1].close);
      setResult(fibLevels(candles, lookback));
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [symbol, tf, lookback]);

  const nearest = result && price != null ? nearestFib(price, result) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Fibonacci · {symbol} {tf}
        </CardTitle>
        {result && (
          <Badge variant="outline">{result.direction === "up" ? "↑ swing" : "↓ swing"}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!result && <div className="text-sm text-muted-foreground">Loading…</div>}
        {result && (
          <>
            <div className="text-xs text-muted-foreground">
              Swing {result.swingLow.toFixed(5)} → {result.swingHigh.toFixed(5)}
            </div>
            <div className="divide-y rounded-md border">
              {result.levels.map((l) => {
                const isNearest = nearest?.level === l;
                return (
                  <div
                    key={`${l.kind}-${l.ratio}`}
                    className={`flex items-center justify-between px-3 py-1.5 text-sm ${isNearest ? "bg-primary/10 font-medium" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <Badge
                        variant={l.kind === "retracement" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {l.kind === "retracement" ? "R" : "E"}
                      </Badge>
                      {l.label}
                    </span>
                    <span className="font-mono">{l.price.toFixed(5)}</span>
                  </div>
                );
              })}
            </div>
            {nearest && price != null && (
              <div className="text-xs text-muted-foreground">
                Price {price.toFixed(5)} · {nearest.distancePct.toFixed(3)}% from{" "}
                {nearest.level.label}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default FibonacciLevels;
