import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo } from "react";
import {
  analyzeVolatilityRegime,
  type VolatilityRegime,
  type RegimeAnalysis,
} from "@/lib/engine/volatility-regime";
import { Flame, Activity, AlertTriangle, Shield, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/volatility")({
  head: () => ({
    meta: [
      { title: "Volatility Regime — DivergenceIQ" },
      {
        name: "description",
        content:
          "Detect and adapt to current market volatility regime. Adjust position sizing and strategy selection.",
      },
    ],
  }),
  component: VolatilityPage,
});

// Generate sample candle data for demonstration
function generateSampleCandles(count = 100) {
  const candles: { epoch: number; high: number; low: number; close: number; open: number }[] = [];
  const baseEpoch = Math.floor(Date.now() / 1000) - count * 3600;
  let price = 1.1;
  let volatility = 0.001;

  for (let i = 0; i < count; i++) {
    // Regime shifts
    if (i === 30) volatility = 0.003;
    if (i === 60) volatility = 0.0005;
    if (i === 80) volatility = 0.004;

    const change = (Math.random() - 0.5) * volatility * 2;
    const open = price;
    price += change;
    const high = Math.max(open, price) + Math.random() * volatility * 0.5;
    const low = Math.min(open, price) - Math.random() * volatility * 0.5;
    candles.push({ epoch: baseEpoch + i * 3600, open, high, low, close: price });
  }
  return candles;
}

