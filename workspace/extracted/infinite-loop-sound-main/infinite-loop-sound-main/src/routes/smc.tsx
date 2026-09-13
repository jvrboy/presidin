import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Activity,
  RefreshCw,
  DollarSign,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";
import { deriv, ALL_ASSETS, displayPair, type TF } from "@/lib/engine/deriv";
import {
  findSupplyDemandZones,
  type SupplyDemandZone,
} from "@/lib/strategies/advanced/supply-demand-strategy";
import { identifySRZones } from "@/lib/engine/support-resistance";
import { detectSwing, fibLevels } from "@/lib/engine/heatmap-analytics";
import { rsi, ema, type Candle } from "@/lib/engine/indicators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/smc")({
  head: () => ({
    meta: [
      { title: "Smart Money Concepts — DivergenceIQ" },
      {
        name: "description",
        content:
          "Order blocks, supply/demand zones, break of structure, and liquidity sweep detection on live Deriv candles.",
      },
    ],
  }),
  component: SMCPage,
});

interface OrderBlock {
  index: number;
  top: number;
  bottom: number;
  type: "bullish" | "bearish";
  strength: number;
  mitigated: boolean;
  time: number;
}

interface StructureBreak {
  index: number;
  type: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
  level: number;
  time: number;
}

interface LiquiditySweep {
  index: number;
  type: "buy-side" | "sell-side";
  level: number;
  swept: boolean;
  time: number;
}

interface SMCAnalysis {
  zones: SupplyDemandZone[];
  orderBlocks: OrderBlock[];
  breaks: StructureBreak[];
  sweeps: LiquiditySweep[];
  bias: "bullish" | "bearish" | "neutral";
  biasScore: number;
  lastClose: number;
  swing: { high: number; low: number; index: number } | null;
}

function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const lookback = Math.min(candles.length, 100);
  const slice = candles.slice(-lookback);

  for (let i = 2; i < slice.length - 1; i++) {
    const c = slice[i];
    const prev = slice[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;

    if (c.close > c.open && body > range * 0.6) {
      if (prev.close < prev.open) {
        const ob: OrderBlock = {
          index: lookback - slice.length + i,
          top: prev.high,
          bottom: prev.low,
          type: "bullish",
          strength: Math.min(1, body / (range * 1.5)),
          mitigated: false,
          time: slice[i].epoch,
        };
        for (let j = i + 1; j < slice.length; j++) {
          if (slice[j].low <= ob.top) {
            ob.mitigated = true;
            break;
          }
        }
        blocks.push(ob);
      }
    }

    if (c.close < c.open && body > range * 0.6) {
      if (prev.close > prev.open) {
        const ob: OrderBlock = {
          index: lookback - slice.length + i,
          top: prev.high,
          bottom: prev.low,
          type: "bearish",
          strength: Math.min(1, body / (range * 1.5)),
          mitigated: false,
          time: slice[i].epoch,
        };
        for (let j = i + 1; j < slice.length; j++) {
          if (slice[j].high >= ob.bottom) {
            ob.mitigated = true;
            break;
          }
        }
        blocks.push(ob);
      }
    }
  }

  return blocks.slice(-8);
}

function detectStructureBreaks(candles: Candle[]): StructureBreak[] {
  const breaks: StructureBreak[] = [];
  const lookback = Math.min(candles.length, 120);
  const slice = candles.slice(-lookback);

  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows: { idx: number; price: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    if (
      slice[i].high > slice[i - 1].high &&
      slice[i].high > slice[i - 2].high &&
      slice[i].high > slice[i + 1].high &&
      slice[i].high > slice[i + 2].high
    ) {
      swingHighs.push({ idx: i, price: slice[i].high });
    }
    if (
      slice[i].low < slice[i - 1].low &&
      slice[i].low < slice[i - 2].low &&
      slice[i].low < slice[i + 1].low &&
      slice[i].low < slice[i + 2].low
    ) {
      swingLows.push({ idx: i, price: slice[i].low });
    }
  }

  let lastBias: "bullish" | "bearish" | null = null as "bullish" | "bearish" | null;
  for (let i = 0; i < swingHighs.length - 1; i++) {
    const sh = swingHighs[i];
    const nextSh = swingHighs[i + 1];
    if (nextSh.price > sh.price) {
      const isChoch = (lastBias as string | null) === "bearish";
      breaks.push({
        index: nextSh.idx,
        type: isChoch ? "CHoCH" : "BOS",
        direction: "bullish" as const,
        level: sh.price,
        time: slice[nextSh.idx].epoch,
      });
      lastBias = "bullish";
    }
  }
  for (let i = 0; i < swingLows.length - 1; i++) {
    const sl = swingLows[i];
    const nextSl = swingLows[i + 1];
    if (nextSl.price < sl.price) {
      const isChoch = (lastBias as string | null) === "bullish";
      breaks.push({
        index: nextSl.idx,
        type: isChoch ? "CHoCH" : "BOS",
        direction: "bearish" as const,
        level: sl.price,
        time: slice[nextSl.idx].epoch,
      });
      lastBias = "bearish";
    }
  }

  return breaks.slice(-6);
}

