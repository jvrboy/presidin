// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useCallback, useMemo } from "react";
import { deriv, ALL_ASSETS, displayPair, type TF } from "@/lib/engine/deriv";
import {
  advancedScore,
  aroon,
  ttmSqueeze,
  choppiness,
  type AdvancedScore,
  type AroonResult,
  type TTMSqueezeResult,
} from "@/lib/engine/advanced-indicators";
import {
  keltnerChannels,
  donchianChannels,
  williamsR,
  cci,
  obv,
  mfi,
  cmf,
  roc,
  trix,
  hullMA,
  fisherTransform,
  vortex,
  elderRay,
  forceIndex,
  easeOfMovement,
  massIndex,
  pvt,
  nvi,
  pvi,
  kst,
  coppockCurve,
  heikinAshi,
  zigZag,
  chandeKrollStop,
  starcBands,
  chaikinOscillator,
  dpo,
  extraScore,
  type KeltnerResult,
  type DonchianResult,
  type FisherResult,
  type VortexResult,
  type ElderRayResult,
  type KSTResult,
  type HeikinAshiResult,
  type ZigZagPoint,
  type ChandeKrollResult,
  type STARCResult,
  type ExtraScore,
} from "@/lib/engine/extra-indicators";
import {
  runPipeline,
  ALL_SUB_AGENTS,
  DEFAULT_PIPELINE,
  SMC_PIPELINE,
  MOMENTUM_PIPELINE,
  type SubAgentResult,
  type PipelineResult,
  type PipelineStep,
  type SubAgentType,
} from "@/lib/agents/sub-agents";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Layers,
  Gauge,
  Brain,
  Cpu,
  Play,
  Sparkles,
  ChevronRight,
  BarChart,
  Waves,
  LineChart,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/advanced-analysis")({
  head: () => ({
    meta: [
      { title: "Advanced Analysis — DivergenceIQ" },
      {
        name: "description",
        content:
          "Advanced technical analysis with Ichimoku, Supertrend, TTM Squeeze, Aroon, Choppiness, Keltner, Donchian, Williams %R, CCI, OBV, MFI, Fisher Transform, Vortex, Elder Ray, ZigZag, Heikin Ashi, and multi-agent sub-agent pipelines.",
      },
    ],
  }),
  component: AdvancedAnalysisPage,
});

const TFS: TF[] = ["M15", "H1", "H4", "D1"];

