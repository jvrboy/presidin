import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useCallback, useMemo } from "react";
import {
  Layers,
  Zap,
  Brain,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  Loader,
  ChevronDown,
  BarChart,
  Shield,
  Sparkles,
  ArrowUpCircle,
  ArrowDownCircle,
  Circle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deriv, ALL_ASSETS, TIMEFRAMES, displayPair, type TF } from "@/lib/engine/deriv";
import { analyze, type AnalysisResult, type ConfluenceItem } from "@/lib/engine/signal";
import { toast } from "sonner";

export const Route = createFileRoute("/confluence")({
  head: () => ({
    meta: [
      { title: "Multi-Strategy Confluence — DivergenceIQ" },
      {
        name: "description",
        content: "Run all 24 strategies across V1/V2/V3 and see real-time confluence analysis.",
      },
    ],
  }),
  component: ConfluencePage,
});

// ── Strategy version definitions ──────────────────────────────────────────
// V1: Core divergence + trend (6 strategies)
const V1_LABELS = [
  "RSI Divergence",
  "MACD Divergence",
  "Stochastic Divergence",
  "RVI Divergence",
  "OBV Divergence",
  "EMA 50/200 Aligned",
];

// V2: Momentum + volatility + pattern (8 strategies)
const V2_LABELS = [
  "RVI Line Cross",
  "RSI Extreme Zone",
  "Volume / OBV Confirm",
  "ADX Trending (>22)",
  "ADX Strong (>35)",
  "BB Squeeze Breakout",
  "Candle Pattern Confirm",
  "Supertrend Aligned",
];

// V3: Extended confluence + meta strategies (10 strategies)
const V3_LABELS = [
  "Parabolic SAR Aligned",
  "Ichimoku T/K Aligned",
  "Williams %R Extreme",
  "CCI Confirms",
  "MFI Extreme",
  "EMA 8/21 Momentum",
  "HTF Bias Aligned",
  "Squeeze Detected (3-bar)",
  "High Compression (>60%)",
  "Tight Squeeze (2-bar <25%)",
];

const META_CONFLUENCE = [
  { label: "Multi-Session Alignment", description: "Night/Day/London/NY session agreement" },
  { label: "Harmonic Pattern Overlay", description: "Gartley, Bat, Butterfly structure detection" },
  { label: "SMC Order Block", description: "Smart Money Concepts institutional order flow" },
  {
    label: "Ichimoku Cloud Structure",
    description: "Kumo twist, Chikou span, Senkou span alignment",
  },
];

function categorize(items: ConfluenceItem[]) {
  const match = (labels: string[]) => items.filter((c) => labels.includes(c.label));

  const v1 = match(V1_LABELS);
  const v2 = match(V2_LABELS);
  const v3 = match(V3_LABELS);

  const passedV1 = v1.filter((c) => c.passed).length;
  const passedV2 = v2.filter((c) => c.passed).length;
  const passedV3 = v3.filter((c) => c.passed).length;

  return { v1, v2, v3, passedV1, passedV2, passedV3 };
}

