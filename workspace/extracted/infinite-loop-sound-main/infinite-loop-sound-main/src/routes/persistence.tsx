import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect } from "react";
import {
  Activity,
  Zap,
  Clock,
  CircleCheck,
  XCircle,
  Radio,
  Server,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  getKeepaliveStatus,
  start24x7Keepalive,
  stopKeepalive,
  pingZoComputer,
} from "@/lib/keepalive.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/persistence")({
  component: PersistencePage,
});

function PersistencePage() {
  const [status, setStatus] = useState<any>({
    app: { status: "unknown" },
    zo: { status: "unknown" },
    mutual: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(false);
  const getStatus = useServerFn(getKeepaliveStatus);
  const startKeepalive = useServerFn(start24x7Keepalive);
  const stop = useServerFn(stopKeepalive);
  const pingZo = useServerFn(pingZoComputer);

  useEffect(() => {
    const saved = localStorage.getItem("zo_api_key");
    if (saved) setApiKey(saved);

    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const s = await getStatus();
      setStatus(s || { app: { status: "unknown" }, zo: { status: "unknown" }, mutual: false });
      setIsActive(!!(s && s.mutual));
    } catch (e) {
      setStatus({ app: { status: "unknown" }, zo: { status: "unknown" }, mutual: false });
    }
  };

  const start = async () => {
    if (!apiKey) {
      toast.error("Enter Zo API key first");
      return;
    }
    try {
      await startKeepalive({ data: { apiKey, intervalSeconds: 300 } });
      localStorage.setItem("zo_api_key", apiKey);
      toast.success("24/7 persistence activated", {
        description: "Pinging every 5 minutes",
      });
      setIsActive(true);
      loadStatus();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const stopPersistence = async () => {
    await stop();
    toast.message("Persistence stopped");
    setIsActive(false);
  };

  const testPing = async () => {
    const result = await pingZo({ data: { apiKey } });
    if (result.success) {
      toast.success("Ping successful");
    } else {
      toast.error("Ping failed");
    }
    loadStatus();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 grid place-items-center">
              <InfinityIcon className="w-5 h-5 text-white" />
            </div>
            24/7 Persistence
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Mutual keepalive • Never sleeps • Zo ↔ App ping every 5 minutes 24/7
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <div
            className={`rounded-xl border p-5 backdrop-blur ${isActive ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card/60"}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                System Status
              </span>
              {isActive ? (
                <CircleCheck className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div
              className={`text-2xl font-bold ${isActive ? "text-emerald-400" : "text-muted-foreground"}`}
            >
              {isActive ? "ACTIVE" : "INACTIVE"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isActive ? "Pinging every 5 minutes 24/7" : "Not running"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                App → Zo
              </span>
              <Radio
                className={`w-4 h-4 ${status?.zo?.status === "alive" ? "text-bull animate-pulse" : "text-muted-foreground"}`}
              />
            </div>
            <div className="text-2xl font-bold font-mono">
              {status?.zo?.secondsAgo != null ? `${status?.zo?.secondsAgo}s` : "--"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Last ping ago</div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Zo → App
              </span>
              <Server
                className={`w-4 h-4 ${status?.app?.status === "alive" ? "text-bull animate-pulse" : "text-muted-foreground"}`}
              />
            </div>
            <div className="text-2xl font-bold font-mono">
              {status?.app?.secondsAgo != null ? `${status?.app?.secondsAgo}s` : "--"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Last ping ago</div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Keepalive Control
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Zo.computer API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="zo_xxxxxxxxxxxxxxxx"
                  className="flex-1 px-3 py-2.5 rounded-lg bg-background border border-border text-sm font-mono"
                  disabled={isActive}
                />
                {!isActive ? (
                  <Button onClick={start} className="px-6">
                    <Activity className="w-4 h-4 mr-2" />
                    Start 24/7
                  </Button>
                ) : (
                  <Button onClick={stopPersistence} variant="destructive" className="px-6">
                    Stop
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-dashed border-border">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Ping Interval</div>
                  <div className="text-xs text-muted-foreground">
                    Both directions, every 5 minutes
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={testPing} disabled={!apiKey}>
                Test Ping
              </Button>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card/60 p-5">
            <h3 className="font-semibold mb-3 text-sm">How Mutual Keepalive Works</h3>
            <div className="space-y-3 text-xs">
              {[
                { step: "1", desc: "App pings Zo every 5 minutes 24/7 via API", icon: "->" },
                { step: "2", desc: "Zo receives ping, stays awake", icon: "OK" },
                { step: "3", desc: "Zo pings App webhook every 5 minutes 24/7", icon: "<-" },
                { step: "4", desc: "App receives ping, stays awake", icon: "OK" },
                { step: "5", desc: "Both run 24/7, never sleep", icon: "LOOP" },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 grid place-items-center text-[10px] font-bold text-primary">
                    {item.step}
                  </div>
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
            <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
              <Server className="w-4 h-4 text-violet-400" />
              What Stays Alive
            </h3>
            <ul className="space-y-2 text-xs">
              {[
                "Signal scanner (checks every 5 min)",
                "Neural network training",
                "Telegram auto-forward",
                "Zo automations",
                "Database connections",
                "WebSocket streams",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CircleCheck className="w-3 h-3 text-violet-400" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 grid place-items-center shrink-0">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-sm">
              <h4 className="font-medium mb-1">Setup Zo to ping back</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                In Zo.computer, create automation: "Every 1 minute → POST to
                https://your-app.com/api/keepalive/zo" with your API key. This creates the mutual
                ping loop.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
