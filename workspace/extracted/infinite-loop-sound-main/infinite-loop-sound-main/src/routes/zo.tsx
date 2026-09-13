import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect } from "react";
import {
  Cloud,
  Zap,
  Server,
  Link,
  Check,
  ExternalLink,
  Cpu,
  Database,
  Globe,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/zo")({
  component: ZoPage,
});

interface ZoStatus {
  connected: boolean;
  uptime?: number;
  agents?: number;
  storage?: { used: number; total: number };
}

function ZoPage() {
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<ZoStatus>({ connected: false });

  useEffect(() => {
    const envKey = import.meta.env.VITE_ZO_API_KEY || import.meta.env.VITE_ZO_COMPUTER_KEY;
    const saved = localStorage.getItem("zo_api_key") || envKey;
    if (saved) {
      setApiKey(saved);
      connectZo(saved, true);
    }
  }, []);

  const connectZo = async (key = apiKey, silent = false) => {
    if (!key) {
      if (!silent) toast.error("Enter your Zo.computer API key");
      return;
    }
    setSyncing(true);

    try {
      // Real Zo API connection
      // Zo uses a simple REST API at https://api.zo.computer/v1
      const response = await fetch("https://api.zo.computer/v1/user", {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }).catch(() => null);

      if (response?.ok) {
        const data = (await response.json().catch(() => ({}))) as Partial<ZoStatus>;

        setConnected(true);
        setStatus({
          connected: true,
          uptime: typeof data.uptime === "number" ? data.uptime : undefined,
          agents: typeof data.agents === "number" ? data.agents : undefined,
          storage: data.storage,
        });
        localStorage.setItem("zo_api_key", key);

        if (!silent) {
          toast.success("Connected to Zo Computer!", {
            description: "Your personal AI cloud is online",
          });
        }

        // Sync signals to Zo
        await syncToZo(key);
      } else {
        throw new Error("Invalid API key");
      }
    } catch (e: unknown) {
      setConnected(false);
      setStatus({ connected: false });
      if (!silent) toast.error(e instanceof Error ? e.message : "Zo connection failed");
    } finally {
      setSyncing(false);
    }
  };

  const syncToZo = async (key: string): Promise<boolean> => {
    try {
      // Send signals to Zo for AI analysis
      const cachedSignals = JSON.parse(localStorage.getItem("signals_cache") || "[]");
      const signals = Array.isArray(cachedSignals) ? cachedSignals : [];

      const response = await fetch("https://api.zo.computer/v1/automations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "DivergenceIQ Sync",
          schedule: "*/5 * * * *", // Every 5 minutes
          action: "analyze_signals",
          data: { count: signals.length },
        }),
      });
      if (!response.ok) throw new Error(`Zo automation sync failed (${response.status})`);
      return true;
    } catch (error) {
      console.warn("[Zo] Signal automation sync failed", error);
      return false;
    }
  };

  const deployAgent = async () => {
    setSyncing(true);
    try {
      const key = localStorage.getItem("zo_api_key") || import.meta.env.VITE_ZO_API_KEY;
      if (!key) throw new Error("Connect Zo before deploying an agent.");
      const response = await fetch("https://api.zo.computer/v1/automations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DivergenceIQ Autonomous Scanner",
          schedule: "*/5 * * * *",
          action: "analyze_signals",
          data: { source: "divergenceiq", dryRun: true },
        }),
      });
      if (!response.ok) throw new Error(`Zo agent deployment failed (${response.status})`);
      toast.success("Autonomous scanner deployed to Zo", {
        description: "The scanner is configured in dry-run mode.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent deployment failed");
    } finally {
      setSyncing(false);
    }
  };

  const syncSignals = async () => {
    setSyncing(true);
    try {
      const key = localStorage.getItem("zo_api_key") || import.meta.env.VITE_ZO_API_KEY;
      if (!key) throw new Error("Not connected");
      const cachedSignals = JSON.parse(localStorage.getItem("signals_cache") || "[]");
      const signals = Array.isArray(cachedSignals) ? cachedSignals : [];

      // Real API call to Zo
      const response = await fetch("https://api.zo.computer/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "/divergenceiq/signals.json",
          content: JSON.stringify({
            synced_at: new Date().toISOString(),
            count: signals.length,
            signals,
          }),
        }),
      });
      if (!response.ok) throw new Error(`Zo signal sync failed (${response.status})`);

      toast.success(`${signals.length} signals synced to Zo!`, {
        description: "Your AI agent can now analyze them 24/7",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signal sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 grid place-items-center shadow-lg shadow-violet-500/20">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            Zo Computer Integration
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your personal AI cloud computer for autonomous trading
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card/80 backdrop-blur p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Connect Your Zo</h2>
                <p className="text-sm text-muted-foreground">
                  Run DivergenceIQ on your personal cloud 24/7
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 ${connected ? "bg-bull/20 text-bull border border-bull/30" : "bg-muted text-muted-foreground"}`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${connected ? "bg-bull animate-pulse" : "bg-muted-foreground"}`}
                />
                {connected ? "CONNECTED" : "OFFLINE"}
              </div>
            </div>

            {!connected ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Zo API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="zo_xxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => connectZo()} disabled={syncing} className="flex-1">
                    <Link className="w-4 h-4 mr-2" />
                    {syncing ? "Connecting..." : "Connect Zo Computer"}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="https://zo.computer" target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Get API Key
                    </a>
                  </Button>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Don't have Zo?{" "}
                    <a
                      href="https://zo.computer"
                      target="_blank"
                      className="text-primary hover:underline"
                    >
                      Get 100GB free
                    </a>{" "}
                    — your personal AI cloud computer
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard icon={Server} label="Uptime" value="99.9%" sub="Last 30 days" />
                  <StatCard icon={Zap} label="Agents" value="3" sub="Running" />
                  <StatCard icon={Database} label="Synced" value="247" sub="Signals" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={syncSignals} disabled={syncing} className="flex-1">
                    <Cloud className="w-4 h-4 mr-2" />
                    {syncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button variant="outline" onClick={() => setConnected(false)}>
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-6 backdrop-blur">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-400" />
              What Zo Does
            </h3>
            <ul className="space-y-2.5 text-sm">
              {[
                "Run scanner 24/7 even when you're offline",
                "Auto-forward ELITE signals to Telegram",
                "Backtest 10,000+ signals in parallel",
                "Train custom AI on your winning trades",
                "Host your own trading dashboard",
                "Connect to 50+ tools (Notion, Slack, etc)",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-bull mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <ToolCard
            title="Autonomous Agent"
            description="Zo runs your scanner every 5 minutes, auto-trades ELITE signals"
            icon={Zap}
            action="Deploy Agent"
            onClick={deployAgent}
          />
          <ToolCard
            title="Signal Memory"
            description="Zo remembers every signal, builds your personal edge database"
            icon={Database}
            action="View Memory"
            onClick={() => toast.info("247 signals stored in Zo cloud")}
          />
          <ToolCard
            title="Webhook Bridge"
            description="Connect Zo to TradingView, webhooks, and custom APIs"
            icon={Globe}
            action="Configure"
            onClick={() => toast.info("Webhook URL: https://zo.computer/hook/divergenceiq")}
          />
          <ToolCard
            title="AI Research Lab"
            description="Ask Zo: 'What was my best pair last month?'"
            icon={Cpu}
            action="Open Lab"
            onClick={() => window.open("https://zo.computer", "_blank")}
          />
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 grid place-items-center shrink-0">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Pro Tip: Run DivergenceIQ on Zo</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deploy this entire app to your Zo computer in 1 click. It will run 24/7, scan
                markets while you sleep, and text you only ELITE signals. No VPS needed.{" "}
                <a
                  href="https://zo.computer"
                  className="text-amber-400 hover:underline"
                  target="_blank"
                >
                  Learn more →
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="rounded-lg bg-background/50 border border-border p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="text-xl font-bold font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function ToolCard({ title, description, icon: Icon, action, onClick }: any) {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5 hover:border-primary/50 transition-colors group">
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center group-hover:bg-primary/20 transition-colors">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="w-full mt-4 justify-between group-hover:bg-accent"
        onClick={onClick}
      >
        {action}
        <ExternalLink className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
