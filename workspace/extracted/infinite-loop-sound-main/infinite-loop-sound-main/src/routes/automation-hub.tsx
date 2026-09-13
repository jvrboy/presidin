import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useCallback } from "react";
import {
  Play,
  Square,
  RefreshCw,
  Settings,
  Zap,
  Activity,
  Clock,
  Scale,
  BookOpen,
  Shield,
  Radar,
  Gauge,
  Cpu,
  Workflow,
  CircleCheck,
  TrendingUp,
  Bell,
} from "lucide-react";
import { ProCard, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/automation-hub")({
  head: () => ({ meta: [{ title: "Automation Hub — DivergenceIQ" }] }),
  component: AutomationHubPage,
});

type ToolId =
  | "auto-scan"
  | "auto-backtest"
  | "auto-rebalance"
  | "auto-journal"
  | "auto-risk-shield"
  | "auto-regime-switch"
  | "auto-news-pause"
  | "auto-scaling";

interface ToolState {
  id: ToolId;
  name: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  intervalSec: number;
  lastRun: number | null;
  runs: number;
  status: "idle" | "running" | "ok" | "error";
  log: string[];
}

const DEFAULT_TOOLS: ToolState[] = [
  {
    id: "auto-scan",
    name: "Auto Scanner",
    description: "Continuously scans all instruments on a timer and queues fresh signals.",
    icon: <Radar className="w-4 h-4" />,
    enabled: true,
    intervalSec: 60,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-backtest",
    name: "Auto Backtest",
    description: "Runs overnight backtests of active strategies and reports degradation.",
    icon: <Activity className="w-4 h-4" />,
    enabled: true,
    intervalSec: 3600,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-rebalance",
    name: "Auto Rebalance",
    description: "Monitors portfolio weights and triggers rebalance alerts on drift > 5%.",
    icon: <Scale className="w-4 h-4" />,
    enabled: false,
    intervalSec: 900,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-journal",
    name: "Auto Journal",
    description: "Auto-logs every closed trade into the journal with tags & session context.",
    icon: <BookOpen className="w-4 h-4" />,
    enabled: true,
    intervalSec: 60,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-risk-shield",
    name: "Risk Shield",
    description: "Halts new entries when daily drawdown or consecutive-loss limits hit.",
    icon: <Shield className="w-4 h-4" />,
    enabled: true,
    intervalSec: 15,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-regime-switch",
    name: "Regime Switcher",
    description: "Swaps active strategy set when the regime engine detects a state change.",
    icon: <Gauge className="w-4 h-4" />,
    enabled: false,
    intervalSec: 120,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-news-pause",
    name: "News Pause",
    description: "Pauses automation 5 min before/after high-impact news events.",
    icon: <Bell className="w-4 h-4" />,
    enabled: true,
    intervalSec: 60,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
  {
    id: "auto-scaling",
    name: "Auto Scaling",
    description: "Scales position size up/down based on equity curve momentum.",
    icon: <TrendingUp className="w-4 h-4" />,
    enabled: false,
    intervalSec: 300,
    lastRun: null,
    runs: 0,
    status: "idle",
    log: [],
  },
];

const PRESETS = [
  {
    id: "conservative",
    name: "Conservative",
    desc: "Risk shield + news pause + journal only",
    tools: ["auto-risk-shield", "auto-news-pause", "auto-journal"],
  },
  {
    id: "balanced",
    name: "Balanced",
    desc: "Scan + backtest + journal + risk shield + news pause",
    tools: ["auto-scan", "auto-backtest", "auto-journal", "auto-risk-shield", "auto-news-pause"],
  },
  {
    id: "full",
    name: "Full Auto",
    desc: "All automation tools enabled",
    tools: DEFAULT_TOOLS.map((t) => t.id),
  },
  {
    id: "research",
    name: "Research",
    desc: "Scan + backtest + regime switcher for strategy research",
    tools: ["auto-scan", "auto-backtest", "auto-regime-switch"],
  },
];

function AutomationHubPage() {
  const [tools, setTools] = useState<ToolState[]>(DEFAULT_TOOLS);
  const [globalRun, setGlobalRun] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("balanced");

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setTools((prev) => prev.map((t) => ({ ...t, enabled: preset.tools.includes(t.id) })));
    toast.success(`Preset applied: ${preset.name}`);
  };

  const toggle = (id: ToolId) => {
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const runTool = useCallback((id: ToolId) => {
    setTools((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const now = Date.now();
        const entry = `[${new Date(now).toLocaleTimeString()}] ${t.name} executed — ok`;
        return {
          ...t,
          status: "ok",
          lastRun: now,
          runs: t.runs + 1,
          log: [entry, ...t.log].slice(0, 8),
        };
      }),
    );
  }, []);

  const runAll = useCallback(() => {
    setGlobalRun(true);
    const enabled = tools.filter((t) => t.enabled);
    enabled.forEach((t, i) => {
      setTimeout(() => {
        runTool(t.id);
        if (i === enabled.length - 1) {
          setGlobalRun(false);
          toast.success(`Ran ${enabled.length} automation tools`);
        }
      }, i * 250);
    });
  }, [tools, runTool]);

  const enabledCount = tools.filter((t) => t.enabled).length;
  const totalRuns = tools.reduce((s, t) => s + t.runs, 0);
  const avgInterval =
    tools.filter((t) => t.enabled).reduce((s, t) => s + t.intervalSec, 0) /
    Math.max(1, enabledCount);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Automation Hub"
          subtitle="Run-and-forget automation: scanning, backtesting, risk shields, rebalancing, regime switching & more."
          icon={<Workflow className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setTools(DEFAULT_TOOLS)}>
                <RefreshCw className="w-4 h-4" /> Reset
              </Button>
              <Button size="sm" onClick={runAll} disabled={globalRun || enabledCount === 0}>
                {globalRun ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {globalRun ? "Running..." : "Run All Enabled"}
              </Button>
            </div>
          }
        />

        <KpiGrid
          tiles={[
            {
              label: "Enabled Tools",
              value: `${enabledCount} / ${tools.length}`,
              accent: "primary",
              icon: <Cpu className="w-4 h-4" />,
            },
            {
              label: "Total Runs",
              value: totalRuns,
              sub: "this session",
              accent: "bull",
              icon: <Activity className="w-4 h-4" />,
            },
            {
              label: "Avg Interval",
              value: `${Math.round(avgInterval)}s`,
              sub: "across enabled tools",
              accent: "neutral",
              icon: <Clock className="w-4 h-4" />,
            },
            {
              label: "Status",
              value: globalRun ? "RUNNING" : "READY",
              accent: globalRun ? "warning" : "bull",
              icon: <Zap className="w-4 h-4" />,
            },
          ]}
        />

        <ProCard
          title="Presets"
          description="One-click automation bundles tailored to trading styles."
          icon={<Settings className="w-4 h-4" />}
        >
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`text-left rounded-lg border p-4 transition-all hover:border-primary/60 ${activePreset === p.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-card/80"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {activePreset === p.id && (
                    <Badge className="text-[10px]">
                      <CircleCheck className="w-3 h-3 mr-1" />
                      active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </ProCard>

        <div className="grid gap-4 md:grid-cols-2">
          {tools.map((t) => (
            <ProCard
              key={t.id}
              title={t.name}
              description={t.description}
              icon={t.icon}
              action={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runTool(t.id)}
                    disabled={!t.enabled}
                  >
                    <Play className="w-3 h-3" /> Run
                  </Button>
                  <Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} />
                </div>
              }
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Interval:</span>
                  <code className="font-mono">{t.intervalSec}s</code>
                  <span className="text-muted-foreground ml-auto">Runs: {t.runs}</span>
                  <Badge
                    variant="outline"
                    className={
                      t.status === "ok"
                        ? "text-bull"
                        : t.status === "error"
                          ? "text-bear"
                          : "text-muted-foreground"
                    }
                  >
                    {t.status}
                  </Badge>
                </div>
                {t.lastRun && (
                  <div className="text-xs text-muted-foreground">
                    Last run: {new Date(t.lastRun).toLocaleTimeString()}
                  </div>
                )}
                {t.log.length > 0 ? (
                  <div className="rounded-lg bg-muted/40 p-2 space-y-1 max-h-32 overflow-auto">
                    {t.log.map((l, i) => (
                      <div key={i} className="text-[11px] font-mono text-muted-foreground">
                        {l}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No runs yet.</p>
                )}
              </div>
            </ProCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