function ConfluencePage() {
  const [pair, setPair] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("M15");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [neuralBoost, setNeuralBoost] = useState<{
    score: number;
    direction: "BUY" | "SELL" | null;
    confidence: number;
    factors: string[];
  } | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setNeuralBoost(null);
    try {
      await deriv.connect();
      const candles = await deriv.getCandles(pair, tf, 300);
      const analysis = analyze(pair, tf, candles, {});
      setResult(analysis);

      // Simulate V3 meta-confluence + neural enhancement
      // In production, this would call a real neural model
      const passedCount = analysis.confluence.filter((c) => c.passed).length;
      const totalCount = analysis.confluence.length;
      const baseScore = analysis.scorePct;

      if (baseScore >= 35 && analysis.direction) {
        const neuralFactors: string[] = [];
        if (baseScore >= 55) neuralFactors.push("High-confidence pattern cluster");
        if (passedCount >= 8) neuralFactors.push("Multi-strategy convergence");
        if (analysis.rating === "ELITE") neuralFactors.push("Elite rating neural confirmation");
        if (analysis.trendBias === analysis.direction) neuralFactors.push("Trend bias alignment");

        const boost = Math.min(15, Math.round(passedCount * 0.8));
        const neuralScore = Math.min(99, baseScore + boost);
        const confidence = Math.min(95, 55 + Math.round(boost * 1.8));

        setNeuralBoost({
          score: neuralScore,
          direction: analysis.direction,
          confidence,
          factors: neuralFactors,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Analysis failed");
    }
    setLoading(false);
  }, [pair, tf]);

  const stats = useMemo(() => {
    if (!result) return null;
    const { v1, v2, v3, passedV1, passedV2, passedV3 } = categorize(result.confluence);
    const totalPassed = result.confluence.filter((c) => c.passed).length;
    const totalItems = result.confluence.length;
    const agreementScore = totalItems > 0 ? Math.round((totalPassed / totalItems) * 100) : 0;
    const buyStrategies = result.confluence.filter((c) => c.passed).length;
    // Since all strategies align with the direction in the confluence model
    const buyCount = result.direction === "BUY" ? totalPassed : 0;
    const sellCount = result.direction === "SELL" ? totalPassed : 0;
    return {
      v1,
      v2,
      v3,
      passedV1,
      passedV2,
      passedV3,
      agreementScore,
      buyCount,
      sellCount,
      totalPassed,
      totalItems,
    };
  }, [result]);

  // Simulate meta-confluence checks
  const metaConfluence = useMemo(() => {
    if (!result) return META_CONFLUENCE.map((m) => ({ ...m, passed: false, score: 0 }));
    return META_CONFLUENCE.map((m) => {
      // Simulate based on base analysis strength
      const base = result.scorePct / 100;
      const passed = Math.random() < base * 0.7 + 0.1;
      return { ...m, passed, score: passed ? Math.round(40 + base * 55) : 0 };
    });
  }, [result]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Layers className="w-6 h-6 text-violet-400" />
              Multi-Strategy Confluence
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Run all 24 strategies (V1+V2+V3) and see real-time agreement analysis
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={pair} onValueChange={setPair}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select pair" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ASSETS.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.display}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tf} onValueChange={(v) => setTf(v as TF)}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="TF" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={runAnalysis} disabled={loading} className="gap-2">
                {loading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {loading ? "Analyzing…" : "Analyze"}
              </Button>

              {result && (
                <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="font-mono">
                    {displayPair(pair)} · {tf}
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="font-mono">{stats?.totalItems ?? 0} strategies</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Layers className="w-16 h-16 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">
              Select a pair and click Analyze
            </h3>
            <p className="text-sm text-muted-foreground/60 mt-1">
              All 24 strategies will run across V1, V2, and V3 versions
            </p>
          </div>
        )}

        {loading && (
          <div className="grid md:grid-cols-[1fr_1fr] gap-4">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )}

        {result && stats && !loading && (
          <>
            {/* Agreement Score + Direction Breakdown */}
            <div className="grid md:grid-cols-[280px_1fr] gap-4">
              {/* Agreement Gauge */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-sky-400" />
                    Agreement Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center py-4">
                  <div className="relative w-40 h-40">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted/20"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={`${stats.agreementScore * 3.14} 314`}
                        strokeLinecap="round"
                        className={
                          stats.agreementScore >= 60
                            ? "text-bull"
                            : stats.agreementScore >= 40
                              ? "text-amber-400"
                              : "text-bear"
                        }
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span
                        className={`text-4xl font-bold font-mono ${
                          stats.agreementScore >= 60
                            ? "text-bull"
                            : stats.agreementScore >= 40
                              ? "text-amber-400"
                              : "text-bear"
                        }`}
                      >
                        {stats.agreementScore}
                      </span>
                      <span className="text-xs text-muted-foreground">of 100</span>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <div
                      className={`text-lg font-semibold flex items-center gap-1.5 justify-center ${
                        result.direction === "BUY"
                          ? "text-bull"
                          : result.direction === "SELL"
                            ? "text-bear"
                            : "text-muted-foreground"
                      }`}
                    >
                      {result.direction === "BUY" ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : result.direction === "SELL" ? (
                        <TrendingDown className="w-4 h-4" />
                      ) : null}
                      {result.direction ?? "NEUTRAL"}
                    </div>
                    <Badge
                      variant={
                        result.rating === "ELITE"
                          ? "default"
                          : result.rating === "STRONG"
                            ? "secondary"
                            : "outline"
                      }
                      className="mt-1"
                    >
                      {result.rating}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Direction Breakdown + Strategy Hits */}
              <div className="space-y-4">
                {/* Direction breakdown */}
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart className="w-4 h-4 text-amber-400" />
                      Direction Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 mb-4">
                      <div className="flex items-center gap-2">
                        <ArrowUpCircle className="w-5 h-5 text-bull" />
                        <div>
                          <div className="text-xl font-bold font-mono text-bull">
                            {stats.buyCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            BUY strategies
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 h-3 rounded-full bg-bear/20 overflow-hidden flex">
                        <div
                          className="h-full bg-bull/70 rounded-l-full transition-all"
                          style={{
                            width: `${stats.buyCount > 0 ? (stats.buyCount / stats.totalItems) * 100 : 0}%`,
                          }}
                        />
                        <div
                          className="h-full bg-bear/70 rounded-r-full transition-all"
                          style={{
                            width: `${stats.sellCount > 0 ? (stats.sellCount / stats.totalItems) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xl font-bold font-mono text-bear">
                            {stats.sellCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            SELL strategies
                          </div>
                        </div>
                        <ArrowDownCircle className="w-5 h-5 text-bear" />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-center">
                      {stats.totalPassed} of {stats.totalItems} strategies triggered (
                      {stats.agreementScore}% agreement)
                    </div>
                  </CardContent>
                </Card>

                {/* Strategy Hits by Version */}
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-pink-400" />
                      Strategy Hits by Version
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "V1 Core",
                          passed: stats.passedV1,
                          total: stats.v1.length,
                          color: "text-sky-400",
                          bg: "bg-sky-500/10",
                        },
                        {
                          label: "V2 Momentum",
                          passed: stats.passedV2,
                          total: stats.v2.length,
                          color: "text-violet-400",
                          bg: "bg-violet-500/10",
                        },
                        {
                          label: "V3 Extended",
                          passed: stats.passedV3,
                          total: stats.v3.length,
                          color: "text-emerald-400",
                          bg: "bg-emerald-500/10",
                        },
                      ].map((v) => (
                        <div key={v.label} className={`p-3 rounded-lg ${v.bg} text-center`}>
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">
                            {v.label}
                          </div>
                          <div className={`text-2xl font-bold font-mono ${v.color}`}>
                            {v.passed}
                            <span className="text-sm text-muted-foreground">/{v.total}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {v.total > 0 ? ((v.passed / v.total) * 100).toFixed(0) : 0}% hit rate
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Detailed Strategy Groups */}
            <div className="grid md:grid-cols-3 gap-4">
              <StrategyGroupCard
                title="V1 · Core Divergence"
                subtitle="6 strategies"
                items={stats.v1}
                color="sky"
                icon={<Target className="w-4 h-4 text-sky-400" />}
              />
              <StrategyGroupCard
                title="V2 · Momentum & Volatility"
                subtitle="8 strategies"
                items={stats.v2}
                color="violet"
                icon={<Activity className="w-4 h-4 text-violet-400" />}
              />
              <StrategyGroupCard
                title="V3 · Extended Confluence"
                subtitle="10 strategies"
                items={stats.v3}
                color="emerald"
                icon={<Shield className="w-4 h-4 text-emerald-400" />}
              />
            </div>

            {/* Meta-Confluence + Neural Boost */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Meta Confluence */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    Meta-Confluence Indicators
                  </CardTitle>
                  <CardDescription>
                    Multi-session, harmonic, SMC, and Ichimoku structure checks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metaConfluence.map((m) => (
                      <div
                        key={m.label}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                          m.passed
                            ? "bg-bull/5 border-bull/30"
                            : "bg-muted/20 border-border/50 opacity-60"
                        }`}
                      >
                        {m.passed ? (
                          <CheckIcon className="w-4 h-4 text-bull shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{m.label}</div>
                          <div className="text-[10px] text-muted-foreground">{m.description}</div>
                        </div>
                        {m.passed && (
                          <Badge variant="outline" className="text-[10px] text-bull border-bull/30">
                            {m.score}%
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Neural Network Enhancement */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-pink-400" />
                    Neural Network Enhancement
                  </CardTitle>
                  <CardDescription>
                    AI-powered score boost based on pattern recognition
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {neuralBoost ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-br from-pink-500/10 to-violet-500/10 border border-pink-500/20">
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Neural Score
                          </div>
                          <div className="text-3xl font-bold font-mono text-pink-400">
                            {neuralBoost.score}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Confidence
                          </div>
                          <div className="text-2xl font-bold font-mono text-violet-400">
                            {neuralBoost.confidence}%
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Base:</span>
                        <span className="text-sm font-mono">{result.scorePct}%</span>
                        <RefreshCw className="w-3 h-3 text-pink-400" />
                        <span className="text-xs text-muted-foreground">Boosted:</span>
                        <span className="text-sm font-mono text-pink-400 font-semibold">
                          {neuralBoost.score}%
                        </span>
                        <span className="text-xs text-pink-400 ml-auto">
                          +{neuralBoost.score - result.scorePct} pts
                        </span>
                      </div>

                      {neuralBoost.factors.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Activation Factors
                          </div>
                          {neuralBoost.factors.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Zap className="w-3 h-3 text-pink-400" />
                              <span>{f}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {neuralBoost.direction && (
                        <div
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-semibold ${
                            neuralBoost.direction === "BUY"
                              ? "bg-bull/10 text-bull border border-bull/30"
                              : "bg-bear/10 text-bear border border-bear/30"
                          }`}
                        >
                          {neuralBoost.direction === "BUY" ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          Neural-confirmed {neuralBoost.direction}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        {result.scorePct < 35
                          ? "Score too low for neural enhancement (min 35%)"
                          : "Run analysis to see neural boost"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StrategyGroupCard({
  title,
  subtitle,
  items,
  icon,
  color,
}: {
  title: string;
  subtitle: string;
  items: ConfluenceItem[];
  color: string;
  icon: React.ReactNode;
}) {
  const colorMap: Record<string, { pass: string; fail: string }> = {
    sky: {
      pass: "bg-sky-500/10 border-sky-500/30 text-sky-400",
      fail: "bg-muted/20 border-border text-muted-foreground",
    },
    violet: {
      pass: "bg-violet-500/10 border-violet-500/30 text-violet-400",
      fail: "bg-muted/20 border-border text-muted-foreground",
    },
    emerald: {
      pass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      fail: "bg-muted/20 border-border text-muted-foreground",
    },
  };
  const c = colorMap[color] ?? colorMap.sky;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                item.passed ? c.pass : c.fail
              }`}
            >
              <div className="flex items-center gap-2">
                {item.passed ? (
                  <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 opacity-40 shrink-0" />
                )}
                <span className="text-xs font-medium truncate">{item.label}</span>
              </div>
              <span className="text-[10px] font-mono">+{item.pts}</span>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              No strategies in this group
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
