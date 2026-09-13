import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  Play,
  Square,
  Activity,
  Zap,
  Calendar,
  Send,
  CircleCheck,
  XCircle,
  ArrowRight,
  Timer,
  TrendingUp,
  Settings,
  RefreshCw,
  Loader,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@tanstack/react-start";
import {
  getAutomationStateFn,
  updateScheduleFn,
  triggerAutomationRunFn,
  loadPresetSchedulesFn,
} from "@/routes/api/public/v1/-automation.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Strategy Automation — DivergenceIQ" },
      {
        name: "description",
        content: "Time-based auto-analysis & signal dispatch with preset schedules.",
      },
    ],
  }),
  component: AutomationPage,
});

interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  instruments: string[];
  timeframe: string;
  schedules: Array<{ hour: number; minute: number; daysOfWeek: number[]; session?: string }>;
  strategies: string[];
  minScore: number;
  minConfidence: number;
  dispatchTargets: string[];
  neuralEnhance: boolean;
  maxSignalsPerHour: number;
  cooldownMinutes: number;
  created_at: string;
}

interface AutoSignal {
  id: string;
  schedule_id: string;
  pair: string;
  direction: "BUY" | "SELL";
  score: number;
  rating: string;
  dispatched: boolean;
  dispatch_targets: string[];
  created_at: string;
}

const PRESETS = [
  {
    id: "preset_sast_night",
    name: "SAST Night Scanner",
    desc: "8 forex pairs · M5 · Night session · Neural enhanced",
    icon: "🌙",
  },
  {
    id: "preset_london_open",
    name: "London Open",
    desc: "EUR/GBP/XAU · H1 · Weekday 07:55-08:00 · Bot dispatch",
    icon: "🇬🇧",
  },
  {
    id: "preset_ny_open",
    name: "NY Open",
    desc: "JPY/CAD/SPX · H1 · Weekday 12:25-12:30",
    icon: "🇺🇸",
  },
  {
    id: "preset_news_hour",
    name: "News Hour Scanner",
    desc: "5 pairs · M15 · Midday scans · Webhook alerts",
    icon: "📰",
  },
  {
    id: "preset_weekend_close",
    name: "Weekend Close",
    desc: "4 pairs · H4 · Friday 21:00 · High score threshold",
    icon: "📅",
  },
];

function AutomationPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [signals, setSignals] = useState<AutoSignal[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [nextRunCountdown, setNextRunCountdown] = useState("--:--");
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const getState = useServerFn(getAutomationStateFn);
  const toggleSchedule = useServerFn(updateScheduleFn);
  const triggerRun = useServerFn(triggerAutomationRunFn);
  const loadPresets = useServerFn(loadPresetSchedulesFn);

  const loadData = useCallback(async () => {
    try {
      const data = await getState();
      setSchedules((data.schedules as Schedule[]) ?? []);
      setSignals((data.recentSignals as AutoSignal[]) ?? []);
      setIsRunning(data.isRunning ?? true);
    } catch (e: any) {
      console.error("Automation state load failed:", e);
    }
    setLoading(false);
  }, [getState]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Countdown timer to next scheduled run
  useEffect(() => {
    const calcCountdown = () => {
      const now = new Date();
      const activeSchedules = schedules.filter((s) => s.enabled);
      if (activeSchedules.length === 0) {
        setNextRunCountdown("No schedules");
        return;
      }
      let nearestMs = Infinity;
      for (const s of activeSchedules) {
        for (const sc of s.schedules) {
          const target = new Date(now);
          target.setHours(sc.hour, sc.minute, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          const diff = target.getTime() - now.getTime();
          if (diff < nearestMs) nearestMs = diff;
        }
      }
      if (nearestMs === Infinity) {
        setNextRunCountdown("--:--");
        return;
      }
      const mins = Math.floor(nearestMs / 60_000);
      const secs = Math.floor((nearestMs % 60_000) / 1000);
      setNextRunCountdown(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };
    calcCountdown();
    countdownRef.current = setInterval(calcCountdown, 1000);
    return () => clearInterval(countdownRef.current);
  }, [schedules]);

  const handleToggle = async (schedule: Schedule) => {
    setTogglingId(schedule.id);
    try {
      await toggleSchedule({ data: { id: schedule.id, updates: { enabled: !schedule.enabled } } });
      toast.success(`${schedule.name} ${!schedule.enabled ? "enabled" : "disabled"}`);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Toggle failed");
    }
    setTogglingId(null);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await triggerRun({ data: {} });
      toast.success(`Run triggered: ${res.schedulesQueued?.length ?? 0} schedules queued`);
    } catch (e: any) {
      toast.error(e?.message || "Trigger failed");
    }
    setTriggering(false);
  };

  const handleLoadPresets = async () => {
    setLoadingPresets(true);
    try {
      const res = await loadPresets(undefined);
      toast.success(`Loaded ${res.loaded} preset schedules`);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to load presets");
    }
    setLoadingPresets(false);
  };

  const formatTime = (sc: { hour: number; minute: number }) =>
    `${String(sc.hour).padStart(2, "0")}:${String(sc.minute).padStart(2, "0")}`;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dispatchStats = useCallback(() => {
    if (signals.length === 0) return [];
    const map: Record<string, { total: number; dispatched: number }> = {};
    signals.forEach((s) => {
      (s.dispatch_targets ?? []).forEach((t) => {
        if (!map[t]) map[t] = { total: 0, dispatched: 0 };
        map[t].total++;
        if (s.dispatched) map[t].dispatched++;
      });
    });
    return Object.entries(map).map(([target, v]) => ({
      target,
      rate: v.total > 0 ? ((v.dispatched / v.total) * 100).toFixed(0) : "—",
      count: v.total,
    }));
  }, [signals]);

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-16 rounded-lg" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
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
              <Settings className="w-6 h-6 text-emerald-400" />
              Strategy Automation
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Time-based auto-analysis &amp; signal dispatch
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Activity
              className={`w-3.5 h-3.5 ${isRunning ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`}
            />
            <span className="text-xs font-mono text-emerald-400">
              {isRunning ? "ENGINE RUNNING" : "STOPPED"}
            </span>
          </div>
        </div>

        {/* Engine Control Bar */}
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant={isRunning ? "destructive" : "default"}
                  size="sm"
                  onClick={() => {
                    setIsRunning(!isRunning);
                    toast.success(isRunning ? "Engine stopped" : "Engine started");
                  }}
                >
                  {isRunning ? (
                    <Square className="w-3.5 h-3.5 mr-1.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {isRunning ? "Stop Engine" : "Start Engine"}
                </Button>
                <Badge variant={isRunning ? "default" : "secondary"} className="gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`}
                  />
                  {isRunning ? "Running" : "Stopped"}
                </Badge>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Next run:</span>
                  <span className="text-sm font-mono font-semibold text-sky-400">
                    {nextRunCountdown}
                  </span>
                </div>
                <Button size="sm" variant="outline" disabled={triggering} onClick={handleTrigger}>
                  {triggering ? (
                    <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Trigger Now
                </Button>
                <Button size="sm" variant="outline" disabled={loadingPresets} onClick={loadData}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedules + Recent Signals */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
          {/* Active Schedules */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-400" />
                Active Schedules
              </CardTitle>
              <CardDescription>
                {schedules.filter((s) => s.enabled).length} of {schedules.length} enabled
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No schedules configured. Load presets to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        schedule.enabled
                          ? "bg-background/50 border-border"
                          : "bg-muted/20 border-border/50 opacity-60"
                      }`}
                    >
                      <div className="pt-0.5">
                        <Switch
                          checked={schedule.enabled}
                          disabled={togglingId === schedule.id}
                          onCheckedChange={() => handleToggle(schedule)}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{schedule.name}</span>
                          {schedule.neuralEnhance && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-violet-400 border-violet-500/30"
                            >
                              Neural
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {schedule.instruments.length} pairs
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {schedule.timeframe}
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {schedule.schedules.map(formatTime).join(", ")}
                          </span>
                          {schedule.schedules[0]?.daysOfWeek?.length > 0 && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-[10px] text-muted-foreground">
                                {schedule.schedules[0].daysOfWeek
                                  .map((d) => dayNames[d])
                                  .join(", ")}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {(schedule.dispatchTargets ?? []).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {t}
                            </Badge>
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            min {schedule.minScore} · {schedule.minConfidence * 100}% conf
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Automated Signals */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" />
                Recent Signals
              </CardTitle>
              <CardDescription>Last {signals.length} automated signals</CardDescription>
            </CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Send className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No automated signals yet. Enable a schedule to begin.
                  </p>
                </div>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {signals.slice(0, 20).map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-background/50 text-xs border border-border"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-semibold w-16">{sig.pair}</span>
                        <span
                          className={`font-semibold ${
                            sig.direction === "BUY" ? "text-bull" : "text-bear"
                          }`}
                        >
                          {sig.direction}
                        </span>
                        <Badge
                          variant={
                            sig.rating === "ELITE" || sig.rating === "STRONG"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[9px] px-1.5 py-0"
                        >
                          {sig.rating}
                        </Badge>
                        <span className="font-mono text-muted-foreground">{sig.score}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {sig.dispatched ? (
                          <CircleCheck className="w-3.5 h-3.5 text-bull" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(sig.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dispatch Stats + Presets */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
          {/* Dispatch Success Rates */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                Dispatch Success Rates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dispatchStats().length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4">No dispatch data yet.</p>
              ) : (
                <div className="space-y-2">
                  {dispatchStats().map(({ target, rate, count }) => (
                    <div
                      key={target}
                      className="flex items-center gap-3 p-2 rounded bg-background/50"
                    >
                      <span className="text-sm font-medium w-24 capitalize">{target}</span>
                      <div className="flex-1 h-2 rounded-full bg-primary/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            Number(rate) >= 80
                              ? "bg-bull"
                              : Number(rate) >= 50
                                ? "bg-amber-400"
                                : "bg-bear"
                          }`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                        {rate}%
                      </span>
                      <span className="text-[10px] text-muted-foreground w-16 text-right">
                        {count} signals
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preset Schedules */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4 text-pink-400" />
                  Preset Schedules
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loadingPresets}
                  onClick={handleLoadPresets}
                >
                  {loadingPresets ? (
                    <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Load All
                </Button>
              </div>
              <CardDescription>Battle-tested schedule configurations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {PRESETS.map((preset) => {
                  const loaded = schedules.some((s) => s.id === preset.id);
                  return (
                    <div
                      key={preset.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        loaded ? "bg-bull/5 border-bull/30" : "bg-background/50 border-border"
                      }`}
                    >
                      <span className="text-lg">{preset.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{preset.name}</span>
                          {loaded && <CircleCheck className="w-3.5 h-3.5 text-bull" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
