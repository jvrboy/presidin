import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deriv, type TF } from "@/lib/engine/deriv";
import { generateTradeIdea, formatTradeIdea, type TradeIdea } from "@/lib/engine/trade-idea";

interface Props {
  symbol?: string;
  tf?: TF;
}

export function TradeIdeaCard({ symbol = "frxEURUSD", tf = "H1" }: Props) {
  const [idea, setIdea] = useState<TradeIdea | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const candles = await deriv.getCandles(symbol, tf, 300);
      setIdea(generateTradeIdea(symbol, tf, candles));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [symbol, tf]);

  const sideTone =
    idea?.side === "BUY"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      : idea?.side === "SELL"
        ? "bg-red-500/20 text-red-300 border-red-500/30"
        : "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Trade Idea · {symbol} {tf}
        </CardTitle>
        <div className="flex items-center gap-2">
          {idea && (
            <Badge className={sideTone}>
              {idea.side} · {idea.confidence}%
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!idea && <div className="text-sm text-muted-foreground">Generating…</div>}
        {idea && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Entry</div>
                <div className="font-mono">{idea.entry.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Stop</div>
                <div className="font-mono text-red-300">{idea.stopLoss.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">
                  Target ({idea.riskReward.toFixed(1)}R)
                </div>
                <div className="font-mono text-emerald-300">{idea.takeProfit.toFixed(5)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Confluence</div>
              <ul className="text-sm space-y-0.5">
                {idea.rationale.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
            {!!idea.warnings.length && (
              <div>
                <div className="text-xs text-yellow-400 mb-1">Warnings</div>
                <ul className="text-sm space-y-0.5 text-yellow-300">
                  {idea.warnings.map((w, i) => (
                    <li key={i}>! {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { formatTradeIdea };
export default TradeIdeaCard;
