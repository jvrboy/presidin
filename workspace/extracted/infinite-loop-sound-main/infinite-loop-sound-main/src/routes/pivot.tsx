import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import { Activity, GitFork, Target } from "lucide-react";
import { deriv, ALL_ASSETS } from "@/lib/engine/deriv";

export const Route = createFileRoute("/pivot")({
  head: () => ({ meta: [{ title: "Pivot Points — DivergenceIQ" }] }),
  component: PivotPage,
});

// Classic floor-trader pivot calculation from yesterday's H, L, C.
interface PivotSet {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

function classicPivots(h: number, l: number, c: number): PivotSet {
  const pp = (h + l + c) / 3;
  return {
    pp,
    r1: 2 * pp - l,
    s1: 2 * pp - h,
    r2: pp + (h - l),
    s2: pp - (h - l),
    r3: h + 2 * (pp - l),
    s3: l - 2 * (h - pp),
  };
}

interface Row {
  symbol: string;
  display: string;
  prevH: number;
  prevL: number;
  prevC: number;
  last: number;
  pivots: PivotSet;
  distancePct: number; // (last - pp) / pp
  nearest: { label: string; level: number; distPct: number };
}

const TOP_SYMBOLS = ALL_ASSETS.slice(0, 18); // keep load reasonable

function PivotPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      const out: Row[] = [];
      for (const a of TOP_SYMBOLS) {
        try {
          // Use D1 candles — pivots are conventionally daily.
          const candles = await deriv.getCandles(a.symbol, "D1", 5);
          if (candles.length < 2) continue;
          const yesterday = candles[candles.length - 2];
          const today = candles[candles.length - 1];
          const piv = classicPivots(yesterday.high, yesterday.low, yesterday.close);
          const last = today.close;

          // find nearest pivot level
          const levels: Array<[string, number]> = [
            ["S3", piv.s3],
            ["S2", piv.s2],
            ["S1", piv.s1],
            ["PP", piv.pp],
            ["R1", piv.r1],
            ["R2", piv.r2],
            ["R3", piv.r3],
          ];
          let best = { label: "PP", level: piv.pp, distPct: Math.abs(last - piv.pp) / piv.pp };
          for (const [lbl, lvl] of levels) {
            const d = Math.abs(last - lvl) / lvl;
            if (d < best.distPct) best = { label: lbl, level: lvl, distPct: d };
          }

          out.push({
            symbol: a.symbol,
            display: a.display,
            prevH: yesterday.high,
            prevL: yesterday.low,
            prevC: yesterday.close,
            last,
            pivots: piv,
            distancePct: piv.pp > 0 ? ((last - piv.pp) / piv.pp) * 100 : 0,
            nearest: { ...best, distPct: best.distPct * 100 },
          });
        } catch {
          /* skip */
        }
      }
      if (cancelled) return;
      // sort by proximity to nearest pivot
      out.sort((a, b) => a.nearest.distPct - b.nearest.distPct);
      setRows(out);
      setLastAt(Date.now());
      setLoading(false);
    };
    refresh();
    const id = setInterval(refresh, 5 * 60_000); // 5 min refresh — pivots are stable intraday
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const ago = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;

  const decimalsFor = (v: number) => (v > 100 ? 2 : 5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitFork className="w-6 h-6 text-primary" /> Pivot Points
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Classic floor-trader pivots from yesterday's D1 candle · {TOP_SYMBOLS.length} symbols
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
            <Activity
              className={`w-3.5 h-3.5 text-primary ${loading ? "animate-spin" : "animate-pulse"}`}
            />
            <span className="text-xs font-mono text-primary">
              {loading ? "COMPUTING" : ago !== null ? `LIVE · ${ago}s ago` : "READY"}
            </span>
          </div>
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Symbol</div>
            <div className="col-span-1 text-right">Last</div>
            <div className="col-span-1 text-right">PP</div>
            <div className="col-span-1 text-right">S1</div>
            <div className="col-span-1 text-right">S2</div>
            <div className="col-span-1 text-right">R1</div>
            <div className="col-span-1 text-right">R2</div>
            <div className="col-span-2 text-right">Δ from PP</div>
            <div className="col-span-2 text-right">Nearest</div>
          </div>
          <div className="divide-y divide-border max-h-[60dvh] overflow-y-auto">
            {loading && rows.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Fetching D1 candles…
              </div>
            )}
            {rows.map((r) => {
              const d = decimalsFor(r.last);
              return (
                <div
                  key={r.symbol}
                  className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-accent/30 transition diq-press text-xs font-mono"
                >
                  <div className="col-span-2 font-medium font-sans">{r.display}</div>
                  <div className="col-span-1 text-right">{r.last.toFixed(d)}</div>
                  <div className="col-span-1 text-right text-primary">{r.pivots.pp.toFixed(d)}</div>
                  <div className="col-span-1 text-right text-bear/80">{r.pivots.s1.toFixed(d)}</div>
                  <div className="col-span-1 text-right text-bear/60">{r.pivots.s2.toFixed(d)}</div>
                  <div className="col-span-1 text-right text-bull/80">{r.pivots.r1.toFixed(d)}</div>
                  <div className="col-span-1 text-right text-bull/60">{r.pivots.r2.toFixed(d)}</div>
                  <div
                    className={`col-span-2 text-right ${
                      r.distancePct >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {r.distancePct >= 0 ? "+" : ""}
                    {r.distancePct.toFixed(2)}%
                  </div>
                  <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
                    <Target className="w-3 h-3 text-amber-400" />
                    <span className="font-mono text-amber-400">{r.nearest.label}</span>
                    <span className="text-muted-foreground">{r.nearest.distPct.toFixed(2)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Classic pivots · PP=(H+L+C)/3 · R/S derived from prior D1 from Deriv · refresh every 5min.
        </p>
      </div>
    </AppShell>
  );
}
