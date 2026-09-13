import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scanHeat, type HeatRow } from "@/lib/engine/heat-scanner";
import type { TF } from "@/lib/engine/deriv";

interface Props {
  tf?: TF;
  limit?: number;
}

const heatColor = (h: number) =>
  h >= 4
    ? "bg-red-500/20 text-red-300 border-red-500/30 animate-pulse"
    : h === 3
      ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
      : h === 2
        ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
        : h === 1
          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
          : "";

export function MarketHeatScanner({ tf = "M15", limit = 12 }: Props) {
  const [rows, setRows] = useState<HeatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await scanHeat({ tf });
      setRows(r.slice(0, limit));
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [tf, limit]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Market Heat Scanner · {tf}</CardTitle>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(updatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? "Scanning…" : "Scan"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {!rows.length && !loading && (
          <div className="text-sm text-muted-foreground">No data yet. Press Scan.</div>
        )}
        {rows.map((r) => (
          <div
            key={r.symbol}
            className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <Badge className={heatColor(r.heat)}>{r.heat}</Badge>
              <span className="font-medium">{r.symbol}</span>
            </span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{r.lastPrice.toFixed(5)}</span>
              <span
                className={`font-mono ${r.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {r.changePct >= 0 ? "+" : ""}
                {r.changePct.toFixed(2)}%
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default MarketHeatScanner;