function detectLiquiditySweeps(candles: Candle[]): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  const lookback = Math.min(candles.length, 80);
  const slice = candles.slice(-lookback);

  const highs: { idx: number; price: number }[] = [];
  const lows: { idx: number; price: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].high > slice[i - 1].high && slice[i].high > slice[i + 1].high) {
      highs.push({ idx: i, price: slice[i].high });
    }
    if (slice[i].low < slice[i - 1].low && slice[i].low < slice[i + 1].low) {
      lows.push({ idx: i, price: slice[i].low });
    }
  }

  for (const h of highs) {
    for (let j = h.idx + 1; j < slice.length; j++) {
      if (slice[j].high > h.price && slice[j].close < h.price) {
        sweeps.push({
          index: j,
          type: "buy-side",
          level: h.price,
          swept: true,
          time: slice[j].epoch,
        });
        break;
      }
    }
  }
  for (const l of lows) {
    for (let j = l.idx + 1; j < slice.length; j++) {
      if (slice[j].low < l.price && slice[j].close > l.price) {
        sweeps.push({
          index: j,
          type: "sell-side",
          level: l.price,
          swept: true,
          time: slice[j].epoch,
        });
        break;
      }
    }
  }

  return sweeps.slice(-6);
}

function SMCPage() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("H1");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<SMCAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await deriv.connect();
      const cs = await deriv.getCandles(symbol, tf, 250);
      if (cs.length < 50) {
        setError("Insufficient candles for SMC analysis.");
        setLoading(false);
        return;
      }
      setCandles(cs);

      const zones = findSupplyDemandZones(cs, 200);
      const orderBlocks = detectOrderBlocks(cs);
      const breaks = detectStructureBreaks(cs);
      const sweeps = detectLiquiditySweeps(cs);

      const bullishBreaks = breaks.filter((b) => b.direction === "bullish").length;
      const bearishBreaks = breaks.filter((b) => b.direction === "bearish").length;
      const unmitigatedBull = orderBlocks.filter(
        (o) => o.type === "bullish" && !o.mitigated,
      ).length;
      const unmitigatedBear = orderBlocks.filter(
        (o) => o.type === "bearish" && !o.mitigated,
      ).length;
      const bullScore = bullishBreaks * 2 + unmitigatedBull;
      const bearScore = bearishBreaks * 2 + unmitigatedBear;
      const biasScore = Math.round(
        ((bullScore - bearScore) / Math.max(1, bullScore + bearScore)) * 100,
      );
      const bias = biasScore > 15 ? "bullish" : biasScore < -15 ? "bearish" : "neutral";

      const lastClose = cs[cs.length - 1].close;
      const swing = detectSwing(cs, 120);

      setAnalysis({
        zones,
        orderBlocks,
        breaks,
        sweeps,
        bias,
        biasScore,
        lastClose,
        swing: swing ? { high: swing.highPrice, low: swing.lowPrice, index: swing.highIdx } : null,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load SMC analysis");
      toast.error("SMC scan failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

  const srZones = useMemo(
    () => (candles.length ? identifySRZones(candles, 120).slice(0, 5) : []),
    [candles],
  );
  const fib = useMemo(
    () => (candles.length ? fibLevels(detectSwing(candles, 120)!) : null),
    [candles],
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-cyan-500 grid place-items-center">
                <Layers className="w-5 h-5 text-white" />
              </div>
              Smart Money Concepts
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Order blocks, supply/demand, break of structure, liquidity sweeps — computed from live
              Deriv {tf} candles
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm"
            >
              {ALL_ASSETS.slice(0, 30).map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {displayPair(a.symbol)}
                </option>
              ))}
            </select>
            <select
              value={tf}
              onChange={(e) => setTf(e.target.value as TF)}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm"
            >
              {["M15", "M30", "H1", "H4", "D1"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Scan
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-sm text-bear flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {analysis && (
          <>
            {/* Bias Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div
                className={`rounded-xl border p-4 ${
                  analysis.bias === "bullish"
                    ? "border-bull/30 bg-bull/5"
                    : analysis.bias === "bearish"
                      ? "border-bear/30 bg-bear/5"
                      : "border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Market Bias
                  </span>
                  {analysis.bias === "bullish" ? (
                    <TrendingUp className="w-4 h-4 text-bull" />
                  ) : analysis.bias === "bearish" ? (
                    <TrendingDown className="w-4 h-4 text-bear" />
                  ) : (
                    <Activity className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div
                  className={`text-xl font-bold capitalize ${
                    analysis.bias === "bullish"
                      ? "text-bull"
                      : analysis.bias === "bearish"
                        ? "text-bear"
                        : "text-muted-foreground"
                  }`}
                >
                  {analysis.bias}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Score: {analysis.biasScore > 0 ? "+" : ""}
                  {analysis.biasScore}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Order Blocks
                  </span>
                  <Shield className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold font-mono">{analysis.orderBlocks.length}</div>
                <div className="text-xs text-muted-foreground">
                  {analysis.orderBlocks.filter((o) => !o.mitigated).length} unmitigated
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Structure Breaks
                  </span>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold font-mono">{analysis.breaks.length}</div>
                <div className="text-xs text-muted-foreground">
                  {analysis.breaks.filter((b) => b.type === "CHoCH").length} CHoCH
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Liquidity Sweeps
                  </span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold font-mono">{analysis.sweeps.length}</div>
                <div className="text-xs text-muted-foreground">
                  {analysis.sweeps.filter((s) => s.type === "buy-side").length} buy /{" "}
                  {analysis.sweeps.filter((s) => s.type === "sell-side").length} sell
                </div>
              </div>
            </div>

            {/* Order Blocks */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Order Blocks
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {analysis.orderBlocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No order blocks detected.</p>
                ) : (
                  <div className="space-y-2">
                    {analysis.orderBlocks.map((ob, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ob.type === "bullish"
                                ? "bg-bull/20 text-bull"
                                : "bg-bear/20 text-bear"
                            }`}
                          >
                            {ob.type === "bullish" ? "BULL OB" : "BEAR OB"}
                          </span>
                          <span className="font-mono text-xs">
                            {ob.bottom.toFixed(5)} — {ob.top.toFixed(5)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${ob.type === "bullish" ? "bg-bull" : "bg-bear"}`}
                              style={{ width: `${ob.strength * 100}%` }}
                            />
                          </div>
                          {ob.mitigated ? (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                              mitigated
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-400 text-[10px] border-0">
                              fresh
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supply / Demand Zones */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" /> Supply & Demand Zones
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {analysis.zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No zones detected.</p>
                ) : (
                  <div className="space-y-2">
                    {analysis.zones.map((z, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              z.type === "demand" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                            }`}
                          >
                            {z.type.toUpperCase()}
                          </span>
                          <span className="font-mono text-xs">
                            {z.priceRange.low.toFixed(5)} — {z.priceRange.high.toFixed(5)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${z.type === "demand" ? "bg-bull" : "bg-bear"}`}
                              style={{ width: `${z.strength * 20}%` }}
                            />
                          </div>
                          {z.isFresh && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] border-0">
                              fresh
                            </Badge>
                          )}
                          {z.causedBOS && (
                            <Badge className="bg-violet-500/20 text-violet-400 text-[10px] border-0">
                              BOS
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Structure Breaks + Liquidity Sweeps */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Structure Breaks
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {analysis.breaks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No breaks detected.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {analysis.breaks.map((b, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded bg-muted/20 px-3 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                b.type === "CHoCH"
                                  ? "bg-violet-500/20 text-violet-400"
                                  : "bg-cyan-500/20 text-cyan-400"
                              }`}
                            >
                              {b.type}
                            </span>
                            <span className={b.direction === "bullish" ? "text-bull" : "text-bear"}>
                              {b.direction}
                            </span>
                          </div>
                          <span className="font-mono text-muted-foreground">
                            @ {b.level.toFixed(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Liquidity Sweeps
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {analysis.sweeps.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No sweeps detected.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {analysis.sweeps.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded bg-muted/20 px-3 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                s.type === "buy-side"
                                  ? "bg-bull/20 text-bull"
                                  : "bg-bear/20 text-bear"
                              }`}
                            >
                              {s.type === "buy-side" ? "BUY-SIDE" : "SELL-SIDE"}
                            </span>
                            <CircleCheck className="w-3 h-3 text-amber-400" />
                          </div>
                          <span className="font-mono text-muted-foreground">
                            @ {s.level.toFixed(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* S/R + Fib Confluence */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                    Key S/R Zones
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {srZones.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No zones.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {srZones.map((z, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded bg-muted/20 px-3 py-1.5 text-xs"
                        >
                          <span className={z.type === "support" ? "text-bull" : "text-bear"}>
                            {z.type.toUpperCase()}
                            {z.isFlipZone ? " · FLIP" : ""}
                          </span>
                          <span className="font-mono">{z.level.toFixed(5)}</span>
                          <span className="text-muted-foreground">
                            {z.touches}× · str {z.strength}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                    Fibonacci Confluence
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {!fib ? (
                    <p className="text-xs text-muted-foreground italic">Insufficient data.</p>
                  ) : (
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Swing: {fib.dir.toUpperCase()}</span>
                        <span>
                          {fib.low.toFixed(5)} → {fib.high.toFixed(5)}
                        </span>
                      </div>
                      {fib.levels.slice(0, 6).map((l, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded px-2 py-1 bg-muted/20"
                        >
                          <span>{l.ratio}</span>
                          <span>{l.price.toFixed(5)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Data: live Deriv {tf} candles · Order blocks from institutional candle patterns · S/D
              zones from base+momentum · BOS/CHoCH from swing structure · Liquidity sweeps from wick
              reversals · refresh every 2min
            </p>
          </>
        )}

        {!analysis && !error && !loading && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Select a pair and click Scan to detect order blocks, structure breaks, and liquidity
                sweeps.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
