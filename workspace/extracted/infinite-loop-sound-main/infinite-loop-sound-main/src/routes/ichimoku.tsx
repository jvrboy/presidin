import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Cloud, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/ichimoku")({
  head: () => ({ meta: [{ title: "Ichimoku Cloud — DivergenceIQ" }] }),
  component: IchimokuPage,
});

type Candle = { high: number; low: number; close: number };

function ichimoku(candles: Candle[], tenkan = 9, kijun = 26, senkouB = 52) {
  if (candles.length < senkouB) return null;
  const slice = candles.slice(-senkouB);
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  const hh = Math.max(...highs);
  const ll = Math.min(...lows);

  const tkSlice = candles.slice(-tenkan);
  const tkH = Math.max(...tkSlice.map((c) => c.high));
  const tkL = Math.min(...tkSlice.map((c) => c.low));
  const tenkanVal = (tkH + tkL) / 2;

  const kjSlice = candles.slice(-kijun);
  const kjH = Math.max(...kjSlice.map((c) => c.high));
  const kjL = Math.min(...kjSlice.map((c) => c.low));
  const kijunVal = (kjH + kjL) / 2;

  const senkouA = (tenkanVal + kijunVal) / 2;
  const senkouBVal = (hh + ll) / 2;

  const close = candles[candles.length - 1].close;
  const chikou = close;

  const cloudTop = Math.max(senkouA, senkouBVal);
  const cloudBot = Math.min(senkouA, senkouBVal);
  const aboveCloud = close > cloudTop;
  const belowCloud = close < cloudBot;
  const inCloud = !aboveCloud && !belowCloud;
  const bullCloud = senkouA > senkouBVal;
  const tkBull = tenkanVal > kijunVal;

  let signal = "NEUTRAL";
  let score = 50;
  if (aboveCloud && tkBull && bullCloud) {
    signal = "STRONG BULLISH";
    score = 85;
  } else if (aboveCloud && tkBull) {
    signal = "BULLISH";
    score = 70;
  } else if (belowCloud && !tkBull && !bullCloud) {
    signal = "STRONG BEARISH";
    score = 15;
  } else if (belowCloud && !tkBull) {
    signal = "BEARISH";
    score = 30;
  } else if (inCloud) {
    signal = "CONSOLIDATION";
    score = 50;
  }

  return {
    tenkanVal,
    kijunVal,
    senkouA,
    senkouBVal,
    chikou,
    cloudTop,
    cloudBot,
    aboveCloud,
    belowCloud,
    inCloud,
    bullCloud,
    tkBull,
    signal,
    score,
  };
}

