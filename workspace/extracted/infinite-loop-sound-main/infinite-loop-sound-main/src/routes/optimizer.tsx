import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, TrendingDown, TrendingUp, ArrowRight, Activity, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayPair } from "@/lib/engine/deriv";
import { toast } from "sonner";

export const Route = createFileRoute("/optimizer")({
  head: () => ({
    meta: [
      { title: "Signal Optimizer — DivergenceIQ" },
      {
        name: "description",
        content:
          "Analyze losing signals, understand why they hit SL, and auto-improve future scoring.",
      },
    ],
  }),
  component: OptimizerPage,
});

interface LossRecord {
  id: string;
  pair: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  score: number;
  rating: string;
  created_at: string;
  result: string;
  confluence: any[];
}

function OptimizerPage() {
  const [losses, setLosses] = useState<LossRecord[]>([]);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    supabase
      .from("signals")
      .select("*")
      .or("result.eq.SL,result.eq.LOSS")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setLosses((data as LossRecord[]) ?? []));

    const ch = supabase
      .channel("optimizer-losses")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "signals" }, (p) => {
        const r = (p.new as LossRecord).result || "";
        if (r.toUpperCase() === "SL" || r.toUpperCase() === "LOSS") {
          setLosses((prev) => [p.new as LossRecord, ...prev]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const analysis = useMemo(() => {
    const byPair: Record<string, { count: number; totalScore: number; reasons: string[] }> = {};
    const byIndicator: Record<string, { count: number; totalScore: number }> = {};

    losses.forEach((l) => {
      const pair = l.pair;
      if (!byPair[pair]) byPair[pair] = { count: 0, totalScore: 0, reasons: [] };
      byPair[pair].count++;
      byPair[pair].totalScore += l.score;

      const conf = (l.confluence || []) as any[];
      conf.forEach((c) => {
        if (!c.passed) return;
        const key = c.label;
        if (!byIndicator[key]) byIndicator[key] = { count: 0, totalScore: 0 };
        byIndicator[key].count++;
        byIndicator[key].totalScore += l.score;
      });
    });

    const weakestIndicators = Object.entries(byIndicator)
      .map(([label, { count, totalScore }]) => ({
        label,
        count,
        avgScore: totalScore / (count || 1),
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5);

    const weakestPairs = Object.entries(byPair)
      .map(([pair, { count, totalScore }]) => ({
        pair,
        count,
        avgScore: totalScore / (count || 1),
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5);

    return { weakestPairs, weakestIndicators, totalLosses: losses.length };
  }, [losses]);

  const autoFix = () => {
    setApplying(true);
    const newFixes: Record<string, string> = {};
    analysis.weakestPairs.forEach((p) => {
      newFixes[p.pair] =
        `Consider tighter SL on ${displayPair(p.pair)} (avg score ${p.avgScore.toFixed(0)}). Reduce position size by 20% until win rate improves.`;
    });
    analysis.weakestIndicators.forEach((ind) => {
      newFixes[ind.label] =
        `Indicator "${ind.label}" appears in ${ind.count} losses with avg score ${ind.avgScore.toFixed(0)}. Lower its weight or require additional confirmation.`;
    });
    setFixes(newFixes);
    toast.success("Optimizer analyzed losses and generated fixes");
    setApplying(false);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Wrench className="w-6 h-6 text-primary" />
              Signal Optimizer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Learn from losses. Auto-improve future signals.
            </p>
          </div>
          <Button onClick={autoFix} disabled={applying || analysis.totalLosses === 0}>
            <Brain className="w-4 h-4 mr-2" />
            {applying ? "Analyzing..." : "Auto-Fix"}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={TrendingDown} label="Total Losses" value={analysis.totalLosses} />
          <StatCard
            icon={Activity}
            label="Pairs Analyzed"
            value={Object.keys(analysis.weakestPairs).length}
          />
          <StatCard
            icon={Brain}
            label="Weak Indicators"
            value={analysis.weakestIndicators.length}
          />
          <StatCard icon={TrendingUp} label="Improvement" value={Object.keys(fixes).length} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Weakest Pairs
            </h2>
            {analysis.weakestPairs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No loss data yet. Signals that hit SL will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {analysis.weakestPairs.map((p) => (
                  <div
                    key={p.pair}
                    className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  >
                    <span className="font-mono font-semibold">{displayPair(p.pair)}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.count} losses · avg score {p.avgScore.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Indicator Risk
            </h2>
            {analysis.weakestIndicators.length === 0 ? (
              <p className="text-xs text-muted-foreground">No loss data yet.</p>
            ) : (
              <div className="space-y-2">
                {analysis.weakestIndicators.map((ind) => (
                  <div
                    key={ind.label}
                    className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  >
                    <span className="font-semibold">{ind.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {ind.count} times · avg {ind.avgScore.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {Object.keys(fixes).length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recommended Fixes
            </h2>
            {Object.entries(fixes).map(([key, fix]) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{fix}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Losses
          </div>
          <div className="max-h-96 overflow-auto">
            {losses.slice(0, 20).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between px-4 py-2 border-t border-border text-xs font-mono"
              >
                <span className="font-semibold">{displayPair(l.pair)}</span>
                <span className="text-muted-foreground">{l.timeframe}</span>
                <span className={l.direction === "BUY" ? "text-bull" : "text-bear"}>
                  {l.direction}
                </span>
                <span className="text-muted-foreground">Entry {l.entry.toFixed(5)}</span>
                <span className="text-bear">SL {l.sl.toFixed(5)}</span>
                <span className="text-muted-foreground">Score {l.score}</span>
              </div>
            ))}
            {losses.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No losses recorded yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}
