import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  squeezeDetector,
  bodyRatio,
  compressionScore,
  type Candle,
} from "../../lib/engine/indicators";

interface Props {
  candles: Candle[];
}

export function SqueezeDetectorPanel({ candles }: Props) {
  if (candles.length < 5) return null;

  const squeeze3 = squeezeDetector(candles, 0.35, 3);
  const squeeze2 = squeezeDetector(candles, 0.25, 2);
  const compression = compressionScore(candles, 5);
  const lastBR = bodyRatio(candles[candles.length - 1]);

  const isSqueezing = squeeze3.isSqueezing;
  const isTightSqueeze = squeeze2.isSqueezing;
  const last5BRs = candles.slice(-5).map((c) => bodyRatio(c));

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Squeeze Detector
          {isSqueezing && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse">
              SQUEEZING
            </Badge>
          )}
          {isTightSqueeze && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">TIGHT</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Body Ratio Visualization */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Last 5 Candle Body Ratios</div>
          <div className="flex gap-1 items-end h-12">
            {last5BRs.map((br, i) => {
              const height = Math.max(4, br * 40);
              const isSmall = br < 0.35;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-mono text-muted-foreground">
                    {(br * 100).toFixed(0)}%
                  </span>
                  <div
                    className={`w-full rounded-sm transition-all ${isSmall ? "bg-emerald-500/60" : "bg-red-500/40"}`}
                    style={{ height: `${height}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
            <span>-5</span>
            <span className="text-red-400/60">35% threshold</span>
            <span>Now</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded bg-secondary/30 text-center">
            <div
              className={`text-lg font-bold ${isSqueezing ? "text-emerald-400" : "text-muted-foreground"}`}
            >
              {squeeze3.count}
            </div>
            <div className="text-[9px] text-muted-foreground">3-Bar Squeeze</div>
          </div>
          <div className="p-2 rounded bg-secondary/30 text-center">
            <div
              className={`text-lg font-bold ${isTightSqueeze ? "text-yellow-400" : "text-muted-foreground"}`}
            >
              {squeeze2.count}
            </div>
            <div className="text-[9px] text-muted-foreground">Tight (25%)</div>
          </div>
          <div className="p-2 rounded bg-secondary/30 text-center">
            <div
              className={`text-lg font-bold ${compression > 60 ? "text-blue-400" : "text-muted-foreground"}`}
            >
              {compression.toFixed(0)}
            </div>
            <div className="text-[9px] text-muted-foreground">Compression</div>
          </div>
        </div>

        {/* Interpretation */}
        <div className="text-[10px] text-muted-foreground">
          {isSqueezing
            ? "3+ consecutive doji-like candles detected. Breakout imminent — watch for SqueezeBreakout signal."
            : isTightSqueeze
              ? "2 tight candles (BR<25%). SmallBodyBreakout pattern forming."
              : "No active squeeze. Normal price action."}
        </div>
      </CardContent>
    </Card>
  );
}
