import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignalCard, type SignalCardData } from "@/components/app/SignalCard";
import { useServerFn } from "@tanstack/react-start";
import { sendSignalToTelegram } from "@/lib/telegram.functions";
import { toast } from "sonner";
import {
  Zap,
  Filter,
  Send,
  Info,
  Image,
  ImageOff,
  Download,
  BarChart,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  Search,
  ArrowUpDown,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_ASSETS,
  ASSETS_BY_CLASS,
  TIMEFRAMES,
  displayPair,
  type AssetClass,
  type TF,
} from "@/lib/engine/deriv";
import { deriv } from "@/lib/engine/deriv";
import { SignalDrawer } from "@/components/app/SignalDrawer";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signal Management — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional signal management with advanced filtering, live price tracking, and batch operations.",
      },
    ],
  }),
  component: SignalsPage,
});

const ALL_INDICATORS = [
  "RSI Divergence",
  "MACD Divergence",
  "Stochastic Divergence",
  "RVI Divergence",
  "OBV Divergence",
  "EMA 50/200 Aligned",
  "Supertrend Aligned",
  "Ichimoku T/K Aligned",
  "ADX Trending (>22)",
  "Candle Pattern Confirm",
  "BB Squeeze Breakout",
];
const RATINGS = ["ELITE", "STRONG", "MEDIUM", "WEAK"] as const;
const STATUS_OPTIONS = ["active", "pending", "closed", "expired"] as const;

type Row = SignalCardData & {
  id: string;
  created_at: string;
  status?: string;
  result?: string | null;
  closed_at?: string | null;
};

type SortField = "score" | "created_at" | "pair" | "direction";
type SortDir = "asc" | "desc";