function VolatilityPage() {
  const [pair] = useState("EUR/USD");
  const [timeframe] = useState("H1");

  const sampleCandles = useMemo(() => generateSampleCandles(100), []);

  const regimeAnalysis = useMemo(() => {
    return analyzeVolatilityRegime(sampleCandles);
  }, [sampleCandles]);

  // Adapt to the RegimeAnalysis interface
  const regime = useMemo(
    () => ({
      regime:
        regimeAnalysis.regime === "QUIET"
          ? "LOW"
          : regimeAnalysis.regime === "ELEVATED"
            ? "HIGH"
            : regimeAnalysis.regime,
      currentATR: regimeAnalysis.atrCurrent,
      percentile: regimeAnalysis.atrPercentile,
      avgATR: regimeAnalysis.atrCurrent * 0.85,
      ratio: regimeAnalysis.positionSizeMultiplier,
      expanding: regimeAnalysis.velocity > 0,
    }),
    [regimeAnalysis],
  );

  const regimeColors: Record<string, string> = {
    LOW: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    QUIET: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    NORMAL: "text-bull bg-bull/10 border-bull/30",
    HIGH: "text-medium bg-medium/10 border-medium/30",
    ELEVATED: "text-medium bg-medium/10 border-medium/30",
    EXTREME: "text-bear bg-bear/10 border-bear/30",
  };

  const regimeAdvice: Record<string, { sizing: string; strategy: string; stops: string }> = {
    LOW: {
      sizing: "Normal or slightly larger positions. Tight stops work well.",
      strategy: "Range-bound strategies, mean reversion, scalping.",
      stops: "Tight stops (10-15 pips). Low volatility = less noise.",
    },
    NORMAL: {
      sizing: "Standard position sizing. Follow your plan.",
      strategy: "Trend-following, breakout strategies work well.",
      stops: "Normal stops (20-30 pips). ATR-based sizing recommended.",
    },
    HIGH: {
      sizing: "Reduce position size by 25-50%. Wider stops needed.",
      strategy: "Momentum strategies, breakouts with confirmation.",
      stops: "Wider stops (40-60 pips). Use ATR × 1.5 for stop distance.",
    },
    EXTREME: {
      sizing: "Reduce to 25-50% of normal size. Consider sitting out.",
      strategy: "Only high-probability setups. Avoid counter-trend trades.",
      stops: "Very wide stops or no trades. News-driven moves are unpredictable.",
    },
  };

  const advice = regimeAdvice[regime.regime] || regimeAdvice.NORMAL;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" /> Volatility Regime Detector
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically detect market volatility regime and get adaptive trading recommendations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Current Regime */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Current Regime
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <Badge className={`${regimeColors[regime.regime]} text-lg px-4 py-2 font-bold`}>
                  {regime.regime === "EXTREME" && <AlertTriangle className="w-5 h-5 mr-2" />}
                  {regime.regime}
                </Badge>
                <div className="text-xs text-muted-foreground mt-2">
                  {pair} · {timeframe}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Current ATR</span>
                  <span className="font-mono font-semibold">{regime.currentATR.toFixed(5)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">ATR Percentile</span>
                  <span className="font-mono font-semibold">{regime.percentile.toFixed(0)}th</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Avg ATR (20)</span>
                  <span className="font-mono font-semibold">{regime.avgATR.toFixed(5)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Volatility Ratio</span>
                  <span
                    className={`font-mono font-semibold ${regime.ratio > 1.5 ? "text-bear" : regime.ratio < 0.7 ? "text-blue-400" : "text-bull"}`}
                  >
                    {regime.ratio.toFixed(2)}x
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Expanding/Contracting</span>
                  <span
                    className={`font-mono font-semibold ${regime.expanding ? "text-bear" : "text-bull"}`}
                  >
                    {regime.expanding ? "📈 Expanding" : "📉 Contracting"}
                  </span>
                </div>
              </div>

              {/* Volatility gauge */}
              <div className="pt-3 border-t border-border">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">
                  Volatility Level
                </div>
                <div className="h-3 bg-muted/30 rounded-full overflow-hidden relative">
                  <div className="absolute inset-0 flex">
                    <div className="w-1/4 bg-blue-500/30 border-r border-background/50" />
                    <div className="w-1/4 bg-bull/30 border-r border-background/50" />
                    <div className="w-1/4 bg-medium/30 border-r border-background/50" />
                    <div className="w-1/4 bg-bear/30" />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full transition-all"
                    style={{ left: `${Math.min(98, regime.percentile)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                  <span>Low</span>
                  <span>Normal</span>
                  <span>High</span>
                  <span>Extreme</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Adaptive Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="text-[9px] uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Position Sizing
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {advice.sizing}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bull/5 border border-bull/20">
                  <div className="text-[9px] uppercase tracking-wider text-bull font-semibold mb-1.5 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Strategy Selection
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {advice.strategy}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-medium/5 border border-medium/20">
                  <div className="text-[9px] uppercase tracking-wider text-medium font-semibold mb-1.5 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Stop Loss
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {advice.stops}
                  </p>
                </div>
              </div>

              {/* Regime history visualization */}
              <div className="pt-3 border-t border-border">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Regime History (Last 100 Candles)
                </div>
                <div className="flex gap-0.5 h-8">
                  {sampleCandles.map((c, i) => {
                    const range = c.high - c.low;
                    const maxRange = Math.max(...sampleCandles.map((x) => x.high - x.low));
                    const height = maxRange > 0 ? (range / maxRange) * 100 : 50;
                    const color =
                      height > 75
                        ? "bg-bear/60"
                        : height > 50
                          ? "bg-medium/60"
                          : height > 25
                            ? "bg-bull/60"
                            : "bg-blue-500/60";
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t ${color}`}
                        style={{ height: `${Math.max(10, height)}%`, alignSelf: "flex-end" }}
                        title={`Candle ${i + 1}: Range ${(range * 10000).toFixed(1)} pips`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Risk multiplier table */}
              <div className="pt-3 border-t border-border">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">
                  Position Size Multiplier by Regime
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    {
                      regime: "LOW",
                      mult: "1.25x",
                      color: "bg-blue-500/10 border-blue-500/30 text-blue-400",
                    },
                    {
                      regime: "NORMAL",
                      mult: "1.0x",
                      color: "bg-bull/10 border-bull/30 text-bull",
                    },
                    {
                      regime: "HIGH",
                      mult: "0.5x",
                      color: "bg-medium/10 border-medium/30 text-medium",
                    },
                    {
                      regime: "EXTREME",
                      mult: "0.25x",
                      color: "bg-bear/10 border-bear/30 text-bear",
                    },
                  ].map((r) => (
                    <div
                      key={r.regime}
                      className={`p-2 rounded border text-center ${r.color} ${
                        r.regime === regime.regime ? "ring-1 ring-current" : "opacity-60"
                      }`}
                    >
                      <div className="text-[9px] uppercase font-semibold">{r.regime}</div>
                      <div className="text-sm font-mono font-bold">{r.mult}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning for extreme volatility */}
              {regime.regime === "EXTREME" && (
                <div className="p-3 rounded-lg bg-bear/10 border border-bear/30 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-bear mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-bear">
                      Extreme Volatility Warning
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Market is in an extreme volatility regime. Consider reducing position sizes to
                      25% of normal or sitting out entirely. News events or liquidity gaps may cause
                      unpredictable moves.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
