"use client";

import { useEffect, useState } from "react";
import { GlassPanel, LiquidProgress, DirectionBadge } from "@/components/presidin/glass";
import { Brain, TrendingUp, TrendingDown, Award, AlertTriangle } from "lucide-react";

interface AgentInsight {
  agentId: string;
  agentName: string;
  votes: number;
  correct: number;
  accuracy: number;
  avgConfidence: number;
  weight: number;
  contribution: number;
  direction: string;
}

interface InsightsData {
  agents: AgentInsight[];
  totalSignals: number;
  evaluated: number;
  topContributors: AgentInsight[];
  needsImprovement: AgentInsight[];
}

export function LearningInsightsPanel() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/learning/insights");
        if (res.ok) {
          const d = await res.json();
          setData(d);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <GlassPanel veil className="py-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-violet-400/50" />
        <p className="mt-2 text-sm text-muted-foreground">Loading insights…</p>
      </GlassPanel>
    );
  }

  if (!data || data.evaluated === 0) {
    return (
      <GlassPanel veil className="py-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-violet-400/50" />
        <p className="mt-2 text-sm font-medium">No insights yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The engine needs at least 10 evaluated signals to generate insights.
          Currently {data?.totalSignals ?? 0} signals generated, 0 evaluated.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-4">
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Learning Insights</h3>
          </div>
          <span className="text-xs text-muted-foreground">{data.evaluated} signals analyzed</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Per-agent accuracy + contribution score. Agents that consistently agree with winning signals get more weight; agents that drag accuracy down get less.
        </p>

        {/* Top contributors */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Award className="h-3 w-3" />
            TOP CONTRIBUTORS
          </div>
          <div className="space-y-1.5">
            {data.topContributors.slice(0, 5).map((agent, i) => (
              <AgentRow key={agent.agentId} agent={agent} rank={i + 1} variant="good" />
            ))}
          </div>
        </div>

        {/* Needs improvement */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            NEEDS IMPROVEMENT
          </div>
          <div className="space-y-1.5">
            {data.needsImprovement.slice(0, 5).map((agent, i) => (
              <AgentRow key={agent.agentId} agent={agent} rank={i + 1} variant="bad" />
            ))}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function AgentRow({ agent, rank, variant }: { agent: AgentInsight; rank: number; variant: "good" | "bad" }) {
  const isGood = variant === "good";
  return (
    <div className={`grid grid-cols-12 items-center gap-2 rounded-lg p-2 text-xs ${
      isGood ? "bg-emerald-500/8" : "bg-rose-500/8"
    }`}>
      <div className="col-span-1 tnum text-muted-foreground">#{rank}</div>
      <div className="col-span-4 truncate font-medium">{agent.agentName}</div>
      <div className="col-span-3">
        <LiquidProgress
          value={agent.accuracy}
          className="h-1.5"
        />
      </div>
      <div className={`col-span-2 tnum font-semibold ${isGood ? "text-emerald-400" : "text-rose-400"}`}>
        {agent.accuracy.toFixed(0)}%
      </div>
      <div className={`col-span-2 tnum text-right ${agent.contribution > 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {agent.contribution > 0 ? "+" : ""}{agent.contribution.toFixed(1)}
      </div>
    </div>
  );
}