function IchimokuPage() {
  const [input, setInput] = useState(
    "1.0850,1.0820,1.0840\n1.0840,1.0810,1.0835\n1.0835,1.0800,1.0820\n1.0820,1.0790,1.0810\n1.0810,1.0785,1.0805\n1.0805,1.0795,1.0815\n1.0815,1.0800,1.0830\n1.0830,1.0810,1.0845\n1.0845,1.0825,1.0855\n1.0855,1.0835,1.0860\n1.0860,1.0840,1.0870\n1.0870,1.0850,1.0865\n1.0865,1.0845,1.0880\n1.0880,1.0860,1.0890\n1.0890,1.0870,1.0885\n1.0885,1.0865,1.0875\n1.0875,1.0855,1.0895\n1.0895,1.0875,1.0905\n1.0905,1.0885,1.0910\n1.0910,1.0890,1.0900\n1.0900,1.0880,1.0915\n1.0915,1.0895,1.0925\n1.0925,1.0905,1.0935\n1.0935,1.0915,1.0920\n1.0920,1.0900,1.0940\n1.0940,1.0920,1.0950\n1.0950,1.0930,1.0945\n1.0945,1.0925,1.0960\n1.0960,1.0940,1.0970\n1.0970,1.0950,1.0965\n1.0965,1.0945,1.0980\n1.0980,1.0960,1.0990\n1.0990,1.0970,1.0985\n1.0985,1.0965,1.1000\n1.1000,1.0980,1.1010\n1.1010,1.0990,1.1005\n1.1005,1.0985,1.1020\n1.1020,1.1000,1.1030\n1.1030,1.1010,1.1025\n1.1025,1.1005,1.1040\n1.1040,1.1020,1.1050\n1.1050,1.1030,1.1045\n1.1045,1.1025,1.1060\n1.1060,1.1040,1.1070\n1.1070,1.1050,1.1065\n1.1065,1.1045,1.1080\n1.1080,1.1060,1.1090\n1.1090,1.1070,1.1085\n1.1085,1.1065,1.1100\n1.1100,1.1080,1.1110\n1.1110,1.1090,1.1105\n1.1105,1.1085,1.1120\n1.1120,1.1100,1.1130",
  );

  const candles = useMemo<Candle[]>(() => {
    return input
      .trim()
      .split("\n")
      .map((line) => {
        const [h, l, c] = line.split(",").map(Number);
        return { high: h, low: l, close: c };
      })
      .filter((c) => !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));
  }, [input]);

  const result = useMemo(() => ichimoku(candles), [candles]);
  const fmt = (n: number) => (n ? n.toFixed(5) : "—");

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Cloud className="w-6 h-6 text-primary" /> Ichimoku Cloud Analyzer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete Ichimoku Kinko Hyo system with Tenkan-sen, Kijun-sen, Senkou Span A/B, and
            Chikou Span for trend identification.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">Candle Data (high,low,close per line)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
              placeholder="1.0850,1.0820,1.0840"
            />
            <p className="text-xs text-muted-foreground">
              {candles.length} candles parsed. Need 52+ for full calculation.
            </p>
          </div>

          <div className="space-y-4">
            {result ? (
              <>
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-muted-foreground">Signal</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${result.signal.includes("BULL") ? "bg-bull/20 text-bull" : result.signal.includes("BEAR") ? "bg-bear/20 text-bear" : "bg-muted text-muted-foreground"}`}
                    >
                      {result.signal}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-1">
                    <div
                      className={`h-3 rounded-full transition-all ${result.score >= 50 ? "bg-bull" : "bg-bear"}`}
                      style={{ width: `${result.score}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">Confidence: {result.score}%</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Tenkan-sen (9)", value: result.tenkanVal, bull: result.tkBull },
                    { label: "Kijun-sen (26)", value: result.kijunVal, bull: result.tkBull },
                    { label: "Senkou Span A", value: result.senkouA, bull: result.bullCloud },
                    { label: "Senkou Span B", value: result.senkouBVal, bull: result.bullCloud },
                    { label: "Chikou Span", value: result.chikou, bull: result.aboveCloud },
                    { label: "Cloud Top", value: result.cloudTop, bull: result.aboveCloud },
                  ].map((item) => (
                    <div key={item.label} className="bg-card border border-border p-3 rounded-lg">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {item.label}
                      </div>
                      <div className="font-mono font-bold text-lg mt-1">{fmt(item.value)}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold mb-2">Cloud Position</div>
                  <div className="flex items-center gap-2">
                    {result.aboveCloud ? (
                      <TrendingUp className="w-4 h-4 text-bull" />
                    ) : result.belowCloud ? (
                      <TrendingDown className="w-4 h-4 text-bear" />
                    ) : (
                      <Minus className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">
                      {result.aboveCloud
                        ? "Price above cloud — bullish trend"
                        : result.belowCloud
                          ? "Price below cloud — bearish trend"
                          : "Price inside cloud — consolidation"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.bullCloud ? (
                      <TrendingUp className="w-4 h-4 text-bull" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-bear" />
                    )}
                    <span className="text-sm">
                      Cloud is {result.bullCloud ? "green (bullish)" : "red (bearish)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.tkBull ? (
                      <TrendingUp className="w-4 h-4 text-bull" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-bear" />
                    )}
                    <span className="text-sm">
                      Tenkan/Kijun {result.tkBull ? "bullish cross" : "bearish cross"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-card border border-border p-6 rounded-lg text-center text-muted-foreground">
                Need at least 52 candles for full Ichimoku calculation.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
