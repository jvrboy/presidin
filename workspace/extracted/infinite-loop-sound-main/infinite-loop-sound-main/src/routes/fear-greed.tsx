import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Flame } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/fear-greed")({
  head: () => ({ meta: [{ title: "Fear & Greed Index — DivergenceIQ" }] }),
  component: FearGreedPage,
});

const INDICATOR_CONFIG = [
  { key: "momentum", name: "Price Momentum", desc: "Price vs 125-day moving average" },
  { key: "rsi", name: "RSI", desc: "14-period Relative Strength Index" },
  { key: "volatility", name: "Volatility", desc: "50-day volatility vs 50-day average" },
  {
    key: "junkBondDemand",
    name: "Junk Bond Demand",
    desc: "Spread between junk and investment grade",
  },
  { key: "marketVol", name: "Market Volume", desc: "Trading volume vs 200-day average" },
  { key: "putCall", name: "Put/Call Ratio", desc: "Put vs call options volume" },
  { key: "safeHavenDemand", name: "Safe Haven Demand", desc: "Demand for safe assets vs risky" },
] as const;

function FearGreedPage() {
  const [inputs, setInputs] = useState({
    momentum: 65,
    rsi: 45,
    volatility: 30,
    junkBondDemand: 55,
    marketVol: 60,
    putCall: 70,
    safeHavenDemand: 35,
  });

  const result = useMemo(() => {
    const values = Object.values(inputs);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    let label = "EXTREME FEAR";
    let color = "text-bear";
    let bgColor = "bg-bear/20";
    if (avg >= 75) {
      label = "EXTREME GREED";
      color = "text-bull";
      bgColor = "bg-bull/20";
    } else if (avg >= 55) {
      label = "GREED";
      color = "text-bull";
      bgColor = "bg-bull/10";
    } else if (avg >= 45) {
      label = "NEUTRAL";
      color = "text-muted-foreground";
      bgColor = "bg-muted";
    } else if (avg >= 25) {
      label = "FEAR";
      color = "text-bear";
      bgColor = "bg-bear/10";
    }

    const indicators = INDICATOR_CONFIG.map((cfg) => ({
      name: cfg.name,
      value: inputs[cfg.key],
      desc: cfg.desc,
      key: cfg.key,
    }));

    return { avg, label, color, bgColor, indicators };
  }, [inputs]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" /> Fear & Greed Index
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Composite sentiment indicator combining momentum, volatility, volume, and safe-haven
            demand.
          </p>
        </div>

        <div className={`rounded-lg p-8 ${result.bgColor} text-center`}>
          <div className={`text-5xl font-bold font-mono ${result.color}`}>
            {result.avg.toFixed(0)}
          </div>
          <div className={`text-xl font-bold mt-2 ${result.color}`}>{result.label}</div>
          <div className="w-full max-w-md mx-auto mt-4 bg-muted rounded-full h-4 relative overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-1 bg-bear/30" />
              <div className="flex-1 bg-bear/15" />
              <div className="flex-1 bg-muted-foreground/20" />
              <div className="flex-1 bg-bull/15" />
              <div className="flex-1 bg-bull/30" />
            </div>
            <div
              className="absolute top-0 h-4 w-1 bg-foreground rounded"
              style={{ left: `${result.avg}%` }}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {result.indicators.map((ind) => (
            <div key={ind.name} className="bg-card border border-border p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{ind.name}</span>
                <span className="font-mono font-bold text-sm">{ind.value}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={ind.value}
                onChange={(e) => setInputs({ ...inputs, [ind.key]: Number(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">{ind.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 text-sm">
          <div className="font-semibold mb-2">Interpretation</div>
          <p className="text-muted-foreground">
            {result.avg >= 75
              ? "Extreme greed — the market may be overbought. Consider taking profits or reducing exposure. Contrarian signal: bearish."
              : result.avg >= 55
                ? "Greed — investors are becoming complacent. Be cautious of new long positions. Contrarian signal: slightly bearish."
                : result.avg >= 45
                  ? "Neutral — no strong sentiment bias. Follow your system's signals without sentiment adjustment."
                  : result.avg >= 25
                    ? "Fear — investors are worried. Look for buying opportunities in quality assets. Contrarian signal: slightly bullish."
                    : "Extreme fear — the market may be oversold. Historically a good time to buy. Contrarian signal: bullish."}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
