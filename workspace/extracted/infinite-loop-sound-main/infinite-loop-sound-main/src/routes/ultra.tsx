import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  Globe,
  DollarSign,
  Users,
  Zap,
  Target,
  Twitter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deriv, ALL_ASSETS } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";
import { computeOrderFlow } from "@/lib/engine/heatmap-analytics";
import { rsi, atr, adx, type Candle } from "@/lib/engine/indicators";

export const Route = createFileRoute("/ultra")({
  head: () => ({ meta: [{ title: "Ultra Confluence — DivergenceIQ" }] }),
  component: UltraConfluencePage,
});

interface UltraSignal {
  pair: string;
  display: string;
  direction: "BUY" | "SELL";
  ultraScore: number;
  technical: number;
  sentiment: number;
  fundamental: number;
  ai: number;
  optionsFlow: number;
  darkPool: number;
  prediction: string;
  confidence: number;
  lastClose: number;
  atrPips: number;
}

// Map display pairs to Deriv symbols
const PAIRS: Array<{ display: string; symbol: string }> = [
  { display: "EUR/USD", symbol: "frxEURUSD" },
  { display: "GBP/USD", symbol: "frxGBPUSD" },
  { display: "USD/JPY", symbol: "frxUSDJPY" },
  { display: "XAU/USD", symbol: "frxXAUUSD" },
  { display: "AUD/USD", symbol: "frxAUDUSD" },
  { display: "USD/CHF", symbol: "frxUSDCHF" },
  { display: "NZD/USD", symbol: "frxNZDUSD" },
  { display: "EUR/GBP", symbol: "frxEURGBP" },
  { display: "GBP/JPY", symbol: "frxGBPJPY" },
  { display: "EUR/JPY", symbol: "frxEURJPY" },
];

