import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;
  pair?: string;
  sources?: { name: string; sentiment: "bullish" | "bearish" | "neutral"; weight: number }[];
}

export function SentimentGauge({
  bullishSignals,
  bearishSignals,
  neutralSignals,
  pair,
  sources,
}: Props) {
  const total = bullishSignals + bearishSignals + neutralSignals;

  const sentiment = useMemo(() => {
    if (total === 0) return { score: 50, label: "Neutral", color: "text-muted-foreground" };
    const score = ((bullishSignals - bearishSignals) / total) * 50 + 50; // 0-100 scale
    if (score >= 70) return { score, label: "Strong Bullish", color: "text-bull" };
    if (score >= 55) return { score, label: "Bullish", color: "text-bull" };
    if (score <= 30) return { score, label: "Strong Bearish", color: "text-bear" };
    if (score <= 45) return { score, label: "Bearish", color: "text-bear" };
    return { score, label: "Neutral", color: "text-muted-foreground" };
  }, [bullishSignals, bearishSignals, total]);

  // Gauge needle rotation: 0 = far left (bearish), 180 = far right (bullish)
  const rotation = (sentiment.score / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" /> Market Sentiment
          </span>
          {pair && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {pair}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Gauge visualization */}
        <div className="relative flex justify-center">
          <svg viewBox="0 0 200 110" className="w-48 h-28">
            {/* Background arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-muted/30"
              strokeLinecap="round"
            />
            {/* Colored segments */}
            <path
              d="M 20 100 A 80 80 0 0 1 60 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-bear/60"
              strokeLinecap="round"
            />
            <path
              d="M 60 40 A 80 80 0 0 1 100 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-bear/30"
              strokeLinecap="round"
            />
            <path
              d="M 100 20 A 80 80 0 0 1 140 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-bull/30"
              strokeLinecap="round"
            />
            <path
              d="M 140 40 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-bull/60"
              strokeLinecap="round"
            />
            {/* Needle */}
            <g transform={`rotate(${rotation}, 100, 100)`}>
              <line
                x1="100"
                y1="100"
                x2="100"
                y2="35"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-foreground"
                strokeLinecap="round"
              />
              <circle cx="100" cy="100" r="5" fill="currentColor" className="text-foreground" />
            </g>
            {/* Labels */}
            <text x="15" y="108" className="text-[8px] fill-bear" textAnchor="start">
              BEAR
            </text>
            <text x="185" y="108" className="text-[8px] fill-bull" textAnchor="end">
              BULL
            </text>
          </svg>
        </div>

        {/* Score display */}
        <div className="text-center -mt-2">
          <div className={`text-xl font-bold font-mono ${sentiment.color}`}>
            {sentiment.score.toFixed(0)}
          </div>
          <div className={`text-xs font-semibold ${sentiment.color}`}>{sentiment.label}</div>
        </div>

        {/* Signal breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded bg-bull/10 text-center">
            <TrendingUp className="w-3.5 h-3.5 text-bull mx-auto mb-0.5" />
            <div className="text-sm font-mono font-bold text-bull">{bullishSignals}</div>
            <div className="text-[9px] text-muted-foreground">Bullish</div>
          </div>
          <div className="p-2 rounded bg-muted/30 text-center">
            <Minus className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
            <div className="text-sm font-mono font-bold">{neutralSignals}</div>
            <div className="text-[9px] text-muted-foreground">Neutral</div>
          </div>
          <div className="p-2 rounded bg-bear/10 text-center">
            <TrendingDown className="w-3.5 h-3.5 text-bear mx-auto mb-0.5" />
            <div className="text-sm font-mono font-bold text-bear">{bearishSignals}</div>
            <div className="text-[9px] text-muted-foreground">Bearish</div>
          </div>
        </div>

        {/* Sources breakdown */}
        {sources && sources.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
              Signal Sources
            </div>
            {sources.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{s.name}</span>
                <Badge
                  className={`text-[9px] ${
                    s.sentiment === "bullish"
                      ? "bg-bull/10 text-bull border-bull/30"
                      : s.sentiment === "bearish"
                        ? "bg-bear/10 text-bear border-bear/30"
                        : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {s.sentiment}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
