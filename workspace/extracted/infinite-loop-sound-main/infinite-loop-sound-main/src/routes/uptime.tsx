import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect } from "react";
import {
  Activity,
  CircleCheck,
  AlertTriangle,
  XCircle,
  RotateCw,
  Server,
  Clock,
  Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { runHealthCheck, getUptimeStats, startHealthMonitoring } from "@/lib/health-monitor";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/uptime")({
  component: UptimePage,
});

function UptimePage() {
  const [health, setHealth] = useState<any>(null);
  const [uptime, setUptime] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const checkHealth = useServerFn(runHealthCheck);
  const getStats = useServerFn(getUptimeStats);
  const startMonitoring = useServerFn(startHealthMonitoring);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [h, u] = await Promise.all([checkHealth(), getStats()]);
      setHealth(h);
      setUptime(u);
    } catch {}
  };

  const runCheck = async () => {
    setLoading(true);
    await loadData();
    setLoading(false);
  };

  const enableAutoRestart = async () => {
    await startMonitoring({ data: { intervalSeconds: 30, autoRestart: true } });
    loadData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CircleCheck className="w-4 h-4 text-bull" />;
      case "degraded":
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case "down":
        return <XCircle className="w-4 h-4 text-bear" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-bull border-bull/30 bg-bull/5";
      case "degraded":
        return "text-amber-400 border-amber-500/30 bg-amber-500/5";
      case "down":
        return "text-bear border-bear/30 bg-bear/5";
      default:
        return "text-muted-foreground border-border bg-card";
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Activity className="w-6 h-6 text-primary" />
              Uptime Monitoring
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Health checks • Auto-restart • 99.9% uptime target
            </p>
          </div>
          <Button onClick={runCheck} disabled={loading} size="sm">
            <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Check Now
          </Button>
        </div>

        {/* Overview */}
        <div className="grid md:grid-cols-4 gap-4">
          <div
            className={`rounded-xl border p-5 backdrop-blur ${getStatusColor(health?.status || "unknown")}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider">Overall</span>
              {getStatusIcon(health?.status || "unknown")}
            </div>
            <div className="text-2xl font-bold capitalize">{health?.status || "Checking..."}</div>
            <div className="text-xs opacity-70 mt-1">
              {health?.healthy}/{health?.total} services
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Uptime</span>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono">{uptime?.uptime.formatted || "--"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Since {uptime ? new Date(uptime.uptime.startedAt).toLocaleTimeString() : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Health</span>
              <Server className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-bull">
              {uptime?.health.percentage || 0}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {uptime?.health.status || "unknown"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Auto-Restart
              </span>
              <Zap
                className={`w-4 h-4 ${uptime?.autoRestart ? "text-bull" : "text-muted-foreground"}`}
              />
            </div>
            <div
              className={`text-2xl font-bold ${uptime?.autoRestart ? "text-bull" : "text-muted-foreground"}`}
            >
              {uptime?.autoRestart ? "ON" : "OFF"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {uptime?.crashes || 0} crashes prevented
            </div>
          </div>
        </div>

        {/* Health Checks */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Service Health</h2>
            <span className="text-xs text-muted-foreground">
              Last check: {health ? new Date(health.timestamp).toLocaleTimeString() : "--"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {health?.checks.map((check: any) => (
              <div
                key={check.name}
                className="p-4 flex items-center justify-between hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(check.status)}
                  <div>
                    <div className="font-medium text-sm">{check.name}</div>
                    {check.error && <div className="text-xs text-bear mt-0.5">{check.error}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-xs font-mono px-2 py-1 rounded ${
                      check.status === "healthy"
                        ? "bg-bull/20 text-bull"
                        : check.status === "degraded"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-bear/20 text-bear"
                    }`}
                  >
                    {check.status.toUpperCase()}
                  </div>
                  {check.latency && (
                    <div className="text-[10px] text-muted-foreground mt-1">{check.latency}ms</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Restart Config */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card/60 p-5">
            <h3 className="font-semibold mb-3 text-sm">Auto-Restart Settings</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Enabled</span>
                <span className={uptime?.autoRestart ? "text-bull" : "text-muted-foreground"}>
                  {uptime?.autoRestart ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check interval</span>
                <span className="font-mono">30s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max crashes</span>
                <span className="font-mono">3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restart delay</span>
                <span className="font-mono">2s</span>
              </div>
            </div>
            {!uptime?.autoRestart && (
              <Button size="sm" className="w-full mt-4" onClick={enableAutoRestart}>
                Enable Auto-Restart
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
            <h3 className="font-semibold mb-3 text-sm">What Auto-Restart Does</h3>
            <ul className="space-y-2 text-xs">
              {[
                "Detects crashes within 30 seconds",
                "Automatically restarts failed services",
                "Preserves in-memory state where possible",
                "Sends alert to Telegram",
                "Logs incident for review",
                "Prevents cascade failures",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CircleCheck className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