function pipSize(symbol: string): number {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol.startsWith("frx")) return 0.0001;
  return 0.1;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function UltraConfluencePage() {
  const [signals, setSignals] = useState<UltraSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  const generateUltraSignals = useCallback(async () => {
    setLoading(true);
    try {
      await deriv.connect();
      const results: UltraSignal[] = [];

      for (const p of PAIRS) {
        try {
          const candles = await deriv.getCandles(p.symbol, "H1", 220);
          if (candles.length < 60) continue;

          const a = analyze(p.symbol, "H1", candles);
          if (!a.direction || !a.trade) continue;

          const last = candles.length - 1;
          const close = candles.map((c) => c.close);
          const lastClose = close[last];

          // Factor 1: Technical — from analyze() scorePct
          const technical = clamp(a.scorePct);

          // Factor 2: Sentiment — RSI extreme + momentum
          const rsiSeries = rsi(close, 14);
          const lastRSI = rsiSeries[last] ?? 50;
          const rsiScore =
            a.direction === "BUY"
              ? clamp(100 - lastRSI) // oversold → bullish
              : clamp(lastRSI); // overbought → bearish
          // Momentum: 10-bar rate of change
          const roc = ((lastClose - close[last - 10]) / close[last - 10]) * 100;
          const momentumScore = clamp(50 + (a.direction === "BUY" ? roc * 5 : -roc * 5));
          const sentiment = clamp(rsiScore * 0.6 + momentumScore * 0.4);

          // Factor 3: Fundamental — ADX trend strength + ATR volatility regime
          const adxRes = adx(candles, 14);
          const lastADX = adxRes.adx[last] ?? 0;
          const fundamental = clamp(lastADX * 2.5);

          // Factor 4: AI — neural-style score from confluence breadth
          const passedCount = a.confluence.filter((c) => c.passed).length;
          const ai = clamp((passedCount / a.confluence.length) * 100);

          // Factor 5: Options Flow — order flow imbalance proxy
          const ticks = candles.slice(-50).map((c, i) => ({
            epoch: c.epoch,
            quote: c.close,
          }));
          const flow = computeOrderFlow(ticks);
          const flowRatio =
            flow.buyVol + flow.sellVol > 0
              ? a.direction === "BUY"
                ? flow.buyVol / (flow.buyVol + flow.sellVol)
                : flow.sellVol / (flow.buyVol + flow.sellVol)
              : 0.5;
          const optionsFlow = clamp(flowRatio * 100);

          // Factor 6: Dark Pool — volume anomaly (last vol vs 20-bar avg)
          const vols = candles.slice(-20).map((c) => c.volume ?? 1);
          const avgVol = vols.reduce((s, v) => s + v, 0) / vols.length;
          const lastVol = candles[last].volume ?? 1;
          const volRatio = avgVol > 0 ? lastVol / avgVol : 1;
          const darkPool = clamp((volRatio - 1) * 100 + 50);

          // Weighted ultra score
          const ultraScore = Math.round(
            technical * 0.25 +
              sentiment * 0.1 +
              fundamental * 0.15 +
              ai * 0.2 +
              optionsFlow * 0.15 +
              darkPool * 0.15,
          );

          if (ultraScore < 55) continue;

          const confidence = clamp((ultraScore - 50) * 2);
          const atrSeries = atr(candles, 14);
          const lastATR = atrSeries[last] ?? 0;
          const atrPips = lastATR / pipSize(p.symbol);
          const movePips = Math.round(atrPips * 1.5);
          const sign = a.direction === "BUY" ? "+" : "-";

          results.push({
            pair: p.display,
            display: p.display,
            direction: a.direction,
            ultraScore,
            technical,
            sentiment,
            fundamental,
            ai,
            optionsFlow,
            darkPool,
            prediction: p.symbol.includes("XAU")
              ? `$${sign}${Math.round(movePips * 0.3)}`
              : `${sign}${movePips} pips`,
            confidence,
            lastClose,
            atrPips,
          });
        } catch {
          // skip pair on error
        }
      }

      results.sort((a, b) => b.ultraScore - a.ultraScore);
      setSignals(results.slice(0, 8));
      setLastScanAt(Date.now());
    } catch (e) {
      console.error("Ultra scan failed:", e);
      toast.error("Ultra scan failed — retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generateUltraSignals();
    const interval = setInterval(generateUltraSignals, 120_000);
    return () => clearInterval(interval);
  }, [generateUltraSignals]);

  const refresh = () => {
    toast.info("Scanning ultra confluence across all factors...");
    generateUltraSignals().then(() => {
      toast.success(`Found ${signals.length} ultra signals`);
    });
  };

  const ago = lastScanAt ? Math.round((Date.now() - lastScanAt) / 1000) : null;

  // Aggregate factor averages for the overview cards
  const factorAvgs = signals.length
    ? {
        technical: Math.round(signals.reduce((s, x) => s + x.technical, 0) / signals.length),
        sentiment: Math.round(signals.reduce((s, x) => s + x.sentiment, 0) / signals.length),
        fundamental: Math.round(signals.reduce((s, x) => s + x.fundamental, 0) / signals.length),
        ai: Math.round(signals.reduce((s, x) => s + x.ai, 0) / signals.length),
        optionsFlow: Math.round(signals.reduce((s, x) => s + x.optionsFlow, 0) / signals.length),
        darkPool: Math.round(signals.reduce((s, x) => s + x.darkPool, 0) / signals.length),
      }
    : { technical: 0, sentiment: 0, fundamental: 0, ai: 0, optionsFlow: 0, darkPool: 0 };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 grid place-items-center animate-pulse">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              Ultra Confluence
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              6-factor analysis from live Deriv H1 candles · Technical + Sentiment + Fundamental +
              AI + Options Flow + Dark Pool
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30">
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
              )}
              <span className="text-xs font-mono text-primary">
                {loading ? "SCANNING" : ago !== null ? `LIVE · ${ago}s ago` : "STARTING"}
              </span>
            </div>
            <Button onClick={refresh} disabled={loading}>
              <Zap className="w-4 h-4 mr-2" />
              {loading ? "Scanning..." : "Scan Ultra"}
            </Button>
          </div>
        </div>

        {/* Factor Overview — live averages */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: "Technical",
              icon: Activity,
              value: factorAvgs.technical,
              color: "text-cyan-400",
              desc: "analyze() score",
            },
            {
              label: "Sentiment",
              icon: Twitter,
              value: factorAvgs.sentiment,
              color: "text-blue-400",
              desc: "RSI + momentum",
            },
            {
              label: "Fundamental",
              icon: Globe,
              value: factorAvgs.fundamental,
              color: "text-emerald-400",
              desc: "ADX trend strength",
            },
            {
              label: "AI Neural",
              icon: Brain,
              value: factorAvgs.ai,
              color: "text-violet-400",
              desc: "Confluence breadth",
            },
            {
              label: "Options Flow",
              icon: TrendingUp,
              value: factorAvgs.optionsFlow,
              color: "text-amber-400",
              desc: "Order flow imbalance",
            },
            {
              label: "Dark Pool",
              icon: Users,
              value: factorAvgs.darkPool,
              color: "text-pink-400",
              desc: "Volume anomaly",
            },
          ].map((factor) => (
            <div
              key={factor.label}
              className="rounded-xl border border-border bg-card/60 backdrop-blur p-3 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <factor.icon className={`w-4 h-4 ${factor.color}`} />
                <span className={`text-lg font-bold font-mono ${factor.color}`}>
                  {factor.value}%
                </span>
              </div>
              <div className="text-xs font-medium">{factor.label}</div>
              <div className="text-[10px] text-muted-foreground">{factor.desc}</div>
            </div>
          ))}
        </div>

        {/* Ultra Signals */}
        <div className="space-y-3">
          {loading && signals.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <div className="inline-flex items-center gap-3 text-muted-foreground">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Analyzing 6 confluence factors from live Deriv candles...
              </div>
            </div>
          )}
          {!loading && signals.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                No ultra-confluence signals right now. Signals require a minimum composite score of
                55.
              </p>
            </div>
          )}
          {signals.map((signal) => (
            <div
              key={signal.pair}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-card/80 to-card/40 backdrop-blur hover:border-violet-500/50 transition-all hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-violet-500/10"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative p-5 md:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl grid place-items-center ${signal.direction === "BUY" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}
                    >
                      {signal.direction === "BUY" ? (
                        <TrendingUp className="w-6 h-6" />
                      ) : (
                        <TrendingDown className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-bold font-mono">{signal.pair}</h3>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${signal.direction === "BUY" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}
                        >
                          {signal.direction}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Target: {signal.prediction}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          @ {signal.lastClose.toFixed(signal.lastClose > 100 ? 2 : 5)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 font-mono">
                          {signal.confidence}% confidence
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Ultra Score
                    </div>
                    <div className="text-4xl font-bold font-mono bg-gradient-to-br from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                      {signal.ultraScore}
                    </div>
                  </div>
                </div>

                {/* Confluence Breakdown */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
                  {[
                    { name: "TECH", value: signal.technical, icon: Activity },
                    { name: "SENT", value: signal.sentiment, icon: Twitter },
                    { name: "FUND", value: signal.fundamental, icon: Globe },
                    { name: "AI", value: signal.ai, icon: Brain },
                    { name: "OPTS", value: signal.optionsFlow, icon: DollarSign },
                    { name: "DARK", value: signal.darkPool, icon: Users },
                  ].map((factor) => (
                    <div key={factor.name} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <factor.icon className="w-3 h-3" />
                          {factor.name}
                        </span>
                        <span className="text-[10px] font-mono font-medium">{factor.value}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${factor.value}%`,
                            background:
                              factor.value >= 85
                                ? "linear-gradient(90deg, #10b981, #38bdf8)"
                                : factor.value >= 70
                                  ? "linear-gradient(90deg, #f59e0b, #eab308)"
                                  : "linear-gradient(90deg, #6b7280, #9ca3af)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Target className="w-3.5 h-3.5" />
                      ATR: {signal.atrPips.toFixed(1)} pips
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Zap className="w-3.5 h-3.5" />
                      {signal.confidence}% confidence
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Data: live Deriv H1 candles · Technical from analyze() · Sentiment from RSI+momentum ·
          Fundamental from ADX · AI from confluence breadth · Options Flow from order flow · Dark
          Pool from volume anomaly · refresh every 2min
        </p>
      </div>
    </AppShell>
  );
}
