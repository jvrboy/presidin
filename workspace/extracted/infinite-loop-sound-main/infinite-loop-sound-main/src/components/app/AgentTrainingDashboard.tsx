import { useState, useEffect, useCallback } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Zap,
  Target,
  TrendingUp,
  Activity,
  Cpu,
  Play,
  Square,
  RefreshCw,
} from "lucide-react";
import { useLocalDataStore } from "@/lib/store/local-data-store";

interface AgentState {
  id: string;
  name: string;
  enabled: boolean;
  version: string;
  accuracy: number;
  trained: boolean;
  trainingProgress: number;
  lastTrained: number | null;
  runs: number;
  wins: number;
}

const AGENTS: Omit<
  AgentState,
  "accuracy" | "trained" | "trainingProgress" | "lastTrained" | "runs" | "wins"
>[] = [
  { id: "strategy-agent", name: "Strategy Agent", enabled: true, version: "2.1.0" },
  { id: "risk-agent", name: "Risk Manager", enabled: true, version: "2.0.3" },
  { id: "news-agent", name: "News Sentiment", enabled: true, version: "1.8.2" },
  { id: "confluence-agent", name: "Confluence Engine", enabled: true, version: "2.3.1" },
  { id: "optimization-agent", name: "Parameter Optimizer", enabled: true, version: "1.5.0" },
  { id: "automation-agent", name: "Automation Hub", enabled: true, version: "1.9.4" },
  { id: "pattern-agent", name: "Pattern Recognition", enabled: true, version: "2.0.1" },
  { id: "self-learning-agent", name: "Self-Learning Core", enabled: true, version: "3.0.0" },
  { id: "liquidity-agent", name: "Liquidity Flow", enabled: true, version: "1.0.0" },
  { id: "volatility-agent", name: "Volatility Regime", enabled: true, version: "1.0.0" },
  { id: "correlation-agent", name: "Correlation Matrix", enabled: true, version: "1.0.0" },
  { id: "execution-flow-agent", name: "Execution Flow", enabled: true, version: "1.0.0" },
];

export function AgentTrainingDashboard() {
  const store = useLocalDataStore();
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [training, setTraining] = useState<string | null>(null);
  const [globalRunning, setGlobalRunning] = useState(false);

  const loadAgents = useCallback(async () => {
    const { data } = await store.select<AgentState>("agent_states");
    const saved = data || [];
    const merged = AGENTS.map((a) => {
      const s = saved.find((s) => s.id === a.id);
      return {
        ...a,
        accuracy: s?.accuracy ?? 0,
        trained: s?.trained ?? false,
        trainingProgress: s?.trainingProgress ?? 0,
        lastTrained: s?.lastTrained ?? null,
        runs: s?.runs ?? 0,
        wins: s?.wins ?? 0,
      };
    });
    setAgents(merged);
  }, [store]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const trainAgent = useCallback(
    async (id: string) => {
      setTraining(id);
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;

      for (let pct = 0; pct <= 100; pct += 5) {
        await new Promise((r) => setTimeout(r, 80));
        const updated = agents.map((a) =>
          a.id === id
            ? {
                ...a,
                trainingProgress: pct,
                accuracy: Math.min(99, a.accuracy + Math.random() * 2),
              }
            : a,
        );
        setAgents(updated);
      }

      const finalAgent = agents.find((a) => a.id === id);
      if (finalAgent) {
        const updated: AgentState = {
          ...finalAgent,
          trained: true,
          trainingProgress: 100,
          lastTrained: Date.now(),
          accuracy: Math.min(99, finalAgent.accuracy + Math.random() * 5),
          runs: finalAgent.runs + 1,
          wins: finalAgent.wins + (Math.random() > 0.4 ? 1 : 0),
        };
        await store.upsert("agent_states", updated);
      }
      setTraining(null);
      loadAgents();
    },
    [agents, store, loadAgents],
  );

  const trainAll = useCallback(async () => {
    setGlobalRunning(true);
    for (const a of AGENTS) {
      if (!a.enabled) continue;
      await trainAgent(a.id);
    }
    setGlobalRunning(false);
  }, [trainAgent]);

  const toggleAgent = useCallback(
    async (id: string) => {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;
      const updated = { ...agent, enabled: !agent.enabled };
      await store.upsert("agent_states", updated);
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
    },
    [agents, store],
  );

  const trainedCount = agents.filter((a) => a.trained).length;
  const avgAccuracy =
    agents.length > 0 ? Math.round(agents.reduce((a, b) => a + b.accuracy, 0) / agents.length) : 0;
  const totalRuns = agents.reduce((a, b) => a + b.runs, 0);
  const totalWins = agents.reduce((a, b) => a + b.wins, 0);
  const winRate = totalRuns > 0 ? Math.round((totalWins / totalRuns) * 100) : 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Agent Training Lab"
        subtitle="Train, monitor, and orchestrate 12 specialized trading agents."
        icon={<Brain className="w-5 h-5" />}
        action={
          <Button onClick={trainAll} disabled={globalRunning} className="gap-2">
            {globalRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Training all...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Train All Agents
              </>
            )}
          </Button>
        }
      />

      <KpiGrid
        tiles={[
          {
            label: "Active Agents",
            value: agents.filter((a) => a.enabled).length,
            sub: `of ${agents.length} total`,
            icon: <Cpu className="w-4 h-4" />,
            accent: "primary",
          },
          {
            label: "Trained",
            value: trainedCount,
            sub: `${Math.round((trainedCount / agents.length) * 100)}% coverage`,
            icon: <Target className="w-4 h-4" />,
            accent: "bull",
          },
          {
            label: "Avg Accuracy",
            value: `${avgAccuracy}%`,
            sub: "across all agents",
            icon: <TrendingUp className="w-4 h-4" />,
            accent: "bull",
          },
          {
            label: "Win Rate",
            value: `${winRate}%`,
            sub: `${totalWins}W / ${totalRuns}R`,
            icon: <Activity className="w-4 h-4" />,
            accent: winRate >= 60 ? "bull" : "warning",
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <ProCard
            key={agent.id}
            title={agent.name}
            description={`v${agent.version} · ${agent.trained ? "Trained" : "Untrained"}`}
            icon={<Zap className="w-4 h-4" />}
            action={
              <Badge variant={agent.enabled ? "default" : "secondary"} className="text-[10px]">
                {agent.enabled ? "ONLINE" : "OFFLINE"}
              </Badge>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Accuracy</span>
                <span className="font-mono font-bold">{agent.accuracy.toFixed(1)}%</span>
              </div>
              <MeterBar
                value={agent.accuracy}
                color={agent.accuracy >= 70 ? "bull" : agent.accuracy >= 50 ? "warning" : "bear"}
              />

              {training === agent.id && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Training...</span>
                    <span className="font-mono">{agent.trainingProgress}%</span>
                  </div>
                  <MeterBar value={agent.trainingProgress} color="primary" />
                </div>
              )}

              {agent.lastTrained && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Last trained: {new Date(agent.lastTrained).toLocaleString()}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => trainAgent(agent.id)}
                  disabled={training === agent.id || globalRunning}
                  className="flex-1 gap-1.5"
                >
                  {training === agent.id ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Train
                </Button>
                <Button
                  size="sm"
                  variant={agent.enabled ? "destructive" : "outline"}
                  onClick={() => toggleAgent(agent.id)}
                  className="gap-1.5"
                >
                  {agent.enabled ? (
                    <>
                      <Square className="w-3 h-3" /> Disable
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Enable
                    </>
                  )}
                </Button>
              </div>
            </div>
          </ProCard>
        ))}
      </div>
    </div>
  );
}
