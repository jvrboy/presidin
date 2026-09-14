"use client";

import { GlassPanel, SectionTitle, LiquidProgress, ShimmerButton, DirectionBadge } from "@/components/presidin/glass";
import { useAgentConfigStore } from "@/stores/presidin";
import { AGENT_REGISTRY } from "@/lib/presidin/agents";
import { Sparkles, RotateCcw, Save, Info } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export function AgentsSection() {
  const { enabledAgents, weights, minConfidence, rrRatio, setEnabled, setWeight, setMinConfidence, setRRRatio, reset } = useAgentConfigStore();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Agent Configuration"
        subtitle="17 voting agents + MasterAgent arbiter — toggle, weight, and tune"
        icon={<Sparkles className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={reset} className="text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </ShimmerButton>
        }
      />

      {/* Master config */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassPanel veil>
          <h3 className="text-sm font-semibold">Master Agent Settings</h3>
          <p className="mt-1 text-xs text-muted-foreground">Global thresholds applied to all signals</p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Min confidence</span>
                <span className="tnum font-semibold">{minConfidence.toFixed(0)}%</span>
              </div>
              <Slider
                value={[minConfidence]}
                onValueChange={(v) => setMinConfidence(v[0])}
                min={20}
                max={95}
                step={5}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">R:R ratio target</span>
                <span className="tnum font-semibold">1:{rrRatio.toFixed(1)}</span>
              </div>
              <Slider
                value={[rrRatio]}
                onValueChange={(v) => setRRRatio(v[0])}
                min={0.5}
                max={5}
                step={0.5}
              />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="lg:col-span-2" veil>
          <h3 className="text-sm font-semibold">Registry Summary</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-secondary/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total agents</div>
              <div className="tnum text-2xl font-bold">{AGENT_REGISTRY.length}</div>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300">Enabled</div>
              <div className="tnum text-2xl font-bold text-emerald-200">{enabledAgents.length}</div>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Categories</div>
              <div className="tnum text-2xl font-bold">17</div>
            </div>
            <div className="rounded-lg bg-violet-500/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-violet-300">Total weight</div>
              <div className="tnum text-2xl font-bold text-violet-200">
                {enabledAgents.reduce((sum, id) => sum + (weights[id] ?? 0), 0).toFixed(1)}
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            The MasterAgent aggregates all enabled agents' votes, weighting by each agent's confidence × weight. The Meta Agent acts as the debate arbiter and applies calibration adjustments. Hover any agent below to see its description.
          </div>
        </GlassPanel>
      </div>

      {/* Agent registry table */}
      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Agent Registry</h3>
        <div className="space-y-1.5">
          <div className="grid grid-cols-12 gap-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Agent</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2 text-center">Enabled</div>
            <div className="col-span-3">Weight</div>
            <div className="col-span-1 text-right">Value</div>
          </div>
          {AGENT_REGISTRY.map((agent) => {
            const enabled = enabledAgents.includes(agent.id);
            const weight = weights[agent.id] ?? agent.defaultWeight;
            return (
              <div
                key={agent.id}
                className={`grid grid-cols-12 items-center gap-2 rounded-lg px-3 py-2 transition ${
                  selected === agent.id ? "bg-violet-500/10 ring-1 ring-violet-500/30" : "bg-secondary/20 hover:bg-secondary/40"
                }`}
                onClick={() => setSelected(selected === agent.id ? null : agent.id)}
              >
                <div className="col-span-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/20 to-indigo-500/20 text-xs font-bold text-violet-300">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{agent.name}</div>
                    {selected === agent.id && (
                      <div className="text-[10px] text-muted-foreground">{agent.description}</div>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {agent.category}
                  </span>
                </div>
                <div className="col-span-2 flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={enabled} onCheckedChange={(v) => setEnabled(agent.id, v)} />
                </div>
                <div className="col-span-3" onClick={(e) => e.stopPropagation()}>
                  <Slider
                    value={[weight * 10]}
                    onValueChange={(v) => setWeight(agent.id, v[0] / 10)}
                    min={0}
                    max={20}
                    step={1}
                    disabled={!enabled}
                  />
                </div>
                <div className="col-span-1 tnum text-right text-xs font-semibold">{weight.toFixed(1)}x</div>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
