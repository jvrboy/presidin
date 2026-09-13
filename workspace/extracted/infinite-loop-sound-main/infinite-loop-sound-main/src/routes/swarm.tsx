import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo, useState, useCallback } from "react";
import {
  Cpu,
  Radar,
  Orbit,
  Zap,
  Activity,
  RefreshCw,
  Play,
  Square,
  Shield,
  Layers,
  Waves,
  Globe,
  Server,
  TrainFront,
  Gauge,
} from "lucide-react";
import { ProCard, MeterBar, DataPanel, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { buildV2Swarm, trainV2Agents, type V2Agent, type SwarmHeartbeat } from "@/lib/agents/v2";

export const Route = createFileRoute("/swarm")({
  head: () => ({ meta: [{ title: "Agent Swarm — DivergenceIQ" }] }),
  component: SwarmPage,
});

const ICONS: Record<string, React.ReactNode> = {
  v2_regime: <Layers className="w-4 h-4" />,
  v2_liquidity: <Waves className="w-4 h-4" />,
  v2_macro: <Globe className="w-4 h-4" />,
  v2_exec: <Zap className="w-4 h-4" />,
  v2_swarm_coordinator: <Orbit className="w-4 h-4" />,
};

function synthCandles(n: number, seed: number) {
  let price = 100,
    s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = (rand() - 0.5) * 0.8;
    const c = Math.max(0.01, o + drift);
    const h = Math.max(o, c) + rand() * 0.4;
    const l = Math.min(o, c) - rand() * 0.4;
    out.push({ o, h, l, c, v: Math.round(500 + rand() * 2000), t: Date.now() - (n - i) * 60000 });
    price = c;
  }
  return out;
}

function SwarmPage() {
  const swarm = useMemo(() => buildV2Swarm(), []);
  const [agents, setAgents] = useState<V2Agent[]>(swarm.all);
  const [results, setResults] = useState<Record<string, any>>({});
  const [heartbeat, setHeartbeat] = useState<SwarmHeartbeat>(swarm.coordinator.heartbeat());
  const [running, setRunning] = useState(false);
  const [training, setTraining] = useState<Record<string, any> | null>(null);

  const toggleAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.config.id === id ? { ...a, config: { ...a.config, enabled: !a.config.enabled } } : a,
      ),
    );
    swarm.all.forEach((a) => {
      if (a.config.id === id) a.config.enabled = !a.config.enabled;
    });
  };

  const runAll = useCallback(async () => {
    setRunning(true);
    try {
      const candles = synthCandles(200, Date.now() % 9999);
      const input = {
        instrument: "R_100",
        timeframe: "M5",
        candles,
        ticks: [] as any[],
        recentSignals: [],
        news: [],
      };
      for (const a of swarm.workers) {
        if (!a.config.enabled) continue;
        const r = await a.run(input);
        setResults((prev) => ({ ...prev, [a.config.id]: r }));
      }
      const cr = await swarm.coordinator.run(input);
      setResults((prev) => ({ ...prev, [swarm.coordinator.config.id]: cr }));
      setHeartbeat(swarm.coordinator.heartbeat());
    } finally {
      setRunning(false);
    }
  }, [swarm]);

  const train = useCallback(() => {
    const candles = synthCandles(500, Date.now() % 7777);
    setTraining(trainV2Agents(candles));
  }, []);

  const workerCount = agents.filter(
    (a) => a.config.id !== "v2_swarm_coordinator" && a.config.enabled,
  ).length;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Agent Swarm"
          subtitle="Multi-agent pipeline: regime + liquidity + macro + execution, coordinated into consensus signals."
          icon={<Orbit className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={train}>
                <TrainFront className="w-4 h-4" /> Train Agents
              </Button>
              <Button size="sm" onClick={runAll} disabled={running}>
                {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {running ? "Running..." : "Run Swarm"}
              </Button>
            </div>
          }
        />

        <KpiGrid
          tiles={[
            {
              label: "Active Workers",
              value: workerCount,
              sub: `${agents.length} total agents`,
              accent: "primary",
              icon: <Cpu className="w-4 h-4" />,
            },
            {
              label: "Consensus Score",
              value: `${(heartbeat.consensusScore * 100).toFixed(0)}%`,
              sub: heartbeat.pipelineStage,
              accent: heartbeat.consensusScore > 0.6 ? "bull" : "neutral",
              icon: <Activity className="w-4 h-4" />,
            },
            {
              label: "Raw Signals",
              value: heartbeat.totalSignals,
              sub: "last run",
              accent: "primary",
              icon: <Zap className="w-4 h-4" />,
            },
            {
              label: "Coordinator",
              value: "ONLINE",
              sub: swarm.coordinator.config.id,
              accent: "bull",
              icon: <Server className="w-4 h-4" />,
            },
          ]}
        />

        {training && (
          <ProCard
            title="Training Output"
            description={`Calibrated from ${training.sampleSize} sample candles`}
            icon={<TrainFront className="w-4 h-4" />}
            action={<Badge variant="outline">trained {training.volBaseline.toFixed(3)}% vol</Badge>}
          >
            <DataPanel
              dense
              headers={["Parameter", "Value"]}
              rows={[
                [
                  "Volatility baseline",
                  <span className="font-mono">{training.volBaseline.toFixed(3)}%</span>,
                ],
                [
                  "Trend threshold (ADX)",
                  <span className="font-mono">{training.trendThreshold.toFixed(1)}</span>,
                ],
                [
                  "Quiet threshold",
                  <span className="font-mono">{training.quietThreshold.toFixed(3)}%</span>,
                ],
                [
                  "Sweep proximity (pips)",
                  <span className="font-mono">{training.sweepProximityPips.toFixed(1)}</span>,
                ],
              ]}
            />
          </ProCard>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => {
            const r = results[a.config.id];
            const isCoord = a.config.id === "v2_swarm_coordinator";
            return (
              <ProCard
                key={a.config.id}
                title={a.config.name}
                description={a.config.description}
                icon={ICONS[a.config.id]}
                action={
                  <div className="flex items-center gap-2">
                    <Badge variant={a.config.priority === "critical" ? "destructive" : "outline"}>
                      {a.config.priority}
                    </Badge>
                    <Switch
                      checked={a.config.enabled}
                      onCheckedChange={() => toggleAgent(a.config.id)}
                    />
                  </div>
                }
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">ID:</span>
                    <code className="font-mono">{a.config.id}</code>
                    {isCoord && (
                      <Badge className="ml-auto">
                        <Orbit className="w-3 h-3 mr-1" />
                        coordinator
                      </Badge>
                    )}
                  </div>
                  {r ? (
                    <>
                      {r.insights?.map((ins: string, i: number) => (
                        <div key={i} className="text-xs flex items-start gap-2">
                          <Activity className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                          <span>{ins}</span>
                        </div>
                      ))}
                      {r.signals?.length > 0 && (
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-xs font-semibold mb-1">Signals emitted</p>
                          {r.signals.map((s: any) => (
                            <div key={s.id} className="flex items-center gap-2 text-xs">
                              <Badge
                                variant="outline"
                                className={s.direction === "BUY" ? "text-bull" : "text-bear"}
                              >
                                {s.direction}
                              </Badge>
                              <span className="font-mono">{s.pair}</span>
                              <span className="text-muted-foreground">score {s.score}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.duration !== undefined && (
                        <p className="text-[10px] text-muted-foreground">ran in {r.duration}ms</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not run yet. Click "Run Swarm" to execute.
                    </p>
                  )}
                </div>
              </ProCard>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
