import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Target, Shield, TrendingUp, AlertTriangle } from "lucide-react";

export interface RRLevel {
  label: string;
  price: number;
  type: "entry" | "sl" | "tp";
}

interface Props {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  direction: "BUY" | "SELL";
  pair: string;
}

export function RiskRewardVisualizer({ entry, sl, tp1, tp2, tp3, direction, pair }: Props) {
  const levels = useMemo(() => {
    const all: RRLevel[] = [
      { label: "Entry", price: entry, type: "entry" },
      { label: "Stop Loss", price: sl, type: "sl" },
      { label: "TP1 (1:1)", price: tp1, type: "tp" },
      { label: "TP2 (1:2)", price: tp2, type: "tp" },
      { label: "TP3 (1:3)", price: tp3, type: "tp" },
    ];
    return all.sort((a, b) => b.price - a.price);
  }, [entry, sl, tp1, tp2, tp3]);

  const riskPips = useMemo(() => {
    const factor = pair.includes("JPY") ? 100 : 10000;
    return Math.abs(entry - sl) * factor;
  }, [entry, sl, pair]);

  const rewardPips = useMemo(() => {
    const factor = pair.includes("JPY") ? 100 : 10000;
    return Math.abs(tp3 - entry) * factor;
  }, [entry, tp3, pair]);

  const rrRatio = riskPips > 0 ? (rewardPips / riskPips).toFixed(2) : "∞";

  const maxPrice = Math.max(...levels.map((l) => l.price));
  const minPrice = Math.min(...levels.map((l) => l.price));
  const range = maxPrice - minPrice || 1;

  const getPosition = (price: number) => {
    return ((maxPrice - price) / range) * 100;
  };

  const getColor = (type: RRLevel["type"]) => {
    switch (type) {
      case "entry":
        return "bg-primary border-primary text-primary-foreground";
      case "sl":
        return "bg-bear/20 border-bear text-bear";
      case "tp":
        return "bg-bull/20 border-bull text-bull";
    }
  };

  const getLineColor = (type: RRLevel["type"]) => {
    switch (type) {
      case "entry":
        return "border-primary/60";
      case "sl":
        return "border-bear/60";
      case "tp":
        return "border-bull/60";
    }
  };

  const riskQuality = useMemo(() => {
    const ratio = parseFloat(rrRatio);
    if (ratio >= 3) return { label: "Excellent", color: "text-bull", icon: TrendingUp };
    if (ratio >= 2) return { label: "Good", color: "text-primary", icon: Target };
    if (ratio >= 1) return { label: "Fair", color: "text-medium", icon: Shield };
    return { label: "Poor", color: "text-bear", icon: AlertTriangle };
  }, [rrRatio]);

  const QualityIcon = riskQuality.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Risk/Reward Visualizer
          </span>
          <Badge className={`${riskQuality.color} bg-transparent border-current text-[10px]`}>
            <QualityIcon className="w-3 h-3 mr-1" />
            {riskQuality.label} (1:{rrRatio})
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Visual ladder */}
        <div className="relative h-48 ml-20 mr-4 my-3">
          {/* Background gradient */}
          <div className="absolute inset-0 rounded-lg overflow-hidden">
            <div
              className="absolute inset-x-0 bg-gradient-to-b from-bull/5 to-transparent"
              style={{ top: 0, height: `${getPosition(entry)}%` }}
            />
            <div
              className="absolute inset-x-0 bg-gradient-to-t from-bear/5 to-transparent"
              style={{ top: `${getPosition(entry)}%`, bottom: 0 }}
            />
          </div>

          {/* Price levels */}
          {levels.map((level, i) => (
            <div
              key={i}
              className="absolute inset-x-0 flex items-center"
              style={{ top: `${getPosition(level.price)}%`, transform: "translateY(-50%)" }}
            >
              <div
                className={`absolute -left-20 text-[10px] font-mono ${
                  level.type === "sl"
                    ? "text-bear"
                    : level.type === "tp"
                      ? "text-bull"
                      : "text-primary"
                }`}
              >
                {level.label}
              </div>
              <div className={`w-full border-t border-dashed ${getLineColor(level.type)}`} />
              <div
                className={`absolute right-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${getColor(level.type)}`}
              >
                {level.price.toFixed(pair.includes("JPY") ? 3 : 5)}
              </div>
            </div>
          ))}

          {/* Direction arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 text-lg"
            style={{ top: `${getPosition(entry)}%`, transform: "translate(-50%, -50%)" }}
          >
            {direction === "BUY" ? "⬆️" : "⬇️"}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="p-2 rounded bg-bear/10 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Risk</div>
            <div className="text-sm font-mono font-bold text-bear">{riskPips.toFixed(1)} pips</div>
          </div>
          <div className="p-2 rounded bg-bull/10 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Reward (TP3)</div>
            <div className="text-sm font-mono font-bold text-bull">
              {rewardPips.toFixed(1)} pips
            </div>
          </div>
          <div className="p-2 rounded bg-primary/10 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">R:R Ratio</div>
            <div className="text-sm font-mono font-bold text-primary">1:{rrRatio}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
