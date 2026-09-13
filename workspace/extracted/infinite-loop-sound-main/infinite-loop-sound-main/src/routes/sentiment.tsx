import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo } from "react";
import { Twitter, MessageCircle, Heart, Activity } from "lucide-react";
import { useDerivFeed } from "@/hooks/use-deriv-feed";
import { sentimentProxy } from "@/lib/derived/microstructure";
import { displayPair } from "@/lib/engine/deriv";

export const Route = createFileRoute("/sentiment")({
  component: SentimentPage,
});

// 8 instruments — keeps the WS load light, still enough for a scoreboard.
const WATCH: Array<{ symbol: string; display: string }> = [
  { symbol: "frxEURUSD", display: "EUR/USD" },
  { symbol: "frxGBPUSD", display: "GBP/USD" },
  { symbol: "frxUSDJPY", display: "USD/JPY" },
  { symbol: "frxAUDUSD", display: "AUD/USD" },
  { symbol: "frxXAUUSD", display: "XAU/USD" },
  { symbol: "frxXAGUSD", display: "XAG/USD" },
  { symbol: "cryBTCUSD", display: "BTC/USD" },
  { symbol: "cryETHUSD", display: "ETH/USD" },
];

function SentimentPage() {
  const symbols = useMemo(() => WATCH.map((w) => w.symbol), []);
  const { ticks, ready } = useDerivFeed(symbols);

  const rows = WATCH.map((w) => {
    const t = ticks[w.symbol];
    const proxy = t ? sentimentProxy(t) : null;
    return { ...w, proxy };
  });

  const drivers = useMemo(() => {
    // top-3 movers ranked by |changePct|
    const ranked = rows
      .filter((r) => r.proxy)
      .map((r) => ({
        driver: `${r.display} momentum`,
        impact: r.proxy!.changePct,
        pairs: r.display.split("/")[0],
        signed: parseFloat(r.proxy!.changePct),
      }))
      .sort((a, b) => Math.abs(b.signed) - Math.abs(a.signed))
      .slice(0, 4);
    return ranked;
  }, [rows]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Twitter className="w-6 h-6 text-blue-400" />
              Sentiment Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live tick-derived bull/bear ratio from rolling price action — public Deriv feed.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <Activity
              className={`w-3.5 h-3.5 text-blue-400 ${ready ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-blue-400">
              {ready ? "LIVE" : "CONNECTING…"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((r) => {
            const s = r.proxy;
            return (
              <div
                key={r.symbol}
                className="rounded-xl border border-border bg-card p-5 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono font-bold text-lg">{r.display}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MessageCircle className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {s ? `${s.ticks} ticks` : "—"}
                      </span>
                      {s?.trending && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          TRENDING
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold ${s && s.score >= 60 ? "text-bull" : s && s.score >= 40 ? "text-amber-400" : "text-bear"}`}
                  >
                    {s ? s.score : "—"}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                    <div className="bg-bull" style={{ width: `${s?.bullish ?? 50}%` }} />
                    <div className="bg-bear" style={{ width: `${s?.bearish ?? 50}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-bull">{s?.bullish ?? 0}% bull</span>
                    <span
                      className={`font-medium ${s && s.changePct.startsWith("+") ? "text-bull" : "text-bear"}`}
                    >
                      {s?.changePct ?? "—"}
                    </span>
                    <span className="text-bear">{s?.bearish ?? 0}% bear</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-400" />
              Tape Recap
            </h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Live commentary derived from rolling momentum. No social-media feed wired (would need
              Twitter/Reddit API key).
            </p>
            <div className="space-y-2.5 text-xs">
              {rows
                .filter((r) => r.proxy)
                .slice(0, 4)
                .map((r) => (
                  <div key={r.symbol} className="p-2.5 rounded-lg bg-muted/30">
                    <div className="text-foreground">
                      {r.display}{" "}
                      {r.proxy!.bullish > 60
                        ? "bid-heavy"
                        : r.proxy!.bearish > 60
                          ? "offered"
                          : "two-sided"}
                      , {r.proxy!.trending ? "vol expansion" : "stable vol"}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">tape/derived</span>
                      <span>{r.proxy!.ticks} ticks</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-sm mb-3">Top Movers (live)</h3>
            <div className="space-y-2.5">
              {drivers.map((d) => (
                <div
                  key={d.driver}
                  className="flex justify-between items-center p-2.5 rounded-lg bg-muted/30"
                >
                  <div>
                    <div className="text-xs font-medium">{d.driver}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Quote ccy: {d.pairs}
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${d.signed >= 0 ? "text-bull" : "text-bear"}`}>
                    {d.impact}
                  </div>
                </div>
              ))}
              {drivers.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Waiting for ticks…</p>
              )}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          All numbers derived from public Deriv WS ticks. Not actual social-media sentiment.
        </p>
      </div>
    </AppShell>
  );
}