type Candle = {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function AdvancedAnalysisPage() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("H4");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("composite");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await deriv.getCandles(symbol, tf, 300);
      setCandles(data as Candle[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candles");
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  useEffect(() => {
    load();
  }, [load]);

  const advScore = useMemo(() => (candles.length > 30 ? advancedScore(candles) : null), [candles]);
  const xScore = useMemo(() => (candles.length > 30 ? extraScore(candles) : null), [candles]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Advanced Analysis</h1>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Symbol</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm"
                >
                  {ALL_ASSETS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Timeframe</label>
                <select
                  value={tf}
                  onChange={(e) => setTf(e.target.value as TF)}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm"
                >
                  {TFS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Loading..." : "Refresh"}
              </Button>
              <div className="text-sm text-muted-foreground">
                {candles.length > 0 ? `${candles.length} candles loaded` : "No data"}
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="composite" className="text-xs">
              <Gauge className="w-3.5 h-3.5 mr-1" /> Composite
            </TabsTrigger>
            <TabsTrigger value="sub-agents" className="text-xs">
              <Brain className="w-3.5 h-3.5 mr-1" /> Sub-Agents
            </TabsTrigger>
            <TabsTrigger value="pipelines" className="text-xs">
              <Layers className="w-3.5 h-3.5 mr-1" /> Pipelines
            </TabsTrigger>
            <TabsTrigger value="aroon" className="text-xs">
              <TrendingUp className="w-3.5 h-3.5 mr-1" /> Aroon
            </TabsTrigger>
            <TabsTrigger value="ttm" className="text-xs">
              <Zap className="w-3.5 h-3.5 mr-1" /> TTM Squeeze
            </TabsTrigger>
            <TabsTrigger value="choppiness" className="text-xs">
              <Waves className="w-3.5 h-3.5 mr-1" /> Choppiness
            </TabsTrigger>
            <TabsTrigger value="channels" className="text-xs">
              <BarChart className="w-3.5 h-3.5 mr-1" /> Channels
            </TabsTrigger>
            <TabsTrigger value="oscillators" className="text-xs">
              <Activity className="w-3.5 h-3.5 mr-1" /> Oscillators
            </TabsTrigger>
            <TabsTrigger value="volume" className="text-xs">
              <LineChart className="w-3.5 h-3.5 mr-1" /> Volume
            </TabsTrigger>
            <TabsTrigger value="extra-score" className="text-xs">
              <Target className="w-3.5 h-3.5 mr-1" /> Extra Score
            </TabsTrigger>
            <TabsTrigger value="heikin" className="text-xs">
              <Cpu className="w-3.5 h-3.5 mr-1" /> Heikin Ashi
            </TabsTrigger>
            <TabsTrigger value="zigzag" className="text-xs">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> ZigZag
            </TabsTrigger>
          </TabsList>

          <TabsContent value="composite">
            <CompositeTab candles={candles} advScore={advScore} />
          </TabsContent>
          <TabsContent value="sub-agents">
            <SubAgentsTab candles={candles} />
          </TabsContent>
          <TabsContent value="pipelines">
            <PipelinesTab candles={candles} />
          </TabsContent>
          <TabsContent value="aroon">
            <AroonTab candles={candles} />
          </TabsContent>
          <TabsContent value="ttm">
            <TTMTab candles={candles} />
          </TabsContent>
          <TabsContent value="choppiness">
            <ChoppinessTab candles={candles} />
          </TabsContent>
          <TabsContent value="channels">
            <ChannelsTab candles={candles} />
          </TabsContent>
          <TabsContent value="oscillators">
            <OscillatorsTab candles={candles} />
          </TabsContent>
          <TabsContent value="volume">
            <VolumeTab candles={candles} />
          </TabsContent>
          <TabsContent value="extra-score">
            <ExtraScoreTab candles={candles} xScore={xScore} />
          </TabsContent>
          <TabsContent value="heikin">
            <HeikinAshiTab candles={candles} />
          </TabsContent>
          <TabsContent value="zigzag">
            <ZigZagTab candles={candles} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------- Composite Tab ----------
function CompositeTab({
  candles,
  advScore,
}: {
  candles: Candle[];
  advScore: AdvancedScore | null;
}) {
  if (!advScore) return <EmptyState />;
  const pct = advScore.score;
  const bias = pct > 60 ? "Bullish" : pct < 40 ? "Bearish" : "Neutral";
  const Icon = bias === "Bullish" ? TrendingUp : bias === "Bearish" ? TrendingDown : Minus;
  const color =
    bias === "Bullish" ? "text-green-500" : bias === "Bearish" ? "text-red-500" : "text-yellow-500";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" /> Composite Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={`text-5xl font-bold ${color}`}>{pct.toFixed(0)}</div>
          <div className="flex items-center gap-1">
            <Icon className={`w-6 h-6 ${color}`} />
            <span className={`text-lg font-semibold ${color}`}>{bias}</span>
          </div>
        </div>
        <div className="space-y-2">
          {advScore.signals.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.name}</span>
              <span className={s.bullish ? "text-green-500" : "text-red-500"}>
                {s.bullish ? "Bullish" : "Bearish"} ({s.value.toFixed(2)})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Sub-Agents Tab ----------
function SubAgentsTab({ candles }: { candles: Candle[] }) {
  const [results, setResults] = useState<SubAgentResult[]>([]);
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    if (candles.length < 30) {
      toast.error("Not enough candle data");
      return;
    }
    setRunning(true);
    try {
      const ctx = { candles, symbol: "EURUSD", tf: "H4" };
      const rs = await Promise.all(ALL_SUB_AGENTS.map((a) => a.run(ctx)));
      setResults(rs);
    } catch {
      toast.error("Failed to run sub-agents");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" /> Sub-Agents ({ALL_SUB_AGENTS.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="sm" onClick={runAll} disabled={running}>
          <Play className="w-4 h-4 mr-1" /> {running ? "Running..." : "Run All Agents"}
        </Button>
        <div className="grid gap-2 md:grid-cols-2">
          {results.map((r, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{r.agent}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${r.signal === "bullish" ? "bg-green-500/20 text-green-500" : r.signal === "bearish" ? "bg-red-500/20 text-red-500" : "bg-yellow-500/20 text-yellow-500"}`}
                >
                  {r.signal}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Confidence: {(r.confidence * 100).toFixed(0)}%
              </div>
              {r.reason && <div className="text-xs text-muted-foreground mt-1">{r.reason}</div>}
            </div>
          ))}
          {results.length === 0 && (
            <div className="text-sm text-muted-foreground col-span-2">
              Run agents to see results.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Pipelines Tab ----------
function PipelinesTab({ candles }: { candles: Candle[] }) {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [running, setRunning] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStep[]>(DEFAULT_PIPELINE);

  const run = async () => {
    if (candles.length < 30) {
      toast.error("Not enough data");
      return;
    }
    setRunning(true);
    try {
      setResult(await runPipeline(pipeline, { candles, symbol: "EURUSD", tf: "H4" }));
    } catch {
      toast.error("Pipeline failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Agent Pipelines
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { name: "Default", steps: DEFAULT_PIPELINE },
            { name: "SMC", steps: SMC_PIPELINE },
            { name: "Momentum", steps: MOMENTUM_PIPELINE },
          ].map((p) => (
            <Button
              key={p.name}
              size="sm"
              variant={pipeline === p.steps ? "default" : "outline"}
              onClick={() => setPipeline(p.steps)}
            >
              {p.name}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          <Play className="w-4 h-4 mr-1" /> {running ? "Running..." : "Run Pipeline"}
        </Button>
        {result && (
          <div className="space-y-2">
            {result.steps.map((s, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Step {i + 1}: {s.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.duration.toFixed(0)}ms</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.results.length} agent results
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Aroon Tab ----------
function AroonTab({ candles }: { candles: Candle[] }) {
  const res = useMemo(() => (candles.length > 30 ? aroon(candles) : null), [candles]);
  if (!res) return <EmptyState />;
  const last = candles.length - 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Aroon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow label="Aroon Up" value={res.up[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="Aroon Down" value={res.down[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="Oscillator" value={res.oscillator[last]?.toFixed(2) ?? "N/A"} />
      </CardContent>
    </Card>
  );
}

// ---------- TTM Squeeze Tab ----------
function TTMTab({ candles }: { candles: Candle[] }) {
  const res = useMemo(() => (candles.length > 30 ? ttmSqueeze(candles) : null), [candles]);
  if (!res) return <EmptyState />;
  const last = candles.length - 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> TTM Squeeze
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={`px-3 py-2 rounded-lg text-sm font-semibold ${res.squeezeOn[last] ? "bg-yellow-500/20 text-yellow-500" : "bg-green-500/20 text-green-500"}`}
        >
          Squeeze:{" "}
          {res.squeezeOn[last]
            ? "ON (low volatility, breakout pending)"
            : "OFF (normal volatility)"}
        </div>
        <MetricRow label="BB Upper" value={res.bollingerUpper[last]?.toFixed(5) ?? "N/A"} />
        <MetricRow label="BB Lower" value={res.bollingerLower[last]?.toFixed(5) ?? "N/A"} />
        <MetricRow label="KC Upper" value={res.keltnerUpper[last]?.toFixed(5) ?? "N/A"} />
        <MetricRow label="KC Lower" value={res.keltnerLower[last]?.toFixed(5) ?? "N/A"} />
        <MetricRow label="Momentum" value={res.momentum[last]?.toFixed(5) ?? "N/A"} />
      </CardContent>
    </Card>
  );
}

// ---------- Choppiness Tab ----------
function ChoppinessTab({ candles }: { candles: Candle[] }) {
  const res = useMemo(() => (candles.length > 30 ? choppiness(candles) : null), [candles]);
  if (!res) return <EmptyState />;
  const last = candles.length - 1;
  const val = res[last];
  const state =
    val == null ? "N/A" : val > 61.8 ? "Choppy (trendless)" : val < 38.2 ? "Trending" : "Neutral";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Waves className="w-4 h-4 text-primary" /> Choppiness Index
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow label="Choppiness" value={val?.toFixed(2) ?? "N/A"} />
        <div className="text-sm text-muted-foreground">Market State: {state}</div>
      </CardContent>
    </Card>
  );
}

// ---------- Channels Tab (Keltner, Donchian, STARC, Chande Kroll) ----------
function ChannelsTab({ candles }: { candles: Candle[] }) {
  const keltner = useMemo(() => (candles.length > 30 ? keltnerChannels(candles) : null), [candles]);
  const donchian = useMemo(
    () => (candles.length > 30 ? donchianChannels(candles) : null),
    [candles],
  );
  const starc = useMemo(() => (candles.length > 30 ? starcBands(candles) : null), [candles]);
  const ck = useMemo(() => (candles.length > 30 ? chandeKrollStop(candles) : null), [candles]);
  if (!keltner || !donchian || !starc || !ck) return <EmptyState />;
  const last = candles.length - 1;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart className="w-4 h-4 text-primary" /> Keltner Channels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <MetricRow label="Upper" value={keltner.upper[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Mid (EMA)" value={keltner.mid[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Lower" value={keltner.lower[last]?.toFixed(5) ?? "N/A"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Donchian Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <MetricRow label="Upper" value={donchian.upper[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Mid" value={donchian.mid[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Lower" value={donchian.lower[last]?.toFixed(5) ?? "N/A"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">STARC Bands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <MetricRow label="Upper" value={starc.upper[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Mid" value={starc.mid[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Lower" value={starc.lower[last]?.toFixed(5) ?? "N/A"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chande Kroll Stop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <MetricRow label="Stop Long" value={ck.stopLong[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Stop Short" value={ck.stopShort[last]?.toFixed(5) ?? "N/A"} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Oscillators Tab (Williams %R, CCI, TRIX, Fisher, Vortex, Elder Ray, DPO, KST, Coppock) ----------
function OscillatorsTab({ candles }: { candles: Candle[] }) {
  const wr = useMemo(() => (candles.length > 30 ? williamsR(candles) : null), [candles]);
  const cciArr = useMemo(() => (candles.length > 30 ? cci(candles) : null), [candles]);
  const trixArr = useMemo(
    () => (candles.length > 30 ? trix(candles.map((c) => c.close)) : null),
    [candles],
  );
  const fisher = useMemo(() => (candles.length > 30 ? fisherTransform(candles) : null), [candles]);
  const vortexRes = useMemo(() => (candles.length > 30 ? vortex(candles) : null), [candles]);
  const elder = useMemo(() => (candles.length > 30 ? elderRay(candles) : null), [candles]);
  const dpoArr = useMemo(
    () => (candles.length > 30 ? dpo(candles.map((c) => c.close)) : null),
    [candles],
  );
  const kstRes = useMemo(
    () => (candles.length > 30 ? kst(candles.map((c) => c.close)) : null),
    [candles],
  );
  const coppock = useMemo(
    () => (candles.length > 30 ? coppockCurve(candles.map((c) => c.close)) : null),
    [candles],
  );
  if (
    !wr ||
    !cciArr ||
    !trixArr ||
    !fisher ||
    !vortexRes ||
    !elder ||
    !dpoArr ||
    !kstRes ||
    !coppock
  )
    return <EmptyState />;
  const last = candles.length - 1;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Oscillators
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <MetricRow label="Williams %R" value={wr[last]?.toFixed(2) ?? "N/A"} />
          <MetricRow label="CCI" value={cciArr[last]?.toFixed(2) ?? "N/A"} />
          <MetricRow label="TRIX" value={trixArr[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Fisher" value={fisher.fisher[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Fisher Signal" value={fisher.signal[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Vortex +" value={vortexRes.viPlus[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Vortex -" value={vortexRes.viMinus[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Elder Bull" value={elder.bullPower[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="Elder Bear" value={elder.bearPower[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="DPO" value={dpoArr[last]?.toFixed(5) ?? "N/A"} />
          <MetricRow label="KST" value={kstRes.kst[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="KST Signal" value={kstRes.signal[last]?.toFixed(4) ?? "N/A"} />
          <MetricRow label="Coppock" value={coppock[last]?.toFixed(4) ?? "N/A"} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Volume Tab (OBV, MFI, CMF, Force Index, Ease of Movement, Mass Index, PVT, NVI, PVI, Chaikin Osc) ----------
function VolumeTab({ candles }: { candles: Candle[] }) {
  const obvArr = useMemo(() => (candles.length > 30 ? obv(candles) : null), [candles]);
  const mfiArr = useMemo(() => (candles.length > 30 ? mfi(candles) : null), [candles]);
  const cmfArr = useMemo(() => (candles.length > 30 ? cmf(candles) : null), [candles]);
  const fi = useMemo(() => (candles.length > 30 ? forceIndex(candles) : null), [candles]);
  const eom = useMemo(() => (candles.length > 30 ? easeOfMovement(candles) : null), [candles]);
  const mi = useMemo(() => (candles.length > 30 ? massIndex(candles) : null), [candles]);
  const pvtArr = useMemo(() => (candles.length > 30 ? pvt(candles) : null), [candles]);
  const nviArr = useMemo(() => (candles.length > 30 ? nvi(candles) : null), [candles]);
  const pviArr = useMemo(() => (candles.length > 30 ? pvi(candles) : null), [candles]);
  const chaikin = useMemo(
    () => (candles.length > 30 ? chaikinOscillator(candles) : null),
    [candles],
  );
  if (
    !obvArr ||
    !mfiArr ||
    !cmfArr ||
    !fi ||
    !eom ||
    !mi ||
    !pvtArr ||
    !nviArr ||
    !pviArr ||
    !chaikin
  )
    return <EmptyState />;
  const last = candles.length - 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <LineChart className="w-4 h-4 text-primary" /> Volume Indicators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <MetricRow label="OBV" value={obvArr[last].toFixed(0)} />
        <MetricRow label="MFI" value={mfiArr[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="CMF" value={cmfArr[last]?.toFixed(4) ?? "N/A"} />
        <MetricRow label="Force Index" value={fi[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="Ease of Movement" value={eom[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="Mass Index" value={mi[last]?.toFixed(2) ?? "N/A"} />
        <MetricRow label="PVT" value={pvtArr[last].toFixed(0)} />
        <MetricRow label="NVI" value={nviArr[last].toFixed(0)} />
        <MetricRow label="PVI" value={pviArr[last].toFixed(0)} />
        <MetricRow label="Chaikin Osc" value={chaikin[last]?.toFixed(2) ?? "N/A"} />
      </CardContent>
    </Card>
  );
}

// ---------- Extra Score Tab ----------
function ExtraScoreTab({ candles, xScore }: { candles: Candle[]; xScore: ExtraScore | null }) {
  if (!xScore) return <EmptyState />;
  const pct = xScore.score;
  const bias = pct > 60 ? "Bullish" : pct < 40 ? "Bearish" : "Neutral";
  const color =
    bias === "Bullish" ? "text-green-500" : bias === "Bearish" ? "text-red-500" : "text-yellow-500";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Extra Composite Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={`text-5xl font-bold ${color}`}>{pct.toFixed(0)}</div>
          <span className={`text-lg font-semibold ${color}`}>{bias}</span>
        </div>
        <div className="space-y-2">
          {xScore.signals.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.name}</span>
              <span className={s.bullish ? "text-green-500" : "text-red-500"}>
                {s.bullish ? "Bullish" : "Bearish"} ({s.value.toFixed(2)})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Heikin Ashi Tab ----------
function HeikinAshiTab({ candles }: { candles: Candle[] }) {
  const ha = useMemo(() => (candles.length > 0 ? heikinAshi(candles) : null), [candles]);
  if (!ha) return <EmptyState />;
  const last = candles.length - 1;
  const bullish = ha.close[last] >= ha.open[last];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" /> Heikin Ashi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          className={`px-3 py-2 rounded-lg text-sm font-semibold ${bullish ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}
        >
          Last Candle: {bullish ? "Bullish" : "Bearish"}
        </div>
        <MetricRow label="HA Open" value={ha.open[last].toFixed(5)} />
        <MetricRow label="HA High" value={ha.high[last].toFixed(5)} />
        <MetricRow label="HA Low" value={ha.low[last].toFixed(5)} />
        <MetricRow label="HA Close" value={ha.close[last].toFixed(5)} />
      </CardContent>
    </Card>
  );
}

// ---------- ZigZag Tab ----------
function ZigZagTab({ candles }: { candles: Candle[] }) {
  const points = useMemo(() => (candles.length > 10 ? zigZag(candles, 5) : []), [candles]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> ZigZag Pivots
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground">{points.length} pivot points detected</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {points.slice(-20).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Candle #{p.index}</span>
              <span className={p.type === "high" ? "text-green-500" : "text-red-500"}>
                {p.type.toUpperCase()} @ {p.price.toFixed(5)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Helpers ----------
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center">
      Load candle data to view this indicator.
    </div>
  );
}
