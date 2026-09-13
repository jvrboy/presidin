import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildEquityCurve, type TradeRecord } from "@/lib/engine/equity-curve";

interface Props {
  trades: TradeRecord[];
  startingBalance?: number;
}

/**
 * EquityCurveWidget — renders a compact equity-curve summary (SVG sparkline)
 * with PnL, max drawdown, and win rate. Read-only; takes pre-loaded trades.
 */
export function EquityCurveWidget({ trades, startingBalance = 10_000 }: Props) {
  const summary = useMemo(
    () => buildEquityCurve(trades, startingBalance),
    [trades, startingBalance],
  );

  const path = useMemo(() => {
    if (summary.series.length < 2) return "";
    const xs = summary.series.map((_, i) => i);
    const ys = summary.series.map((p) => p.equity);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const range = maxY - minY || 1;
    return xs
      .map((x, i) => {
        const px = (x / (xs.length - 1)) * 100;
        const py = 100 - ((ys[i] - minY) / range) * 100;
        return `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
      })
      .join(" ");
  }, [summary.series]);

  const positive = summary.pnl >= 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Equity Curve</CardTitle>
        <Badge variant={positive ? "default" : "destructive"}>
          {positive ? "+" : ""}
          {summary.pnlPct.toFixed(2)}%
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full">
          <path
            d={path}
            fill="none"
            stroke={positive ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Ending balance</div>
            <div className="font-mono">${summary.endingBalance.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Net PnL</div>
            <div className="font-mono">${summary.pnl.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Max DD</div>
            <div className="font-mono">{summary.maxDrawdownPct.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Win rate</div>
            <div className="font-mono">{summary.winRate.toFixed(1)}%</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground text-xs">Trades</div>
            <div className="font-mono">{summary.totalTrades}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EquityCurveWidget;
