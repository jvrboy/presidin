import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Dices, RefreshCw, History, BarChart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/simulator")({
  head: () => ({ meta: [{ title: "Monte Carlo Simulator — DivergenceIQ" }] }),
  component: SimulatorPage,
});

// ----------------------------------------------------------------------------
// True Monte Carlo: 200 random sequences sampling N trades from the configured
// win-rate / R:R, then aggregated to percentile bands. Defaults are pulled from
// the user's *actual* bot trade history when available — so the simulator
// answers "given how I'm trading right now, what's my distribution of outcomes?"
// ----------------------------------------------------------------------------

const N_RUNS = 200;

interface Run {
  curve: number[];
  finalBalance: number;
  maxDrawdownPct: number;
  wins: number;
  blowupAt: number | null; // first trade index where balance ≤ 0, else null
}

function runSimulations(opts: {
  startingBalance: number;
  trades: number;
  winRate: number; // 0..100
  riskReward: number;
  riskPerTrade: number; // % of current balance
  nRuns: number;
}): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < opts.nRuns; r++) {
    let bal = opts.startingBalance;
    let peak = bal;
    let maxDd = 0;
    let wins = 0;
    let blowupAt: number | null = null;
    const curve: number[] = [bal];
    for (let i = 1; i <= opts.trades; i++) {
      if (bal <= 0) {
        if (blowupAt === null) blowupAt = i;
        curve.push(0);
        continue;
      }
      const risk = bal * (opts.riskPerTrade / 100);
      const isWin = Math.random() * 100 < opts.winRate;
      bal = isWin ? bal + risk * opts.riskReward : bal - risk;
      if (isWin) wins++;
      if (bal > peak) peak = bal;
      const dd = peak > 0 ? ((peak - bal) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
      curve.push(Math.max(0, bal));
    }
    runs.push({ curve, finalBalance: bal, maxDrawdownPct: maxDd, wins, blowupAt });
  }
  return runs;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

interface HistoricalStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  source: "live" | "default";
}

