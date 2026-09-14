"use client";

import { useEffect, useState } from "react";
import { GlassPanel, DirectionBadge, LiquidProgress } from "@/components/presidin/glass";
import { Flame, Sparkles, AlertTriangle } from "lucide-react";

interface ConfluenceSignal {
  symbol: string;
  direction: "BUY" | "SELL";
  baseConfidence: number;
  boostedConfidence: number;
  boost: number;
  level: "TRIPLE" | "DOUBLE" | "SINGLE" | "CONFLICT";
  levelLabel: string;
  timeframes: string[];
  consensusScore: number;
  suggestedEntry: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskRewardRatio: number;
}

export function ConfluencePanel() {
  const [confluences, setConfluences] = useState<ConfluenceSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/confluence");
        if (res.ok) {
          const data = await res.json();
          setConfluences(data.confluences ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <GlassPanel veil className="py-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-violet-400/50" />
        <p className="mt-2 text-xs text-muted-foreground">Scanning for confluences…</p>
      </GlassPanel>
    );
  }

  if (confluences.length === 0) {
    return (
      <GlassPanel veil className="py-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-violet-400/50" />
        <p className="mt-2 text-sm font-medium">No active confluences</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When signals align across 2+ timeframes for the same symbol, they appear here with boosted confidence.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel veil>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Multi-Timeframe Confluence</h3>
        </div>
        <span className="text-xs text-muted-foreground">{confluences.length} active</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Signals aligned across multiple timeframes get a confidence boost. Triple confluence = +25% boost.
      </p>
      <div className="space-y-2 max-h-80 overflow-y-auto scroll-fancy">
        {confluences.map((c, i) => {
          const isTriple = c.level === "TRIPLE";
          const isDouble = c.level === "DOUBLE";
          return (
            <div
              key={i}
              className={`rounded-lg p-3 ring-1 ${
                isTriple ? "bg-amber-500/10 ring-amber-500/30"
                : isDouble ? "bg-violet-500/10 ring-violet-500/30"
                : "bg-secondary/30 ring-border/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DirectionBadge direction={c.direction} />
                  <span className="font-semibold text-sm">{c.symbol}</span>
                </div>
                <span className={`text-xs font-bold ${isTriple ? "text-amber-300" : isDouble ? "text-violet-300" : "text-slate-400"}`}>
                  {c.levelLabel}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs mb-2">
                <div className="flex gap-1">
                  {c.timeframes.map((tf) => (
                    <span key={tf} className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium">{tf}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Base: {c.baseConfidence.toFixed(0)}%</span>
                  <span className="text-emerald-400 font-semibold">+{c.boost}%</span>
                  <span className="font-bold tnum">{c.boostedConfidence.toFixed(0)}%</span>
                </div>
                <LiquidProgress value={c.boostedConfidence} className="h-1.5" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">R:R 1:{c.riskRewardRatio.toFixed(1)}</span>
                <span className={`tnum font-semibold ${c.consensusScore > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  consensus {c.consensusScore > 0 ? "+" : ""}{c.consensusScore.toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
