import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo, useState } from "react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  Filter,
  Flame,
  RefreshCw,
  Star,
  Target,
} from "lucide-react";
import { ALL_ASSETS, type TF, type AssetClass } from "@/lib/engine/deriv";
import { useDerivFeed } from "@/hooks/use-deriv-feed";
import { useLiveScan } from "@/hooks/use-live-scan";

export const Route = createFileRoute("/screener")({
  head: () => ({ meta: [{ title: "Advanced Screener — DivergenceIQ" }] }),
  component: ScreenerPage,
});

type Preset =
  | "all"
  | "top-gainers"
  | "top-losers"
  | "most-volatile"
  | "elite-setups"
  | "buy-bias"
  | "sell-bias";

const PRESETS: Array<{ id: Preset; label: string; icon: any; desc: string }> = [
  { id: "all", label: "All", icon: Search, desc: "Every symbol" },
  { id: "top-gainers", label: "Top Gainers", icon: TrendingUp, desc: "Largest +% over window" },
  { id: "top-losers", label: "Top Losers", icon: TrendingDown, desc: "Largest –% over window" },
  { id: "most-volatile", label: "Most Volatile", icon: Flame, desc: "Highest realised vol" },
  { id: "elite-setups", label: "Elite Setups", icon: Star, desc: "ELITE rating from analyze()" },
  { id: "buy-bias", label: "Buy Bias", icon: TrendingUp, desc: "score ≥ 65 + BUY direction" },
  { id: "sell-bias", label: "Sell Bias", icon: TrendingDown, desc: "score ≥ 65 + SELL direction" },
];