function SimulatorPage() {
  // Historical defaults pulled from bot_trades
  const [hist, setHist] = useState<HistoricalStats>({
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 55,
    source: "default",
  });
  const [startingBalance, setStartingBalance] = useState(10000);
  const [trades, setTrades] = useState(100);
  const [winRate, setWinRate] = useState(55);
  const [riskReward, setRiskReward] = useState(1.5);
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [seed, setSeed] = useState(0);

  // Pull real trade history once on mount; if there's enough sample, prefill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("bot_trades")
        .select("status")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cancelled || error || !data) return;
      const wins = data.filter(
        (t: any) => t.status === "win" || t.status === "closed_profit",
      ).length;
      const losses = data.filter(
        (t: any) => t.status === "loss" || t.status === "closed_loss" || t.status === "error",
      ).length;
      const n = wins + losses;
      if (n >= 20) {
        const rate = (wins / n) * 100;
        setHist({ trades: n, wins, losses, winRate: rate, source: "live" });
        setWinRate(Math.round(rate));
      } else {
        setHist((h) => ({ ...h, trades: n, wins, losses }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-run Monte Carlo whenever inputs change. 200 runs of N trades each.
  const { chartData, stats } = useMemo(() => {
    void seed; // include in deps
    const runs = runSimulations({
      startingBalance,
      trades,
      winRate,
      riskReward,
      riskPerTrade,
      nRuns: N_RUNS,
    });
    // For each trade index, gather all balances across runs and compute percentiles
    const len = trades + 1;
    const cd: Array<{
      trade: number;
      p10: number;
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    }> = [];
    for (let i = 0; i < len; i++) {
      const slice = runs.map((r) => r.curve[i] ?? 0).sort((a, b) => a - b);
      cd.push({
        trade: i,
        p10: percentile(slice, 10),
        p25: percentile(slice, 25),
        p50: percentile(slice, 50),
        p75: percentile(slice, 75),
        p90: percentile(slice, 90),
      });
    }

    const finals = runs.map((r) => r.finalBalance).sort((a, b) => a - b);
    const dds = runs.map((r) => r.maxDrawdownPct).sort((a, b) => a - b);
    const blowupRate = runs.filter((r) => r.blowupAt !== null).length / runs.length;
    const profitProb = runs.filter((r) => r.finalBalance > startingBalance).length / runs.length;

    return {
      chartData: cd,
      stats: {
        median: percentile(finals, 50),
        p10: percentile(finals, 10),
        p90: percentile(finals, 90),
        worstDd: percentile(dds, 95),
        medianDd: percentile(dds, 50),
        blowupRate,
        profitProb,
        edge: (winRate / 100) * riskReward - (1 - winRate / 100),
      },
    };
  }, [startingBalance, trades, winRate, riskReward, riskPerTrade, seed]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Dices className="w-6 h-6 text-primary" /> Monte Carlo Simulator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {N_RUNS} parallel runs · percentile bands of your equity distribution
              {hist.source === "live" && (
                <>
                  {" "}
                  · prefilled from <code className="px-1 rounded bg-muted/40">bot_trades</code> (
                  {hist.trades} samples)
                </>
              )}
            </p>
          </div>
          <button
            onClick={() => setSeed((s) => s + 1)}
            className="glass-card flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent transition diq-press"
          >
            <RefreshCw className="w-4 h-4 text-primary" /> Re-run
          </button>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Inputs */}
          <div className="glass-card p-5 rounded-lg space-y-4 h-fit">
            <div>
              <label className="text-sm font-medium mb-1.5 block flex justify-between">
                <span>Win rate</span>
                <span className="font-mono text-muted-foreground">{winRate}%</span>
              </label>
              <input
                type="range"
                min={1}
                max={99}
                value={winRate}
                onChange={(e) => setWinRate(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex justify-between">
                <span>Risk : Reward</span>
                <span className="font-mono text-muted-foreground">1 : {riskReward.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={riskReward}
                onChange={(e) => setRiskReward(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex justify-between">
                <span>Trades</span>
                <span className="font-mono text-muted-foreground">{trades}</span>
              </label>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={trades}
                onChange={(e) => setTrades(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex justify-between">
                <span>Risk per trade</span>
                <span className="font-mono text-muted-foreground">{riskPerTrade}%</span>
              </label>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={riskPerTrade}
                onChange={(e) => setRiskPerTrade(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Starting balance</label>
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(Math.max(100, Number(e.target.value)))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-sm"
              />
            </div>

            <div className="pt-4 mt-4 border-t border-border space-y-2.5 text-sm">
              <Stat
                label="Expected edge"
                v={`${stats.edge >= 0 ? "+" : ""}${stats.edge.toFixed(2)}R`}
                good={stats.edge > 0}
              />
              <Stat
                label="Profit probability"
                v={`${(stats.profitProb * 100).toFixed(0)}%`}
                good={stats.profitProb >= 0.5}
              />
              <Stat
                label="Median finish"
                v={`$${Math.round(stats.median).toLocaleString()}`}
                good={stats.median > startingBalance}
              />
              <Stat
                label="10th pct (bad)"
                v={`$${Math.round(stats.p10).toLocaleString()}`}
                good={stats.p10 > startingBalance}
              />
              <Stat label="90th pct (good)" v={`$${Math.round(stats.p90).toLocaleString()}`} good />
              <Stat label="Median DD" v={`-${stats.medianDd.toFixed(1)}%`} good={false} />
              <Stat label="Tail DD (P95)" v={`-${stats.worstDd.toFixed(1)}%`} good={false} />
              <Stat
                label="Blow-up rate"
                v={`${(stats.blowupRate * 100).toFixed(1)}%`}
                good={stats.blowupRate < 0.05}
              />
            </div>
          </div>

          {/* Chart */}
          <div className="md:col-span-3 glass-card p-5 rounded-lg h-[500px] flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <BarChart className="w-4 h-4 text-primary" /> Equity distribution ({N_RUNS} runs)
            </h3>
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="band90" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="band75" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="trade"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    width={70}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v: any, name: any) => [
                      `$${Math.round(Number(v)).toLocaleString()}`,
                      name,
                    ]}
                  />
                  {/* 10–90 band */}
                  <Area
                    type="monotone"
                    dataKey="p90"
                    stroke="none"
                    fill="url(#band90)"
                    stackId="band90"
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    stroke="none"
                    fill="var(--background)"
                    stackId="band90"
                  />
                  {/* 25–75 band on top */}
                  <Area
                    type="monotone"
                    dataKey="p75"
                    stroke="none"
                    fill="url(#band75)"
                    stackId="band75"
                  />
                  <Area
                    type="monotone"
                    dataKey="p25"
                    stroke="none"
                    fill="var(--background)"
                    stackId="band75"
                  />
                  {/* median line */}
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded" style={{ background: "rgba(59,130,246,0.25)" }} />{" "}
                10–90 pct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded" style={{ background: "rgba(59,130,246,0.35)" }} />{" "}
                25–75 pct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded" style={{ background: "#10b981" }} /> Median
              </span>
              <span className="ml-auto flex items-center gap-1">
                <History className="w-3 h-3" />{" "}
                {hist.source === "live"
                  ? `historical: ${hist.wins}W / ${hist.losses}L`
                  : "no historical sample yet"}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Distribution computed over {N_RUNS} independent Monte Carlo runs. Inputs default to your
          actual bot_trades win rate when ≥20 trades exist.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, v, good }: { label: string; v: string; good: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold ${good ? "text-bull" : "text-bear"}`}>{v}</span>
    </div>
  );
}
