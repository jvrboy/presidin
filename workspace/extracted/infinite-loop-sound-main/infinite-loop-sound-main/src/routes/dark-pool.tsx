import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { Eye, Users, TrendingUp, Activity } from "lucide-react";
import { useDerivFeed } from "@/hooks/use-deriv-feed";
import { detectBlocks, type Block } from "@/lib/derived/microstructure";

export const Route = createFileRoute("/dark-pool")({
  component: DarkPoolPage,
});

const WATCH: Array<{ symbol: string; display: string; venue: string }> = [
  { symbol: "frxEURUSD", display: "EUR/USD", venue: "DERIV" },
  { symbol: "frxGBPUSD", display: "GBP/USD", venue: "DERIV" },
  { symbol: "frxUSDJPY", display: "USD/JPY", venue: "DERIV" },
  { symbol: "frxAUDUSD", display: "AUD/USD", venue: "DERIV" },
  { symbol: "frxXAUUSD", display: "XAU/USD", venue: "DERIV" },
  { symbol: "frxXAGUSD", display: "XAG/USD", venue: "DERIV" },
];

const Z_THRESHOLD = 2.5;
const MAX_LOG = 25;

function DarkPoolPage() {
  const symbols = useMemo(() => WATCH.map((w) => w.symbol), []);
  const { ticks, ready } = useDerivFeed(symbols);
  const [blocks, setBlocks] = useState<Block[]>([]);

  // detect blocks whenever a tick updates
  useEffect(() => {
    for (const w of WATCH) {
      const t = ticks[w.symbol];
      if (!t) continue;
      const block = detectBlocks(t, w.display, Z_THRESHOLD);
      if (block) {
        setBlocks((prev) => {
          // dedupe by (symbol, epoch)
          if (prev.find((b) => b.symbol === block.symbol && b.time === block.time)) return prev;
          return [{ ...block }, ...prev].slice(0, MAX_LOG);
        });
      }
    }
  }, [ticks]);

  const stats = useMemo(() => {
    const buys = blocks.filter((b) => b.side === "BUY").length;
    const sells = blocks.filter((b) => b.side === "SELL").length;
    const avgZ = blocks.length > 0 ? blocks.reduce((a, b) => a + b.z, 0) / blocks.length : 0;
    return [
      { label: "Blocks Detected", value: blocks.length.toString(), sub: `Z ≥ ${Z_THRESHOLD}` },
      {
        label: "Buy Side",
        value: buys.toString(),
        sub: blocks.length ? `${Math.round((buys / blocks.length) * 100)}%` : "—",
      },
      {
        label: "Sell Side",
        value: sells.toString(),
        sub: blocks.length ? `${Math.round((sells / blocks.length) * 100)}%` : "—",
      },
      { label: "Avg Z-Score", value: avgZ.toFixed(2), sub: `${blocks.length} samples` },
    ];
  }, [blocks]);

  const venues = useMemo(() => {
    // group by display pair — venue is implicitly Deriv aggregator
    const byPair = new Map<string, { count: number; lastZ: number; side: string }>();
    for (const b of blocks) {
      const cur = byPair.get(b.display) || { count: 0, lastZ: 0, side: b.side };
      cur.count++;
      cur.lastZ = Math.max(cur.lastZ, b.z);
      cur.side = b.side;
      byPair.set(b.display, cur);
    }
    return Array.from(byPair.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([display, v]) => ({
        venue: `Deriv · ${display}`,
        volume: `Z ${v.lastZ.toFixed(2)}`,
        trades: v.count,
        bias: v.side === "BUY" ? "Bullish" : "Bearish",
      }));
  }, [blocks]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Eye className="w-6 h-6 text-pink-400" />
              Institutional Block Detection
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Statistically anomalous tick clusters (z ≥ {Z_THRESHOLD}) — public Deriv feed. Not a
              true dark-pool feed (no public FX source exists).
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/30">
            <Activity
              className={`w-3.5 h-3.5 text-pink-400 ${ready ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-pink-400">
              {ready ? "LIVE" : "CONNECTING…"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] text-muted-foreground uppercase">{stat.label}</div>
              <div className="text-xl font-bold font-mono mt-1">{stat.value}</div>
              <div className="text-[11px] text-muted-foreground">{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Pair</th>
                  <th className="text-left p-3">Side</th>
                  <th className="text-right p-3">% Move</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-left p-3">Venue</th>
                  <th className="text-right p-3">Z-Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-xs">
                {blocks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground italic">
                      {ready ? "Waiting for anomalous prints…" : "Connecting to Deriv WS…"}
                    </td>
                  </tr>
                )}
                {blocks.map((pool, i) => (
                  <tr key={`${pool.symbol}-${pool.time}-${i}`} className="hover:bg-accent/20">
                    <td className="p-3 text-muted-foreground">{pool.time}</td>
                    <td className="p-3 font-medium">{pool.display}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                          pool.side === "BUY" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        {pool.side}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-pink-400">{pool.pctMove}</td>
                    <td className="p-3 text-right">{pool.price.toFixed(5)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-muted text-[10px]">DERIV</span>
                    </td>
                    <td className="p-3 text-right">{pool.z.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {venues.map((v) => (
            <div key={v.venue} className="rounded-lg border border-border bg-card p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium text-sm">{v.venue}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{v.trades} blocks</div>
                </div>
                <TrendingUp
                  className={`w-4 h-4 ${v.bias === "Bullish" ? "text-bull" : "text-bear rotate-180"}`}
                />
              </div>
              <div className="text-xl font-bold font-mono">{v.volume}</div>
              <div className={`text-xs mt-1 ${v.bias === "Bullish" ? "text-bull" : "text-bear"}`}>
                {v.bias}
              </div>
            </div>
          ))}
          {venues.length === 0 && (
            <p className="text-xs text-muted-foreground italic col-span-3">No venues active yet.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
