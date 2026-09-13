import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { BarChart } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/market-breadth")({
  head: () => ({ meta: [{ title: "Market Breadth — DivergenceIQ" }] }),
  component: MarketBreadthPage,
});

type AssetData = {
  symbol: string;
  change: number;
  volume: number;
  advancers?: number;
  decliners?: number;
};

function MarketBreadthPage() {
  const [assets, setAssets] = useState<AssetData[]>([
    { symbol: "EURUSD", change: 0.35, volume: 12000 },
    { symbol: "GBPUSD", change: -0.22, volume: 9000 },
    { symbol: "USDJPY", change: 0.15, volume: 11000 },
    { symbol: "AUDUSD", change: -0.45, volume: 7000 },
    { symbol: "USDCAD", change: 0.18, volume: 8000 },
    { symbol: "USDCHF", change: -0.12, volume: 6000 },
    { symbol: "NZDUSD", change: 0.28, volume: 5000 },
    { symbol: "EURGBP", change: -0.08, volume: 4000 },
    { symbol: "EURJPY", change: 0.52, volume: 8500 },
    { symbol: "GBPJPY", change: 0.31, volume: 7500 },
  ]);

  const [newSymbol, setNewSymbol] = useState("");
  const [newChange, setNewChange] = useState("");

  const stats = useMemo(() => {
    const advancers = assets.filter((a) => a.change > 0);
    const decliners = assets.filter((a) => a.change < 0);
    const unchanged = assets.filter((a) => a.change === 0);
    const advDecRatio =
      decliners.length > 0 ? advancers.length / decliners.length : advancers.length;
    const breadthThrust = advancers.length / assets.length;
    const avgChange = assets.reduce((s, a) => s + a.change, 0) / assets.length;
    const totalVol = assets.reduce((s, a) => s + a.volume, 0);
    const upVol = advancers.reduce((s, a) => s + a.volume, 0);
    const downVol = decliners.reduce((s, a) => s + a.volume, 0);
    const volRatio = downVol > 0 ? upVol / downVol : upVol;
    const mcclellan = advancers.length - decliners.length;

    let signal = "NEUTRAL";
    let signalColor = "bg-muted text-muted-foreground";
    if (breadthThrust > 0.7 && volRatio > 1.5) {
      signal = "STRONG BULLISH THRUST";
      signalColor = "bg-bull/20 text-bull";
    } else if (breadthThrust < 0.3 && volRatio < 0.5) {
      signal = "STRONG BEARISH THRUST";
      signalColor = "bg-bear/20 text-bear";
    } else if (breadthThrust > 0.6) {
      signal = "BULLISH";
      signalColor = "bg-bull/15 text-bull";
    } else if (breadthThrust < 0.4) {
      signal = "BEARISH";
      signalColor = "bg-bear/15 text-bear";
    }

    return {
      advancers,
      decliners,
      unchanged,
      advDecRatio,
      breadthThrust,
      avgChange,
      totalVol,
      upVol,
      downVol,
      volRatio,
      mcclellan,
      signal,
      signalColor,
    };
  }, [assets]);

  const addAsset = () => {
    if (!newSymbol) return;
    setAssets([
      ...assets,
      { symbol: newSymbol.toUpperCase(), change: Number(newChange) || 0, volume: 5000 },
    ]);
    setNewSymbol("");
    setNewChange("");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart className="w-6 h-6 text-primary" /> Market Breadth Indicator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Advance/Decline ratio, McClellan Oscillator, and volume-based breadth thrust detection.
          </p>
        </div>

        <div className={`rounded-lg p-4 ${stats.signalColor} flex items-center justify-between`}>
          <span className="font-bold text-lg">{stats.signal}</span>
          <span className="font-mono text-sm">A/D Ratio: {stats.advDecRatio.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border p-4 rounded-lg text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Advancers</div>
            <div className="font-mono font-bold text-2xl mt-1 text-bull">
              {stats.advancers.length}
            </div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Decliners</div>
            <div className="font-mono font-bold text-2xl mt-1 text-bear">
              {stats.decliners.length}
            </div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Breadth %</div>
            <div className="font-mono font-bold text-2xl mt-1">
              {(stats.breadthThrust * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg text-center">
            <div className="text-[10px] text-muted-foreground uppercase">McClellan</div>
            <div className="font-mono font-bold text-2xl mt-1">
              {stats.mcclellan > 0 ? "+" : ""}
              {stats.mcclellan}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/50 p-3 border-b border-border font-semibold">Asset List</div>
            <div className="divide-y divide-border">
              {assets.map((a) => (
                <div key={a.symbol} className="p-3 flex items-center justify-between">
                  <span className="font-mono font-medium text-sm">{a.symbol}</span>
                  <span
                    className={`font-mono font-bold text-sm ${a.change > 0 ? "text-bull" : a.change < 0 ? "text-bear" : "text-muted-foreground"}`}
                  >
                    {a.change > 0 ? "+" : ""}
                    {a.change.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="Symbol"
                className="flex-1 p-2 border border-input rounded bg-background font-mono text-sm"
              />
              <input
                type="number"
                value={newChange}
                onChange={(e) => setNewChange(e.target.value)}
                placeholder="%"
                className="w-20 p-2 border border-input rounded bg-background font-mono text-sm"
              />
              <button
                onClick={addAsset}
                className="px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-medium"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div className="text-sm font-semibold">Breadth Visual</div>
            <div className="flex h-8 rounded overflow-hidden">
              <div
                className="bg-bull flex items-center justify-center text-xs font-bold text-bull-foreground"
                style={{ width: `${(stats.advancers.length / assets.length) * 100}%` }}
              >
                {stats.advancers.length}
              </div>
              <div
                className="bg-muted flex items-center justify-center text-xs"
                style={{ width: `${(stats.unchanged.length / assets.length) * 100}%` }}
              >
                {stats.unchanged.length}
              </div>
              <div
                className="bg-bear flex items-center justify-center text-xs font-bold text-bear-foreground"
                style={{ width: `${(stats.decliners.length / assets.length) * 100}%` }}
              >
                {stats.decliners.length}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Up Volume:</span>{" "}
                <span className="font-mono text-bull">{stats.upVol.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Down Volume:</span>{" "}
                <span className="font-mono text-bear">{stats.downVol.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vol Ratio:</span>{" "}
                <span className="font-mono">{stats.volRatio.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg Change:</span>{" "}
                <span className="font-mono">{stats.avgChange.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
