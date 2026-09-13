import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo, useEffect } from "react";
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash,
  Trophy,
  AlertTriangle,
  Brain,
  BarChart,
  RefreshCw,
  CircleCheck,
  XCircle,
  MinusCircle,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/streak")({
  head: () => ({
    meta: [
      { title: "Trade Streak Tracker — DivergenceIQ" },
      {
        name: "description",
        content: "Track win/loss streaks with psychological insights and tilt detection.",
      },
    ],
  }),
  component: StreakPage,
});

type TradeResult = "WIN" | "LOSS" | "BE";

interface TradeRecord {
  id: string;
  result: TradeResult;
  pair: string;
  rr: number;
  note: string;
  ts: number;
}

const LOCAL_KEY = "diq.streak.trades.v1";

function readLocal(): TradeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeLocal(t: TradeRecord[]) {
  if (typeof window !== "undefined") localStorage.setItem(LOCAL_KEY, JSON.stringify(t));
}

const PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CAD",
  "XAU/USD",
  "GBP/JPY",
  "EUR/JPY",
];

function computeStreaks(trades: TradeRecord[]) {
  if (!trades.length)
    return {
      currentStreak: { type: "WIN" as TradeResult, count: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
      winRate: 0,
      totalR: 0,
      avgRR: 0,
      wins: 0,
      losses: 0,
      bes: 0,
      streakHistory: [] as Array<{ type: TradeResult; count: number; end: number }>,
      tiltRisk: "LOW" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      tiltMessage: "",
    };

  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  let maxWin = 0,
    maxLoss = 0,
    curWin = 0,
    curLoss = 0;
  const streakHistory: Array<{ type: TradeResult; count: number; end: number }> = [];
  let lastType: TradeResult | null = null;
  let lastCount = 0;

  for (const t of sorted) {
    if (t.result === "WIN") {
      curWin++;
      curLoss = 0;
      maxWin = Math.max(maxWin, curWin);
    } else if (t.result === "LOSS") {
      curLoss++;
      curWin = 0;
      maxLoss = Math.max(maxLoss, curLoss);
    } else {
      curWin = 0;
      curLoss = 0;
    }

    if (lastType !== t.result) {
      if (lastType !== null) streakHistory.push({ type: lastType, count: lastCount, end: t.ts });
      lastType = t.result;
      lastCount = 1;
    } else {
      lastCount++;
    }
  }
  if (lastType !== null)
    streakHistory.push({ type: lastType, count: lastCount, end: sorted[sorted.length - 1].ts });

  // Current streak
  let currentStreak: { type: TradeResult; count: number } = { type: "WIN", count: 0 };
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (i === sorted.length - 1) {
      currentStreak = { type: sorted[i].result, count: 1 };
    } else if (sorted[i].result === currentStreak.type) {
      currentStreak.count++;
    } else break;
  }

  const wins = sorted.filter((t) => t.result === "WIN").length;
  const losses = sorted.filter((t) => t.result === "LOSS").length;
  const bes = sorted.filter((t) => t.result === "BE").length;
  const winRate = sorted.length > 0 ? (wins / sorted.length) * 100 : 0;
  const totalR = sorted.reduce(
    (s, t) => s + (t.result === "WIN" ? t.rr : t.result === "LOSS" ? -1 : 0),
    0,
  );
  const avgRR =
    wins > 0 ? sorted.filter((t) => t.result === "WIN").reduce((s, t) => s + t.rr, 0) / wins : 0;

  // Tilt detection
  const recent5 = sorted.slice(-5);
  const recentLosses = recent5.filter((t) => t.result === "LOSS").length;
  let tiltRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let tiltMessage = "You are trading within normal parameters. Stay disciplined.";

  if (currentStreak.type === "LOSS" && currentStreak.count >= 5) {
    tiltRisk = "CRITICAL";
    tiltMessage = `⚠️ ${currentStreak.count}-trade losing streak detected. STOP TRADING immediately. Review your setup and take a break.`;
  } else if (currentStreak.type === "LOSS" && currentStreak.count >= 3) {
    tiltRisk = "HIGH";
    tiltMessage = `${currentStreak.count} consecutive losses. High tilt risk — reduce size or pause trading for the session.`;
  } else if (recentLosses >= 3) {
    tiltRisk = "MEDIUM";
    tiltMessage =
      "3 losses in your last 5 trades. Monitor your emotional state before the next entry.";
  } else if (currentStreak.type === "WIN" && currentStreak.count >= 5) {
    tiltRisk = "MEDIUM";
    tiltMessage = `${currentStreak.count}-trade win streak. Watch for overconfidence — stick to your plan.`;
  }

  return {
    currentStreak,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    winRate,
    totalR,
    avgRR,
    wins,
    losses,
    bes,
    streakHistory,
    tiltRisk,
    tiltMessage,
  };
}

function StreakPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [pair, setPair] = useState("EUR/USD");
  const [rr, setRr] = useState(2.0);
  const [note, setNote] = useState("");

  useEffect(() => {
    setTrades(readLocal());
  }, []);

  const stats = useMemo(() => computeStreaks(trades), [trades]);

  function addTrade(result: TradeResult) {
    const t: TradeRecord = { id: crypto.randomUUID(), result, pair, rr, note, ts: Date.now() };
    const updated = [...trades, t];
    setTrades(updated);
    writeLocal(updated);
    setNote("");
    toast.success(`${result} recorded for ${pair}`);
  }

  function removeLast() {
    if (!trades.length) return;
    const sorted = [...trades].sort((a, b) => b.ts - a.ts);
    const updated = trades.filter((t) => t.id !== sorted[0].id);
    setTrades(updated);
    writeLocal(updated);
    toast.info("Last trade removed");
  }

  function clearAll() {
    setTrades([]);
    writeLocal([]);
    toast.info("Streak history cleared");
  }

  const tiltColors: Record<string, string> = {
    LOW: "bg-bull/10 border-bull/30 text-bull",
    MEDIUM: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    HIGH: "bg-bear/10 border-bear/30 text-bear",
    CRITICAL: "bg-bear/20 border-bear/60 text-bear",
  };

  const recentTrades = [...trades].sort((a, b) => b.ts - a.ts).slice(0, 20);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Flame className="w-6 h-6 text-primary" /> Trade Streak Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Log trades, monitor win/loss streaks, and detect tilt before it damages your account.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={removeLast} disabled={!trades.length}>
              <RefreshCw className="w-4 h-4 mr-1" /> Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={!trades.length}>
              <Trash className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
        </div>

        {/* Tilt Alert */}
        {stats.tiltRisk !== "LOW" && (
          <div
            className={`p-4 rounded-lg border flex items-start gap-3 ${tiltColors[stats.tiltRisk]}`}
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold">Tilt Risk: {stats.tiltRisk}</div>
              <p className="text-xs mt-0.5 opacity-90">{stats.tiltMessage}</p>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Current Streak"
            value={
              stats.currentStreak.count > 0
                ? `${stats.currentStreak.count}× ${stats.currentStreak.type}`
                : "—"
            }
            icon={Flame}
            accent={
              stats.currentStreak.type === "WIN"
                ? "bull"
                : stats.currentStreak.type === "LOSS"
                  ? "bear"
                  : "neutral"
            }
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            icon={Target}
            accent={stats.winRate >= 50 ? "bull" : "bear"}
          />
          <StatCard
            label="Total R"
            value={`${stats.totalR >= 0 ? "+" : ""}${stats.totalR.toFixed(2)}R`}
            icon={TrendingUp}
            accent={stats.totalR >= 0 ? "bull" : "bear"}
          />
          <StatCard
            label="Avg R:R"
            value={`${stats.avgRR.toFixed(2)}:1`}
            icon={BarChart}
            accent="neutral"
          />
          <StatCard
            label="Best Win Streak"
            value={`${stats.maxWinStreak}`}
            icon={Trophy}
            accent="bull"
          />
          <StatCard
            label="Worst Loss Streak"
            value={`${stats.maxLossStreak}`}
            icon={AlertTriangle}
            accent="bear"
          />
          <StatCard
            label="Wins / Losses"
            value={`${stats.wins} / ${stats.losses}`}
            icon={Zap}
            accent="neutral"
          />
          <StatCard
            label="Break-evens"
            value={`${stats.bes}`}
            icon={MinusCircle}
            accent="neutral"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Log Trade */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Log Trade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Pair
                  </label>
                  <select
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {PAIRS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    R:R (if win)
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={rr}
                    onChange={(e) => setRr(parseFloat(e.target.value) || 1)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Note (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fib retracement entry, news spike..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button
                  className="bg-bull hover:bg-bull/80 text-white"
                  onClick={() => addTrade("WIN")}
                >
                  <CircleCheck className="w-4 h-4 mr-1" /> WIN
                </Button>
                <Button
                  className="bg-bear hover:bg-bear/80 text-white"
                  onClick={() => addTrade("LOSS")}
                >
                  <XCircle className="w-4 h-4 mr-1" /> LOSS
                </Button>
                <Button variant="outline" onClick={() => addTrade("BE")}>
                  <MinusCircle className="w-4 h-4 mr-1" /> B/E
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Streak Visualizer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart className="w-4 h-4 text-primary" /> Streak Visualizer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                  <Brain className="w-8 h-8 mb-2 opacity-30" />
                  Log your first trade to see the streak visualizer.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Dot strip — most recent 20 trades */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      Last {recentTrades.length} Trades (newest → left)
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {recentTrades.map((t) => (
                        <div
                          key={t.id}
                          title={`${t.result} — ${t.pair} — ${t.result === "WIN" ? `+${t.rr}R` : t.result === "LOSS" ? "-1R" : "0R"}${t.note ? ` — ${t.note}` : ""}`}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                            t.result === "WIN"
                              ? "bg-bull/20 border-bull/40 text-bull"
                              : t.result === "LOSS"
                                ? "bg-bear/20 border-bear/40 text-bear"
                                : "bg-muted border-border text-muted-foreground"
                          }`}
                        >
                          {t.result === "WIN" ? "W" : t.result === "LOSS" ? "L" : "B"}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Streak history bars */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      Streak History
                    </div>
                    <div className="flex gap-1 items-end h-12">
                      {stats.streakHistory.slice(-20).map((s, i) => (
                        <div
                          key={i}
                          title={`${s.type} streak of ${s.count}`}
                          className={`flex-1 rounded-t min-h-[4px] ${
                            s.type === "WIN"
                              ? "bg-bull/60"
                              : s.type === "LOSS"
                                ? "bg-bear/60"
                                : "bg-muted"
                          }`}
                          style={{
                            height: `${Math.min(100, (s.count / Math.max(...stats.streakHistory.map((x) => x.count), 1)) * 100)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Psychology Insights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> Psychology Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InsightCard
                title="Tilt Risk"
                level={stats.tiltRisk}
                message={stats.tiltMessage}
                colors={tiltColors}
              />
              <InsightCard
                title="Overconfidence Risk"
                level={
                  stats.currentStreak.type === "WIN" && stats.currentStreak.count >= 4
                    ? "HIGH"
                    : stats.currentStreak.type === "WIN" && stats.currentStreak.count >= 2
                      ? "MEDIUM"
                      : "LOW"
                }
                message={
                  stats.currentStreak.type === "WIN" && stats.currentStreak.count >= 4
                    ? "Long win streak — beware of overconfidence and oversizing. Stick to your plan."
                    : stats.currentStreak.type === "WIN" && stats.currentStreak.count >= 2
                      ? "Win streak building. Stay disciplined and don't increase risk."
                      : "No overconfidence signals detected. Keep trading your plan."
                }
                colors={tiltColors}
              />
              <InsightCard
                title="Expectancy Health"
                level={
                  stats.totalR > 0 && stats.winRate >= 40
                    ? "LOW"
                    : stats.totalR < -3
                      ? "HIGH"
                      : "MEDIUM"
                }
                message={
                  stats.totalR > 0 && stats.winRate >= 40
                    ? `Positive expectancy: +${stats.totalR.toFixed(2)}R with ${stats.winRate.toFixed(0)}% win rate. Keep it up.`
                    : stats.totalR < -3
                      ? `Negative expectancy: ${stats.totalR.toFixed(2)}R. Review your strategy and entry criteria.`
                      : `Expectancy is borderline. Aim for consistent R:R above 1.5 and win rate above 45%.`
                }
                colors={tiltColors}
              />
            </div>
          </CardContent>
        </Card>

        {/* Recent Trade Log */}
        {recentTrades.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Recent Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2 pr-4">Time</th>
                      <th className="text-left py-2 pr-4">Pair</th>
                      <th className="text-left py-2 pr-4">Result</th>
                      <th className="text-left py-2 pr-4">R</th>
                      <th className="text-left py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-white/2">
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                          {new Date(t.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 pr-4 font-medium">{t.pair}</td>
                        <td className="py-2 pr-4">
                          <Badge
                            className={
                              t.result === "WIN"
                                ? "bg-bull/20 text-bull border-bull/30"
                                : t.result === "LOSS"
                                  ? "bg-bear/20 text-bear border-bear/30"
                                  : "bg-muted text-muted-foreground"
                            }
                            variant="outline"
                          >
                            {t.result}
                          </Badge>
                        </td>
                        <td
                          className={`py-2 pr-4 font-mono font-semibold ${
                            t.result === "WIN"
                              ? "text-bull"
                              : t.result === "LOSS"
                                ? "text-bear"
                                : "text-muted-foreground"
                          }`}
                        >
                          {t.result === "WIN"
                            ? `+${t.rr.toFixed(1)}R`
                            : t.result === "LOSS"
                              ? "-1R"
                              : "0R"}
                        </td>
                        <td className="py-2 text-muted-foreground text-xs truncate max-w-[200px]">
                          {t.note || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: any;
  accent: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div
        className={`text-lg font-bold font-mono ${
          accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function InsightCard({
  title,
  level,
  message,
  colors,
}: {
  title: string;
  level: string;
  message: string;
  colors: Record<string, string>;
}) {
  return (
    <div className={`p-3 rounded-lg border ${colors[level] || colors.LOW}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1">{title}</div>
      <Badge variant="outline" className={`text-[9px] mb-2 ${colors[level]}`}>
        {level}
      </Badge>
      <p className="text-[11px] leading-relaxed opacity-90">{message}</p>
    </div>
  );
}
