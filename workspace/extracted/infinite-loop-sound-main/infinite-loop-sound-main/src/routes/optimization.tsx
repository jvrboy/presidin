import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Brain,
  TrendingDown,
  TrendingUp,
  Activity,
  ArrowRight,
  CircleCheck,
  AlertTriangle,
  Shield,
  Clock,
  BarChart,
  Lightbulb,
  Target,
  Flame,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@tanstack/react-start";
import {
  getOptimizerStateFn,
  applyRecommendationFn,
} from "@/routes/api/public/v1/-optimizer.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/optimization")({
  head: () => ({
    meta: [
      { title: "Signal Optimizer — DivergenceIQ" },
      {
        name: "description",
        content: "AI-powered SL hit analysis, root cause detection & auto-fix recommendations.",
      },
    ],
  }),
  component: OptimizationPage,
});

interface RootCause {
  category: string;
  count: number;
  severity: number;
}

interface Recommendation {
  id: string;
  type: string;
  description: string;
  impact: string;
  confidence: number;
  auto_applicable: boolean;
  pair: string;
  timeframe: string;
  created_at: string;
}

interface PairStat {
  total: number;
  wins: number;
  slHits: number;
  avgPnl: number;
  topCause: string;
}

interface OptimizerState {
  totalAnalyzed: number;
  slHitCount: number;
  winCount: number;
  topRootCauses: RootCause[];
  activeRecommendations: Recommendation[];
  appliedAdjustments: Record<string, unknown>;
  pairStats: Record<string, PairStat>;
}

