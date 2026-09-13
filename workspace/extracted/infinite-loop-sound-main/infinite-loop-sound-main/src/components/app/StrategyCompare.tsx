import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriv, type TF } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";

interface Props {
  symbolA: string;
  symbolB: string;
  tf?: TF;
}

interface Row {
  symbol: string;
  rating: string;
  scorePct: number;
  direction: string;
}

/**
 * StrategyCompare — runs analyze() on two symbols side by side and shows
 * which one currently has the stronger setup. Useful for pair-vs-pair
 * decisions when capital is constrained.
 */
export function StrategyCompare({ symbolA, symbolB, tf = "H1" }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        [symbolA, symbolB].map(async (sym) => {
          const c = await deriv.getCandles(sym, tf, 200);
          const a = analyze(sym, tf, c, {});
          return {
            symbol: sym,
            rating: a.rating,
            scorePct: a.scorePct,
            direction: a.direction ?? "NEUTRAL",
          } as Row;
        }),
      );
      if (!cancelled) setRows(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [symbolA, symbolB, tf]);

  const winner = useMemo(() => {
    if (!rows) return null;
    return rows[0].scorePct >= rows[1].scorePct ? rows[0] : rows[1];
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compare · {tf}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!rows && <div className="text-sm text-muted-foreground">Analyzing…</div>}
        {rows?.map((r) => (
          <div
            key={r.symbol}
            className={`flex items-center justify-between rounded-md border p-2 text-sm ${winner?.symbol === r.symbol ? "border-primary bg-primary/5" : ""}`}
          >
            <span className="font-medium">{r.symbol}</span>
            <span className="flex items-center gap-2">
              <Badge variant="outline">{r.direction}</Badge>
              <span className="font-mono">{r.scorePct.toFixed(1)}%</span>
              <Badge>{r.rating}</Badge>
            </span>
          </div>
        ))}
        {winner && (
          <div className="pt-1 text-xs text-muted-foreground">
            Edge → <span className="font-medium text-foreground">{winner.symbol}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default StrategyCompare;
