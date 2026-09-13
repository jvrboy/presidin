import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo } from "react";
import { TrendingUp, DollarSign, Activity, Zap } from "lucide-react";
import { useDerivFeed } from "@/hooks/use-deriv-feed";
import { volMetrics } from "@/lib/derived/microstructure";

export const Route = createFileRoute("/options-flow")({
  component: OptionsFlowPage,
});

const WATCH: Array<{ symbol: string; display: string }> = [
  { symbol: "frxEURUSD", display: "EUR/USD" },
  { symbol: "frxGBPUSD", display: "GBP/USD" },
  { symbol: "frxUSDJPY", display: "USD/JPY" },
  { symbol: "frxAUDUSD", display: "AUD/USD" },
  { symbol: "frxXAUUSD", display: "XAU/USD" },
  { symbol: "cryBTCUSD", display: "BTC/USD" },
];

function OptionsFlowPage() {
  const symbols = useMemo(() => WATCH.map((w) => w.symbol), []);
  const { ticks, ready } = useDerivFeed(symbols);

  const rows = useMemo(
    () =>
      WATCH.map((w) => {
        const t = ticks[w.symbol];
        const m = t ? volMetrics(t, w.display) : null;
        return { ...w, metric: m, last: t?.last ?? 0, pctDelta: t?.pctDelta ?? 0 };
      }),
    [ticks],
  );

  // synthesise "flow" rows: high vol + directional bias → CALL/PUT label
  const flows = useMemo(() => {
    return rows
      .filter((r) => r.metric)
      .map((r) => {
        const type = r.pctDelta >= 0 ? "CALL" : "PUT";
        const sentiment = r.pctDelta >= 0 ? "BULLISH" : "BEARISH";
        return {
          time: new Date().toISOString().slice(11, 16),
          pair: r.display,
          type,
          strike: r.last.toFixed(r.symbol.startsWith("cry") ? 0 : 4),
          // "premium" proxy: realised vol * notional ratio
          premium: `${(r.metric!.realisedVol * r.metric!.pctile * 0.1).toFixed(1)}k`,
          iv: `${r.metric!.ivProxy.toFixed(2)}%`,
          rv: `${r.metric!.realisedVol.toFixed(2)}%`,
          oi: `${r.metric!.pctile}%ile`,
          sentiment,
          trend: r.metric!.trend,
        };
      });
  }, [rows]);

  const totalPremium = flows.reduce((a, f) => a + parseFloat(f.premium.replace("k", "")), 0);
  const calls = flows.filter((f) => f.type === "CALL").length;
  const puts = flows.filter((f) => f.type === "PUT").length;
  const putCall = calls > 0 ? (puts / calls).toFixed(2) : "—";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-amber-400" />
              Volatility Flow
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Realised vol + IV proxy from live Deriv ticks · {flows.length} live instruments
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Activity
              className={`w-3.5 h-3.5 text-amber-400 ${ready ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-amber-400">
              {ready ? "LIVE" : "CONNECTING…"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          {[
            {
              label: "Total RV Notional",
              value: `${totalPremium.toFixed(1)}k`,
              change: `${flows.length} pairs`,
            },
            {
              label: "CALL bias",
              value: calls.toString(),
              change: calls + puts > 0 ? `${Math.round((calls / (calls + puts)) * 100)}%` : "—",
            },
            {
              label: "PUT bias",
              value: puts.toString(),
              change: calls + puts > 0 ? `${Math.round((puts / (calls + puts)) * 100)}%` : "—",
            },
            {
              label: "Put/Call",
              value: putCall,
              change:
                parseFloat(putCall) < 1
                  ? "Bullish"
                  : parseFloat(putCall) > 1
                    ? "Bearish"
                    : "Neutral",
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] text-muted-foreground uppercase">{stat.label}</div>
              <div className="text-xl font-bold font-mono mt-1">{stat.value}</div>
              <div className="text-[11px] text-bull mt-0.5">{stat.change}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-3 font-medium">Time</th>
                  <th className="text-left p-3 font-medium">Pair</th>
                  <th className="text-left p-3 font-medium">Bias</th>
                  <th className="text-right p-3 font-medium">Spot</th>
                  <th className="text-right p-3 font-medium">RV Notional</th>
                  <th className="text-right p-3 font-medium">IV proxy</th>
                  <th className="text-right p-3 font-medium">RV pctile</th>
                  <th className="text-left p-3 font-medium">Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground italic">
                      {ready
                        ? "Warming up rolling windows (≥20 ticks/symbol)…"
                        : "Connecting to Deriv WS…"}
                    </td>
                  </tr>
                )}
                {flows.map((flow, i) => (
                  <tr key={i} className="hover:bg-accent/30 transition-colors font-mono text-xs">
                    <td className="p-3 text-muted-foreground">{flow.time}</td>
                    <td className="p-3 font-medium">{flow.pair}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          flow.type === "CALL" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                        }`}
                      >
                        {flow.type}
                      </span>
                    </td>
                    <td className="p-3 text-right">{flow.strike}</td>
                    <td className="p-3 text-right font-medium text-amber-400">{flow.premium}</td>
                    <td className="p-3 text-right">{flow.iv}</td>
                    <td className="p-3 text-right text-muted-foreground">{flow.oi}</td>
                    <td className="p-3">
                      <span
                        className={`flex items-center gap-1 ${flow.sentiment === "BULLISH" ? "text-bull" : "text-bear"}`}
                      >
                        {flow.sentiment === "BULLISH" ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingUp className="w-3 h-3 rotate-180" />
                        )}
                        {flow.sentiment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Vol Outliers
            </h3>
            <div className="space-y-2 text-xs">
              {flows
                .filter((f) => f.rv && parseFloat(f.rv) > 10)
                .slice(0, 3)
                .map((f, i) => (
                  <div key={i} className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="font-medium">
                      {f.pair} — vol {f.rv}
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Trend {f.trend} · {f.oi} percentile · {f.sentiment.toLowerCase()} bias
                    </div>
                  </div>
                ))}
              {flows.filter((f) => parseFloat(f.rv) > 10).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No outliers right now.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3">Flow Analysis</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Smart Money (high-vol pairs)</span>
                <div className="text-right">
                  <div className={`font-medium ${calls >= puts ? "text-bull" : "text-bear"}`}>
                    {calls >= puts ? "Bullish" : "Bearish"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {Math.round((calls / Math.max(calls + puts, 1)) * 100)}% CALL bias
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vol Regime</span>
                <div className="text-right">
                  <div className="font-medium">
                    {flows.some((f) => f.trend === "UP")
                      ? "Expanding"
                      : flows.some((f) => f.trend === "DOWN")
                        ? "Contracting"
                        : "Stable"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {flows.length} symbols tracked
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hedge Funds</span>
                <div className="text-right">
                  <div className="font-medium text-muted-foreground italic">Proxy unavailable</div>
                  <div className="text-[10px] text-muted-foreground">Needs CFTC COT feed</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          No options exchange feed wired — Deriv is spot only. Numbers are realised-vol-based
          proxies. True options flow needs Polygon / Unusual Whales (TODO).
        </p>
      </div>
    </AppShell>
  );
}