function ScreenerPage() {
  const [preset, setPreset] = useState<Preset>("all");
  const [tf, setTf] = useState<TF>("M15");
  const [classFilter, setClassFilter] = useState<AssetClass | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const universe = useMemo(() => {
    const all = ALL_ASSETS.filter((a) => classFilter === "ALL" || a.class === classFilter);
    return all.slice(0, 28).map((a) => ({ symbol: a.symbol, display: a.display, class: a.class }));
  }, [classFilter]);

  // Live tick feed gives us rolling momentum + realised vol per symbol
  const { ticks, ready: feedReady } = useDerivFeed(universe.map((u) => u.symbol));
  // Live confluence scan layered on top
  const {
    rows: scanRows,
    scanning,
    lastFullScanAt,
    errors,
  } = useLiveScan(
    universe.map((u) => ({ symbol: u.symbol, display: u.display })),
    tf,
    45_000,
  );

  // Merge feed + scan + class into one row per symbol
  const rows = useMemo(() => {
    return universe.map((u) => {
      const t = ticks[u.symbol];
      const scan = scanRows.find((r) => r.symbol === u.symbol);

      // momentum & vol from tick window
      let pctChange = 0;
      let realisedVol = 0;
      if (t && t.window.length >= 2) {
        const start = t.window[0];
        const last = t.window[t.window.length - 1];
        if (start > 0) pctChange = ((last - start) / start) * 100;
        const v = t.volWindow.slice(-30);
        if (v.length > 0) {
          const m = v.reduce((a, b) => a + b, 0) / v.length;
          realisedVol = m;
        }
      }
      return {
        symbol: u.symbol,
        display: u.display,
        cls: u.class,
        pctChange,
        realisedVol,
        ticks: t?.window.length ?? 0,
        last: t?.last ?? 0,
        scanRating: scan?.rating,
        scanScore: scan?.scorePct ?? 0,
        scanDir: scan?.direction ?? null,
      };
    });
  }, [universe, ticks, scanRows]);

  // Preset → ordering/filter
  const filtered = useMemo(() => {
    let r = rows;
    if (query) {
      const q = query.toLowerCase();
      r = r.filter(
        (x) => x.display.toLowerCase().includes(q) || x.symbol.toLowerCase().includes(q),
      );
    }
    switch (preset) {
      case "top-gainers":
        r = [...r].sort((a, b) => b.pctChange - a.pctChange);
        break;
      case "top-losers":
        r = [...r].sort((a, b) => a.pctChange - b.pctChange);
        break;
      case "most-volatile":
        r = [...r].sort((a, b) => b.realisedVol - a.realisedVol);
        break;
      case "elite-setups":
        r = r.filter((x) => x.scanRating === "ELITE").sort((a, b) => b.scanScore - a.scanScore);
        break;
      case "buy-bias":
        r = r
          .filter((x) => x.scanDir === "BUY" && x.scanScore >= 65)
          .sort((a, b) => b.scanScore - a.scanScore);
        break;
      case "sell-bias":
        r = r
          .filter((x) => x.scanDir === "SELL" && x.scanScore >= 65)
          .sort((a, b) => b.scanScore - a.scanScore);
        break;
      default:
        r = [...r].sort((a, b) => b.scanScore - a.scanScore);
    }
    return r;
  }, [rows, preset, query]);

  const ago = lastFullScanAt ? Math.max(0, Math.round((Date.now() - lastFullScanAt) / 1000)) : null;
  const liveCount = Object.values(ticks).filter((t) => t.window.length > 1).length;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Search className="w-6 h-6 text-primary" /> Advanced Screener
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live tick + confluence screen over {universe.length} symbols · {liveCount} streaming
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
            {scanning ? (
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : (
              <Activity
                className={`w-3.5 h-3.5 text-primary ${feedReady ? "animate-pulse" : "opacity-30"}`}
              />
            )}
            <span className="text-xs font-mono text-primary">
              {scanning
                ? "SCANNING"
                : ago !== null
                  ? `LIVE · ${ago}s ago`
                  : feedReady
                    ? "LIVE"
                    : "CONNECTING…"}
              {errors > 0 && ` · ${errors} err`}
            </span>
          </div>
        </div>

        {/* Preset grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`glass-card p-3 rounded-lg text-left diq-press transition ${
                  active ? "diq-glow-pulse ring-1 ring-primary/50" : ""
                }`}
              >
                <Icon
                  className={`w-4 h-4 mb-1.5 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
                <div
                  className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}
                >
                  {p.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {p.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="glass-card p-3 grid grid-cols-1 md:grid-cols-[1fr_220px_220px] gap-3 rounded-lg">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Asset class
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as any)}
              className="w-full mt-1 h-9 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="ALL">All</option>
              <option value="forex">Forex</option>
              <option value="metals">Metals</option>
              <option value="crypto">Crypto</option>
              <option value="indices">Indices</option>
              <option value="synthetics">Synthetics</option>
              <option value="stocks">Stocks</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Scan timeframe
            </label>
            <div className="flex gap-1 mt-1">
              {(["M5", "M15", "M30", "H1", "H4"] as TF[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`flex-1 px-2 py-1 rounded text-[11px] font-mono diq-press ${
                    tf === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Symbol</div>
            <div className="col-span-1 text-center">Class</div>
            <div className="col-span-2 text-right">% change</div>
            <div className="col-span-2 text-right">Vol</div>
            <div className="col-span-2 text-right">Score</div>
            <div className="col-span-2 text-right">Bias</div>
          </div>
          <div className="divide-y divide-border max-h-[60dvh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                {!feedReady
                  ? "Warming up tick streams…"
                  : "Nothing matches the current preset/filters."}
              </div>
            )}
            {filtered.map((r) => (
              <div
                key={r.symbol}
                className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-accent/30 transition diq-press text-xs"
              >
                <div className="col-span-3 font-medium text-sm">{r.display}</div>
                <div className="col-span-1 text-center font-mono text-[10px] text-muted-foreground uppercase">
                  {r.cls}
                </div>
                <div
                  className={`col-span-2 text-right font-mono ${r.pctChange >= 0 ? "text-bull" : "text-bear"}`}
                >
                  {r.pctChange >= 0 ? "+" : ""}
                  {r.pctChange.toFixed(3)}%
                </div>
                <div className="col-span-2 text-right font-mono text-muted-foreground">
                  {r.realisedVol > 0 ? r.realisedVol.toFixed(4) : "—"}
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className={`font-mono ${
                      r.scanRating === "ELITE"
                        ? "text-emerald-300"
                        : r.scanRating === "STRONG"
                          ? "text-bull"
                          : r.scanRating === "MEDIUM"
                            ? "text-amber-300"
                            : "text-muted-foreground"
                    }`}
                  >
                    {r.scanScore > 0 ? `${r.scanScore.toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  {r.scanDir === "BUY" ? (
                    <span className="text-bull flex items-center justify-end gap-1">
                      <TrendingUp className="w-3 h-3" />
                      BUY
                    </span>
                  ) : r.scanDir === "SELL" ? (
                    <span className="text-bear flex items-center justify-end gap-1">
                      <TrendingDown className="w-3 h-3" />
                      SELL
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Filter className="w-3 h-3" /> Ticks from public Deriv WS · Confluence from
          src/lib/engine/signal.ts · {filtered.length} matching · refreshing 45s
        </p>
      </div>
    </AppShell>
  );
}