function SignalsPage() {
  const [signals, setSignals] = useState<Row[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const sendTg = useServerFn(sendSignalToTelegram);
  const { settings, update } = useSettings();

  // Filters
  const [pairs, setPairs] = useState<Set<string>>(new Set());
  const [tfs, setTfs] = useState<Set<TF>>(new Set());
  const [dirs, setDirs] = useState<Set<"BUY" | "SELL">>(new Set());
  const [ratings, setRatings] = useState<Set<(typeof RATINGS)[number]>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set(new Set(["active", "pending"])));
  const [reqInd, setReqInd] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [drawerSig, setDrawerSig] = useState<Row | null>(null);
  const [assetClass, setAssetClass] = useState<AssetClass | "all">("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  useEffect(() => {
    setLoading(true);
    supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setSignals((data as any[]) ?? []);
        setLoading(false);
      });
    const ch = supabase
      .channel("signals-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "signals" }, (p) =>
        setSignals((prev) => [p.new as any, ...prev]),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "signals" }, (p) =>
        setSignals((prev) =>
          prev.map((x) => (x.id === (p.new as any).id ? { ...x, ...(p.new as any) } : x)),
        ),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    const s = signals.filter((s) => {
      if (pairs.size && !pairs.has(s.pair)) return false;
      if (tfs.size && !tfs.has(s.timeframe as TF)) return false;
      if (dirs.size && !dirs.has(s.direction)) return false;
      if (ratings.size && !ratings.has(s.rating as any)) return false;
      if (statuses.size && (!s.status || !statuses.has(s.status))) {
        // Default: if no status, treat as active/pending
        if (!s.status && !statuses.has("active") && !statuses.has("pending")) return false;
      }
      if (s.score < minScore) return false;
      if (reqInd.size) {
        const passed = new Set((s.confluence as any[]).filter((c) => c.passed).map((c) => c.label));
        for (const ind of reqInd) if (!passed.has(ind)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !displayPair(s.pair).toLowerCase().includes(q) &&
          !s.direction.toLowerCase().includes(q) &&
          !s.rating.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    s.sort((a, b) => {
      let cmp = 0;
      if (sortField === "score") cmp = a.score - b.score;
      else if (sortField === "created_at")
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortField === "pair") cmp = a.pair.localeCompare(b.pair);
      else if (sortField === "direction") cmp = a.direction.localeCompare(b.direction);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return s;
  }, [
    signals,
    pairs,
    tfs,
    dirs,
    ratings,
    statuses,
    reqInd,
    minScore,
    searchQuery,
    sortField,
    sortDir,
  ]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filtered.length, searchQuery]);

  useEffect(() => {
    const uniq = Array.from(new Set(filtered.slice(0, 30).map((s) => s.pair)));
    if (!uniq.length) return;
    let unsubs: Array<() => void> = [];
    deriv
      .connect()
      .then(() => {
        unsubs = uniq.map((sym) =>
          deriv.subscribeTicks(sym, (t) => setLivePrices((p) => ({ ...p, [sym]: t.quote }))),
        );
      })
      .catch(() => {});
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    filtered
      .slice(0, 30)
      .map((s) => s.pair)
      .join(","),
  ]);

  const toggleSet = <T,>(s: Set<T>, v: T, set: (n: Set<T>) => void) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    set(n);
  };

  const send = async (s: Row) => {
    try {
      const r = await sendTg({
        data: {
          signalId: s.id,
          withChart: settings.telegramChartSnapshots,
          signal: {
            pair: s.pair,
            timeframe: s.timeframe,
            direction: s.direction,
            entry: +s.entry,
            sl: +s.sl,
            tp1: +s.tp1,
            tp2: +s.tp2,
            tp3: +s.tp3,
            score: s.score,
            rating: s.rating,
            confluence: s.confluence as any,
          },
        },
      });
      toast.success(`Sent to ${r.sent}/${r.total} subscribers`);
      setSignals((prev) => prev.map((x) => (x.id === s.id ? { ...x, sent_telegram: true } : x)));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const broadcastAll = async () => {
    let sent = 0;
    for (const s of filtered.slice(0, 20)) {
      try {
        await send(s);
        sent++;
      } catch {}
    }
    toast.success(`Broadcast attempted on ${sent} signals`);
  };

  const clearAll = () => {
    setPairs(new Set());
    setTfs(new Set());
    setDirs(new Set());
    setRatings(new Set());
    setStatuses(new Set(["active", "pending"]));
    setReqInd(new Set());
    setMinScore(0);
    setSearchQuery("");
  };

  const activeCount =
    pairs.size +
    tfs.size +
    dirs.size +
    ratings.size +
    statuses.size +
    reqInd.size +
    (minScore > 0 ? 1 : 0) +
    (searchQuery ? 1 : 0);

  const exportCSV = () => {
    const headers = [
      "ID",
      "Pair",
      "Timeframe",
      "Direction",
      "Score",
      "Rating",
      "Status",
      "Result",
      "Entry",
      "SL",
      "TP1",
      "TP2",
      "TP3",
      "Created",
      "Closed",
    ];
    const rows = filtered.map((s) => [
      s.id,
      s.pair,
      s.timeframe,
      s.direction,
      s.score,
      s.rating,
      s.status || "-",
      s.result || "-",
      s.entry,
      s.sl,
      s.tp1,
      s.tp2,
      s.tp3,
      new Date(s.created_at).toISOString(),
      s.closed_at || "-",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} signals`);
  };

  const stats = useMemo(() => {
    const active = signals.filter((s) => !s.result || s.result === "").length;
    const won = signals.filter(
      (s) =>
        (s.result || "").toUpperCase().startsWith("TP") || (s.result || "").toUpperCase() === "WIN",
    ).length;
    const lost = signals.filter(
      (s) => (s.result || "").toUpperCase() === "SL" || (s.result || "").toUpperCase() === "LOSS",
    ).length;
    const total = won + lost;
    return { active, won, lost, total, winRate: total ? Math.round((won / total) * 100) : 0 };
  }, [signals]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="w-7 h-7 text-elite" /> Signal Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} of {signals.length} signals matching filters
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update({ telegramChartSnapshots: !settings.telegramChartSnapshots })}
            >
              {settings.telegramChartSnapshots ? (
                <Image className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <ImageOff className="w-3.5 h-3.5 mr-1.5" />
              )}
              Charts {settings.telegramChartSnapshots ? "ON" : "OFF"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              Filters
              {activeCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-elite/20 text-elite text-[10px]">
                  {activeCount}
                </span>
              )}
            </Button>
            <Button size="sm" onClick={broadcastAll} disabled={!filtered.length}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Broadcast
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatBadge icon={BarChart} label="Total" value={signals.length} />
          <StatBadge icon={Target} label="Active" value={stats.active} color="text-cyan-400" />
          <StatBadge icon={TrendingUp} label="Wins" value={stats.won} color="text-bull" />
          <StatBadge icon={TrendingDown} label="Losses" value={stats.lost} color="text-bear" />
          <StatBadge
            icon={Zap}
            label="Win Rate"
            value={`${stats.winRate}%`}
            color={
              stats.winRate >= 60 ? "text-bull" : stats.winRate >= 40 ? "text-medium" : "text-bear"
            }
          />
        </div>

        {/* Search & Sort Bar */}
        <Card className="border-border/60">
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pair, direction, rating..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-md bg-input border border-border text-sm"
                />
              </div>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="bg-input border border-border rounded px-2 py-1.5 text-sm font-mono"
              >
                <option value="created_at">Date</option>
                <option value="score">Score</option>
                <option value="pair">Pair</option>
                <option value="direction">Direction</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="p-1.5 rounded border border-border hover:bg-accent"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <div className="flex border border-border rounded overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 ${viewMode === "grid" ? "bg-accent" : ""}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 ${viewMode === "list" ? "bg-accent" : ""}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Filter Signals</span>
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Reset all
                </button>
              </div>
              <FilterGroup label="Asset Class">
                {(
                  ["all", "forex", "metals", "crypto", "indices", "synthetics", "stocks"] as const
                ).map((c) => (
                  <Chip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>
                    {c.toUpperCase()}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Pair">
                {(assetClass === "all" ? ALL_ASSETS : ASSETS_BY_CLASS[assetClass]).map((p) => (
                  <Chip
                    key={p.symbol}
                    active={pairs.has(p.symbol)}
                    onClick={() => toggleSet(pairs, p.symbol, setPairs)}
                  >
                    {p.display}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Timeframe">
                {TIMEFRAMES.map((t) => (
                  <Chip key={t} active={tfs.has(t)} onClick={() => toggleSet(tfs, t, setTfs)}>
                    {t}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Direction">
                {(["BUY", "SELL"] as const).map((d) => (
                  <Chip key={d} active={dirs.has(d)} onClick={() => toggleSet(dirs, d, setDirs)}>
                    {d}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Rating">
                {RATINGS.map((r) => (
                  <Chip
                    key={r}
                    active={ratings.has(r)}
                    onClick={() => toggleSet(ratings, r, setRatings)}
                  >
                    {r}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Status">
                {STATUS_OPTIONS.map((s) => (
                  <Chip
                    key={s}
                    active={statuses.has(s)}
                    onClick={() => toggleSet(statuses, s, setStatuses)}
                  >
                    {s.toUpperCase()}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label={`Min Score: ${minScore}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => setMinScore(+e.target.value)}
                  className="flex-1"
                />
              </FilterGroup>
              <FilterGroup label="Required Indicators (ALL must pass)">
                {ALL_INDICATORS.map((i) => (
                  <Chip
                    key={i}
                    active={reqInd.has(i)}
                    onClick={() => toggleSet(reqInd, i, setReqInd)}
                  >
                    {i}
                  </Chip>
                ))}
              </FilterGroup>
            </CardContent>
          </Card>
        )}

        {/* Signals Display */}
        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse h-48">
                <CardContent className="p-4 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-6 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Filter className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No signals match your filters.</p>
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((s) => (
              <div key={s.id} className="relative group">
                <SignalCard
                  signal={{
                    ...s,
                    entry: +s.entry,
                    sl: +s.sl,
                    tp1: +s.tp1,
                    tp2: +s.tp2,
                    tp3: +s.tp3,
                    confluence: s.confluence as any,
                  }}
                  onSendTelegram={() => send(s)}
                />
                {livePrices[s.pair] != null && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-background/80 border border-border text-[10px] font-mono pulse-dot">
                    {livePrices[s.pair].toFixed(
                      livePrices[s.pair] >= 1000 ? 2 : livePrices[s.pair] >= 10 ? 4 : 5,
                    )}
                  </span>
                )}
                <button
                  onClick={() => setDrawerSig(s)}
                  className="absolute top-2 right-2 p-1.5 rounded bg-accent/80 hover:bg-accent text-accent-foreground text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Info className="w-3 h-3" /> Details
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <tr>
                    <th className="px-3 py-2 text-left">Rating</th>
                    <th className="px-3 py-2 text-left">Pair</th>
                    <th className="px-3 py-2">TF</th>
                    <th className="px-3 py-2">Dir</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">SL</th>
                    <th className="px-3 py-2 text-right">TP3</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border hover:bg-accent/20 transition cursor-pointer"
                      onClick={() => setDrawerSig(s)}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.rating === "ELITE" ? "bg-elite/20 text-elite" : s.rating === "STRONG" ? "bg-bull/20 text-bull" : "bg-muted text-muted-foreground"}`}
                        >
                          {s.rating}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">{displayPair(s.pair)}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-muted-foreground">
                        {s.timeframe}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={
                            s.direction === "BUY" ? "text-bull font-bold" : "text-bear font-bold"
                          }
                        >
                          {s.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{s.score}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.entry?.toFixed(5)}</td>
                      <td className="px-3 py-2 text-right font-mono text-bear">
                        {s.sl?.toFixed(5)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-bull">
                        {s.tp3?.toFixed(5)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            !s.result &&
                            (!s.status || s.status === "active" || s.status === "pending")
                              ? "bg-bull/10 text-bull"
                              : (s.result || "").toUpperCase().startsWith("TP") ||
                                  (s.result || "").toUpperCase() === "WIN"
                                ? "bg-bull/20 text-bull"
                                : (s.result || "").toUpperCase() === "SL" ||
                                    (s.result || "").toUpperCase() === "LOSS"
                                  ? "bg-bear/20 text-bear"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.result || s.status || "ACTIVE"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            send(s);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Send
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-90" />
            </Button>
            <span className="text-sm font-mono text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
            </Button>
          </div>
        )}

        <SignalDrawer
          open={!!drawerSig}
          onOpenChange={(o) => !o && setDrawerSig(null)}
          signal={drawerSig}
        />
      </div>
    </AppShell>
  );
}

function StatBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2 flex items-center gap-2">
      <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
      <div>
        <div className={`text-lg font-bold font-mono leading-tight ${color || "text-foreground"}`}>
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${active ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