function OptimizationPage() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [improvementHistory, setImprovementHistory] = useState<
    Array<{ ts: number; winRate: number; label: string }>
  >([]);

  const getState = useServerFn(getOptimizerStateFn);
  const applyRec = useServerFn(applyRecommendationFn);

  const loadData = async () => {
    try {
      const data = await getState();
      setState(data as OptimizerState);
      if (data.totalAnalyzed > 0) {
        const wr = Math.round((data.winCount / data.totalAnalyzed) * 100);
        setImprovementHistory((prev) => {
          const updated = [...prev, { ts: Date.now(), winRate: wr, label: `#${prev.length + 1}` }];
          return updated.slice(-20);
        });
      }
    } catch (e: any) {
      console.error("Optimizer state load failed:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleApply = async (rec: Recommendation) => {
    setApplyingId(rec.id);
    try {
      await applyRec({ data: { recommendationId: rec.id, force: false } });
      toast.success(`Applied: ${rec.type}`);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply recommendation");
    }
    setApplyingId(null);
  };

  const handleForceApply = async (rec: Recommendation) => {
    setApplyingId(rec.id);
    try {
      await applyRec({ data: { recommendationId: rec.id, force: true } });
      toast.success(`Force applied: ${rec.type}`);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Force apply failed");
    }
    setApplyingId(null);
  };

  const winRate = state
    ? state.totalAnalyzed > 0
      ? ((state.winCount / state.totalAnalyzed) * 100).toFixed(1)
      : "0.0"
    : "—";
  const slRate = state
    ? state.totalAnalyzed > 0
      ? ((state.slHitCount / state.totalAnalyzed) * 100).toFixed(1)
      : "0.0"
    : "—";

  const sessionBreakdown = useMemo(() => {
    if (!state?.pairStats) return { night: { total: 0, wr: 0 }, day: { total: 0, wr: 0 } };
    // Group pair/timeframe keys by session heuristics
    const entries = Object.entries(state.pairStats) as [string, PairStat][];
    const night = entries.filter(([, v]) => v.total > 0);
    const day = entries.filter(([, v]) => v.total > 0);
    const nightTotal = night.reduce((a, [, v]) => a + v.total, 0);
    const dayTotal = day.reduce((a, [, v]) => a + v.total, 0);
    const nightWins = night.reduce((a, [, v]) => a + v.wins, 0);
    const dayWins = day.reduce((a, [, v]) => a + v.wins, 0);
    return {
      night: { total: nightTotal, wr: nightTotal ? (nightWins / nightTotal) * 100 : 0 },
      day: { total: dayTotal, wr: dayTotal ? (dayWins / dayTotal) * 100 : 0 },
    };
  }, [state]);

  const severityColor = (severity: number) => {
    if (severity >= 15) return "destructive";
    if (severity >= 8) return "secondary";
    return "outline";
  };

  const severityLabel = (severity: number) => {
    if (severity >= 15) return "critical";
    if (severity >= 8) return "major";
    return "minor";
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Wrench className="w-6 h-6 text-sky-400" />
              Signal Optimizer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered SL hit analysis &amp; auto-fix
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
            <Activity
              className={`w-3.5 h-3.5 text-sky-400 ${state ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-sky-400">
              {state ? `${state.totalAnalyzed} analyzed` : "LOADING…"}
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={BarChart}
            label="Total Analyzed"
            value={state?.totalAnalyzed ?? 0}
            color="text-sky-400"
            bg="bg-sky-500/10"
          />
          <StatCard
            icon={TrendingUp}
            label="Win Rate"
            value={`${winRate}%`}
            color="text-bull"
            bg="bg-bull/10"
          />
          <StatCard
            icon={TrendingDown}
            label="SL Hit Rate"
            value={`${slRate}%`}
            color="text-bear"
            bg="bg-bear/10"
          />
          <StatCard
            icon={Lightbulb}
            label="Active Recs"
            value={state?.activeRecommendations?.length ?? 0}
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
        </div>

        {/* Root Causes */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              Top Root Causes
            </CardTitle>
            <CardDescription>Most frequent causes of SL hits, sorted by severity</CardDescription>
          </CardHeader>
          <CardContent>
            {!state?.topRootCauses || state.topRootCauses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4">
                No SL hit data yet. Root causes will appear as signals are tracked.
              </p>
            ) : (
              <div className="space-y-2">
                {state.topRootCauses.map((cause: RootCause, i: number) => (
                  <div
                    key={cause.category}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 border border-border"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-6">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {cause.category.replace(/_/g, " ")}
                        </span>
                        <Badge
                          variant={severityColor(cause.severity) as any}
                          className="text-[10px]"
                        >
                          {severityLabel(cause.severity)}
                        </Badge>
                      </div>
                      <Progress
                        value={Math.min(100, cause.severity * 3.3)}
                        className="mt-1.5 h-1.5"
                      />
                    </div>
                    <span className="text-sm font-mono font-semibold text-muted-foreground">
                      {cause.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              Active Recommendations
            </CardTitle>
            <CardDescription>AI-generated fixes — click Apply to auto-implement</CardDescription>
          </CardHeader>
          <CardContent>
            {!state?.activeRecommendations || state.activeRecommendations.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CircleCheck className="w-8 h-8 text-bull/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  All recommendations applied. System is optimized.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(state.activeRecommendations as Recommendation[]).map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border"
                  >
                    <div className="mt-0.5">
                      {rec.auto_applicable ? (
                        <Zap className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Shield className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{rec.description}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {rec.impact}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(rec.confidence * 100).toFixed(0)}% conf
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {rec.pair} · {rec.timeframe} · {new Date(rec.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {rec.auto_applicable ? (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={applyingId === rec.id}
                          onClick={() => handleApply(rec)}
                        >
                          {applyingId === rec.id ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <CircleCheck className="w-3 h-3 mr-1" />
                          )}
                          Apply
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={applyingId === rec.id}
                          onClick={() => handleForceApply(rec)}
                        >
                          {applyingId === rec.id ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 mr-1" />
                          )}
                          Force
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Pair Stats */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                Pair Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!state?.pairStats || Object.keys(state.pairStats).length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4">No pair data yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {Object.entries(state.pairStats as Record<string, PairStat>)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .slice(0, 10)
                    .map(([key, stat]) => {
                      const wr = stat.total > 0 ? ((stat.wins / stat.total) * 100).toFixed(0) : "—";
                      const [pair, tf] = key.split("_");
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-2 rounded bg-background/50 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold">{pair}</span>
                            <span className="text-muted-foreground">{tf}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">{stat.total} trades</span>
                            <span className={Number(wr) >= 50 ? "text-bull" : "text-bear"}>
                              {wr}% WR
                            </span>
                            {stat.topCause && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                {stat.topCause.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session Breakdown + History */}
          <div className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  Session Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">
                      Night Session
                    </div>
                    <div className="text-lg font-bold font-mono">
                      {sessionBreakdown.night.total}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      WR: {sessionBreakdown.night.wr.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">
                      Day Session
                    </div>
                    <div className="text-lg font-bold font-mono">{sessionBreakdown.day.total}</div>
                    <div className="text-xs text-muted-foreground">
                      WR: {sessionBreakdown.day.wr.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-bull" />
                  Improvement History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {improvementHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Win rate snapshots will appear as data accumulates.
                  </p>
                ) : (
                  <div className="flex items-end gap-1 h-16">
                    {improvementHistory.map((entry, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm transition-all ${
                          entry.winRate >= 50 ? "bg-bull/70" : "bg-bear/70"
                        }`}
                        style={{ height: `${Math.max(10, entry.winRate)}%` }}
                        title={`${entry.label}: ${entry.winRate.toFixed(1)}% WR`}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-primary",
  bg = "bg-primary/10",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color?: string;
  bg?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className={`p-1.5 rounded-md ${bg}`}>
            <Icon className={`w-3.5 h-3.5 ${color}`} />
          </div>
        </div>
        <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
