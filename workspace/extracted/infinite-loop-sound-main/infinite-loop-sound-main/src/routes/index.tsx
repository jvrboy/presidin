import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Zap,
  Trophy,
  TrendingUp,
  ArrowRight,
  Target,
  BarChart,
  Clock,
  Volume,
  VolumeX,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  CircleDot,
  Calendar,
  Globe,
  Layers,
  Shield,
  AlertTriangle,
  Bell,
  Filter,
  RefreshCw,
  ChevronRight,
  DollarSign,
  Percent,
  Award,
  Timer,
  Sparkles,
} from "lucide-react";
import { displayPair, ALL_ASSETS, deriv } from "@/lib/engine/deriv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DivergenceIQ — Professional Trading Dashboard" },
      {
        name: "description",
        content:
          "AI-powered forex divergence scanner with multi-indicator confluence, live Deriv data, and professional signal analytics.",
      },
      { property: "og:title", content: "DivergenceIQ — Professional Trading Dashboard" },
      {
        property: "og:description",
        content:
          "Live divergence scanning, multi-timeframe confluence, and real-time signal analytics for forex, indices and crypto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

interface Sig {
  id: string;
  pair: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  score: number;
  rating: string;
  created_at: string;
  status?: string;
  result?: string | null;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp3?: number;
}

interface LiveTick {
  pair: string;
  price: number;
  change: number;
  changePct: number;
}

function useLiveTicks() {
  const [ticks, setTicks] = useState<Record<string, LiveTick>>({});
  const subsRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    let mounted = true;
    const assets = ALL_ASSETS.slice(0, 12); // top 12 pairs
    deriv
      .connect()
      .then(() => {
        assets.forEach((a) => {
          const unsub = deriv.subscribeTicks(a.symbol, (t) => {
            if (!mounted) return;
            setTicks((prev) => {
              const prevPrice = prev[a.symbol]?.price || t.quote;
              const change = t.quote - prevPrice;
              return {
                ...prev,
                [a.symbol]: {
                  pair: a.symbol,
                  price: t.quote,
                  change,
                  changePct: (change / prevPrice) * 100,
                },
              };
            });
          });
          subsRef.current.push(unsub);
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
      subsRef.current.forEach((u) => u());
      subsRef.current = [];
    };
  }, []);
  return ticks;
}

function Dashboard() {
  const [signals, setSignals] = useState<Sig[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [refreshing, setRefreshing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveTicks = useLiveTicks();

  const timeRangeMs = useMemo(() => {
    switch (selectedTimeRange) {
      case "1h":
        return 60 * 60 * 1000;
      case "24h":
        return 24 * 60 * 60 * 1000;
      case "7d":
        return 7 * 24 * 60 * 60 * 1000;
      case "30d":
        return 30 * 24 * 60 * 60 * 1000;
    }
  }, [selectedTimeRange]);

  useEffect(() => {
    audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    loadSignals();
    const ch = supabase
      .channel("signals-dash")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "signals" }, (p) => {
        const newSig = p.new as Sig;
        setSignals((prev) => [newSig, ...prev].slice(0, 500));
        if (audioRef.current && (newSig.score >= 80 || newSig.rating === "ELITE")) {
          audioRef.current.play().catch(() => {});
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "signals" }, (p) =>
        setSignals((prev) =>
          prev.map((s) => (s.id === (p.new as any).id ? { ...s, ...(p.new as any) } : s)),
        ),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const loadSignals = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setSignals((data as Sig[]) ?? []);
    setRefreshing(false);
  };

  const filteredSignals = useMemo(() => {
    const cutoff = Date.now() - timeRangeMs;
    return signals.filter((s) => new Date(s.created_at).getTime() > cutoff);
  }, [signals, timeRangeMs]);

  const today = filteredSignals;
  const elite = today.filter((s) => s.score >= 80);
  const buys = today.filter((s) => s.direction === "BUY").length;
  const sells = today.length - buys;

  const analytics = useMemo(() => {
    const closed = signals.filter((s) => {
      const r = (s.result || "").toUpperCase();
      return r.startsWith("TP") || r === "WIN" || r === "SL" || r === "LOSS";
    });
    const wins = closed.filter((s) => {
      const r = (s.result || "").toUpperCase();
      return r.startsWith("TP") || r === "WIN";
    }).length;
    const losses = closed.length - wins;
    const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;

    const pairStats = new Map<string, { wins: number; total: number; pnl: number }>();
    closed.forEach((s) => {
      const stat = pairStats.get(s.pair) || { wins: 0, total: 0, pnl: 0 };
      stat.total++;
      const r = (s.result || "").toUpperCase();
      if (r.startsWith("TP") || r === "WIN") {
        stat.wins++;
        stat.pnl += 1;
      } else {
        stat.pnl -= 1;
      }
      pairStats.set(s.pair, stat);
    });

    let bestPair = "-";
    let bestRate = 0;
    pairStats.forEach((stat, pair) => {
      if (stat.total >= 3) {
        const rate = stat.wins / stat.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestPair = pair;
        }
      }
    });

    const hours = Array(24).fill(0);
    today.forEach((s) => {
      const h = (new Date(s.created_at).getUTCHours() + 2) % 24;
      hours[h]++;
    });
    const peakHour = hours.indexOf(Math.max(...hours));

    const totalPnl = closed.reduce((sum, s) => {
      const r = (s.result || "").toUpperCase();
      return sum + (r.startsWith("TP") || r === "WIN" ? 1 : -1);
    }, 0);

    const avgR = closed.length ? (totalPnl / closed.length).toFixed(2) : "0.00";

    return {
      winRate,
      wins,
      losses,
      closed: closed.length,
      bestPair,
      bestRate: Math.round(bestRate * 100),
      peakHour,
      totalPnl,
      avgR,
    };
  }, [signals, today]);

  const valid = signals.filter((s) => {
    const r = (s.result || "").toUpperCase();
    if (r.startsWith("TP") || r === "SL" || r === "WIN" || r === "LOSS") return false;
    if (s.status && !["active", "open", "pending"].includes(s.status.toLowerCase())) return false;
    return true;
  });

  const recentClosed = signals
    .filter((s) => {
      const r = (s.result || "").toUpperCase();
      return r.startsWith("TP") || r === "WIN" || r === "SL" || r === "LOSS";
    })
    .slice(0, 10);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Professional divergence analytics and signal intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-card border border-border rounded-lg p-1">
              {(["1h", "24h", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedTimeRange(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition ${selectedTimeRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {r === "1h" ? "1H" : r === "24h" ? "24H" : r === "7d" ? "7D" : "30D"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2.5 rounded-md border border-border transition ${audioEnabled ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground hover:bg-accent"}`}
              title="Toggle Elite Signal Audio Alerts"
            >
              {audioEnabled ? <Volume className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <Button size="sm" variant="outline" onClick={loadSignals} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />{" "}
              Refresh
            </Button>
            <Link to="/scanner">
              <Button size="sm" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Run Scan <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Live Ticker Bar */}
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
            <Globe className="w-3.5 h-3.5 text-bull mr-1" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Live Market
            </span>
          </div>
          <div className="flex overflow-x-auto gap-0 scrollbar-hide">
            {Object.entries(liveTicks)
              .slice(0, 8)
              .map(([sym, tick]) => (
                <div
                  key={sym}
                  className="flex-shrink-0 px-4 py-3 border-r border-border last:border-0 min-w-[140px]"
                >
                  <div className="text-[10px] uppercase text-muted-foreground font-mono">
                    {displayPair(sym)}
                  </div>
                  <div className="text-lg font-mono font-bold tabular-nums">
                    {tick.price.toFixed(tick.price > 1000 ? 2 : tick.price > 10 ? 4 : 5)}
                  </div>
                  <div
                    className={`text-xs font-mono flex items-center gap-1 ${tick.change >= 0 ? "text-bull" : "text-bear"}`}
                  >
                    {tick.change >= 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {tick.changePct.toFixed(3)}%
                  </div>
                </div>
              ))}
            {Object.keys(liveTicks).length === 0 && (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                Connecting to market feed...
              </div>
            )}
          </div>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Zap}
            label={`Signals (${selectedTimeRange})`}
            value={today.length}
            sub={`${buys} BUY / ${sells} SELL`}
            accent="bull"
          />
          <StatCard
            icon={Trophy}
            label="Elite Signals"
            value={elite.length}
            sub="Score >= 80"
            accent="elite"
          />
          <StatCard
            icon={Target}
            label="Win Rate"
            value={`${analytics.winRate}%`}
            sub={`${analytics.wins}W / ${analytics.losses}L`}
            accent={analytics.winRate >= 60 ? "bull" : undefined}
          />
          <StatCard
            icon={Percent}
            label="Avg R:R"
            value={analytics.avgR}
            sub={`Total R: ${analytics.totalPnl > 0 ? "+" : ""}${analytics.totalPnl}`}
            accent={analytics.totalPnl >= 0 ? "bull" : "bear"}
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniStat
            label="Active Now"
            value={valid.length}
            icon={CircleDot}
            color="text-cyan-400"
          />
          <MiniStat
            label="Best Pair (7d)"
            value={analytics.bestPair !== "-" ? displayPair(analytics.bestPair) : "-"}
            icon={Award}
            color="text-amber-400"
          />
          <MiniStat
            label="Peak Hour (SAST)"
            value={`${analytics.peakHour.toString().padStart(2, "0")}:00`}
            icon={Clock}
            color="text-violet-400"
          />
          <MiniStat
            label="Total Tracked"
            value={signals.length}
            icon={Layers}
            color="text-foreground"
          />
          <MiniStat
            label="Closed Trades"
            value={analytics.closed}
            icon={Shield}
            color="text-emerald-400"
          />
          <MiniStat
            label="Best Rate"
            value={analytics.bestPair !== "-" ? `${analytics.bestRate}%` : "-"}
            icon={TrendingUp}
            color="text-bull"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Top Opportunities */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Top Opportunities
                </CardTitle>
                <Link
                  to="/signals"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {valid.slice(0, 8).map((s) => (
                <Link
                  key={s.id}
                  to="/signals"
                  className="flex items-center justify-between px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 transition rounded-sm"
                >
                  <div className="flex items-center gap-3 font-mono text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.rating === "ELITE" ? "bg-elite/20 text-elite border border-elite/30" : s.rating === "STRONG" ? "bg-bull/20 text-bull border border-bull/30" : "bg-muted text-muted-foreground"}`}
                    >
                      {s.rating}
                    </span>
                    <span className="font-semibold">{displayPair(s.pair)}</span>
                    <span className="text-muted-foreground text-xs">{s.timeframe}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span
                      className={
                        s.direction === "BUY" ? "text-bull font-bold" : "text-bear font-bold"
                      }
                    >
                      {s.direction}
                    </span>
                    <span className="text-muted-foreground">{s.score}/100</span>
                    {s.entry && (
                      <span className="text-muted-foreground hidden sm:inline">
                        @{s.entry.toFixed(5)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {valid.length === 0 && (
                <div className="px-3 py-12 text-center text-muted-foreground text-sm">
                  No active signals.{" "}
                  <Link to="/scanner" className="text-primary underline">
                    Run a scan
                  </Link>{" "}
                  to generate opportunities.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {recentClosed.map((s, i) => {
                const isWin =
                  (s.result || "").toUpperCase().startsWith("TP") ||
                  (s.result || "").toUpperCase() === "WIN";
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2 rounded bg-muted/30 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {isWin ? (
                        <TrendingUp className="w-3.5 h-3.5 text-bull" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-bear" />
                      )}
                      <span className="font-mono font-semibold">{displayPair(s.pair)}</span>
                      <span className="text-[10px] text-muted-foreground">{s.timeframe}</span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold ${isWin ? "text-bull" : "text-bear"}`}
                    >
                      {s.result}
                    </span>
                  </div>
                );
              })}
              {recentClosed.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No closed trades yet. Signals will update automatically.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Market Sessions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Market Sessions (SAST)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SessionCard
                name="Sydney"
                open="23:00"
                close="07:00"
                status={getSessionStatus(23, 7)}
              />
              <SessionCard
                name="Tokyo"
                open="01:00"
                close="09:00"
                status={getSessionStatus(1, 9)}
              />
              <SessionCard
                name="London"
                open="09:00"
                close="17:00"
                status={getSessionStatus(9, 17)}
              />
              <SessionCard
                name="New York"
                open="14:00"
                close="22:00"
                status={getSessionStatus(14, 22)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function getSessionStatus(startHour: number, endHour: number): "open" | "closed" {
  const now = new Date();
  const sastHour = (now.getUTCHours() + 2) % 24;
  if (startHour > endHour) {
    return sastHour >= startHour || sastHour < endHour ? "open" : "closed";
  }
  return sastHour >= startHour && sastHour < endHour ? "open" : "closed";
}

function SessionCard({
  name,
  open,
  close,
  status,
}: {
  name: string;
  open: string;
  close: string;
  status: "open" | "closed";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${status === "open" ? "border-bull/40 bg-bull/5" : "border-border bg-card/60"}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">{name}</span>
        <span
          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${status === "open" ? "bg-bull/20 text-bull" : "bg-muted text-muted-foreground"}`}
        >
          {status}
        </span>
      </div>
      <div className="text-xs text-muted-foreground font-mono">
        {open} - {close} SAST
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: number | string;
  sub?: string;
  accent?: "bull" | "elite" | "bear";
}) {
  const c =
    accent === "bull"
      ? "text-bull"
      : accent === "elite"
        ? "text-elite"
        : accent === "bear"
          ? "text-bear"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={`w-4 h-4 ${c}`} />
        </div>
        <div className={`text-2xl md:text-3xl font-bold font-mono ${c}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1 font-mono">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
