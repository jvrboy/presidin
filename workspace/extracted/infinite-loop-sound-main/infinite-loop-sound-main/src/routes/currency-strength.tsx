import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Gauge, Activity, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { useDerivFeed } from "@/hooks/use-deriv-feed";

export const Route = createFileRoute("/currency-strength")({
  head: () => ({ meta: [{ title: "Currency Strength Meter — DivergenceIQ" }] }),
  component: CurrencyStrengthPage,
});

const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"] as const;
type Major = (typeof MAJOR_CURRENCIES)[number];

// Each entry: { base, quote, derivSymbol }. We pick the *most liquid* cross
// for each pair so the strength meter is meaningful even on quiet hours.
// 28 pairs covers every major-major combination.
const PAIRS: Array<{ base: Major; quote: Major; symbol: string }> = [
  // USD vs others (base or quote depending on convention)
  { base: "EUR", quote: "USD", symbol: "frxEURUSD" },
  { base: "GBP", quote: "USD", symbol: "frxGBPUSD" },
  { base: "USD", quote: "JPY", symbol: "frxUSDJPY" },
  { base: "AUD", quote: "USD", symbol: "frxAUDUSD" },
  { base: "USD", quote: "CAD", symbol: "frxUSDCAD" },
  { base: "USD", quote: "CHF", symbol: "frxUSDCHF" },
  { base: "NZD", quote: "USD", symbol: "frxNZDUSD" },

  // EUR crosses
  { base: "EUR", quote: "JPY", symbol: "frxEURJPY" },
  { base: "EUR", quote: "GBP", symbol: "frxEURGBP" },
  { base: "EUR", quote: "AUD", symbol: "frxEURAUD" },
  { base: "EUR", quote: "CAD", symbol: "frxEURCAD" },
  { base: "EUR", quote: "CHF", symbol: "frxEURCHF" },
  { base: "EUR", quote: "NZD", symbol: "frxEURNZD" },

  // GBP crosses
  { base: "GBP", quote: "JPY", symbol: "frxGBPJPY" },
  { base: "GBP", quote: "AUD", symbol: "frxGBPAUD" },
  { base: "GBP", quote: "CAD", symbol: "frxGBPCAD" },
  { base: "GBP", quote: "CHF", symbol: "frxGBPCHF" },
  { base: "GBP", quote: "NZD", symbol: "frxGBPNZD" },

  // AUD crosses
  { base: "AUD", quote: "JPY", symbol: "frxAUDJPY" },
  { base: "AUD", quote: "CAD", symbol: "frxAUDCAD" },
  { base: "AUD", quote: "CHF", symbol: "frxAUDCHF" },
  { base: "AUD", quote: "NZD", symbol: "frxAUDNZD" },

  // CAD crosses
  { base: "CAD", quote: "JPY", symbol: "frxCADJPY" },
  { base: "CAD", quote: "CHF", symbol: "frxCADCHF" },

  // CHF crosses
  { base: "CHF", quote: "JPY", symbol: "frxCHFJPY" },

  // NZD crosses
  { base: "NZD", quote: "JPY", symbol: "frxNZDJPY" },
  { base: "NZD", quote: "CAD", symbol: "frxNZDCAD" },
  { base: "NZD", quote: "CHF", symbol: "frxNZDCHF" },
];

function CurrencyStrengthPage() {
  const symbols = useMemo(() => PAIRS.map((p) => p.symbol), []);
  const { ticks, ready } = useDerivFeed(symbols);

  // Compute strength per currency:
  //   - for each pair (BASE/QUOTE) take the rolling % change from start of
  //     window to last tick,
  //   - add to BASE.score, subtract from QUOTE.score (so a rising EUR/USD
  //     strengthens EUR and weakens USD),
  //   - normalise the 8 currency scores to [0, 100] with min-max scaling.
  const strengths = useMemo(() => {
    const score: Record<Major, number> = {
      USD: 0,
      EUR: 0,
      GBP: 0,
      JPY: 0,
      AUD: 0,
      CAD: 0,
      CHF: 0,
      NZD: 0,
    };
    const count: Record<Major, number> = {
      USD: 0,
      EUR: 0,
      GBP: 0,
      JPY: 0,
      AUD: 0,
      CAD: 0,
      CHF: 0,
      NZD: 0,
    };

    for (const p of PAIRS) {
      const t = ticks[p.symbol];
      if (!t || t.window.length < 2) continue;
      const start = t.window[0];
      const last = t.window[t.window.length - 1];
      if (start <= 0) continue;
      const pct = ((last - start) / start) * 100;
      score[p.base] += pct;
      score[p.quote] -= pct;
      count[p.base] += 1;
      count[p.quote] += 1;
    }

    // average to remove "this currency just has more pairs" bias
    const avg: Record<Major, number> = { ...score };
    for (const c of MAJOR_CURRENCIES) {
      avg[c] = count[c] > 0 ? score[c] / count[c] : 0;
    }

    const vals = MAJOR_CURRENCIES.map((c) => avg[c]);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV || 1e-9;

    const out: Record<Major, { strength: number; raw: number; samples: number }> = {} as any;
    for (const c of MAJOR_CURRENCIES) {
      out[c] = {
        strength: ((avg[c] - minV) / span) * 100,
        raw: avg[c],
        samples: count[c],
      };
    }
    return out;
  }, [ticks]);

  const sorted = MAJOR_CURRENCIES.map((c) => ({ currency: c, ...strengths[c] })).sort(
    (a, b) => b.strength - a.strength,
  );
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const livePairs = Object.values(ticks).filter((t) => t.window.length > 1).length;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Gauge className="w-6 h-6 text-primary" /> Currency Strength Meter
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Computed from {PAIRS.length} live Deriv crosses · {livePairs} streaming
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30">
            <Activity
              className={`w-3.5 h-3.5 text-primary ${ready ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-primary">
              {ready ? `LIVE · ${livePairs}/${PAIRS.length}` : "CONNECTING…"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-bull" /> Strongest
            </div>
            <div className="text-2xl font-bold font-mono mt-1">
              {strongest?.currency ?? "—"}{" "}
              <span className="text-sm text-bull">{strongest?.strength.toFixed(1)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-bear" /> Weakest
            </div>
            <div className="text-2xl font-bold font-mono mt-1">
              {weakest?.currency ?? "—"}{" "}
              <span className="text-sm text-bear">{weakest?.strength.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="space-y-4">
            {sorted.map(({ currency, strength, raw, samples }) => {
              const color =
                strength > 75
                  ? "bg-bull"
                  : strength > 50
                    ? "bg-emerald-400"
                    : strength > 25
                      ? "bg-amber-400"
                      : "bg-bear";
              return (
                <div key={currency} className="flex items-center gap-4 group">
                  <div className="w-12 text-lg font-bold font-mono text-right">{currency}</div>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                    <div
                      className={`h-full ${color} transition-all duration-700 ease-out`}
                      style={{ width: `${strength}%` }}
                    />
                  </div>
                  <div className="w-16 text-sm font-mono text-muted-foreground text-right">
                    {strength.toFixed(1)}
                    <div className="text-[10px]">
                      {raw >= 0 ? "+" : ""}
                      {raw.toFixed(3)}%
                    </div>
                  </div>
                  <div className="w-10 text-[10px] text-muted-foreground text-right">
                    {samples}p
                  </div>
                </div>
              );
            })}
          </div>
          {!ready && (
            <p className="text-xs text-muted-foreground italic mt-4 text-center">
              Building rolling window… (≥2 ticks per pair)
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card/50 border border-border rounded-lg p-5">
            <h3 className="font-semibold text-sm mb-2">How to Trade This</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pair the strongest currency with the weakest. Today that's{" "}
              {strongest && weakest ? (
                <span className="font-mono text-foreground">
                  {strongest.currency}/{weakest.currency}
                </span>
              ) : (
                "—"
              )}{" "}
              — BUY-bias setups when momentum aligns with strength differential.
            </p>
          </div>
          <div className="bg-card/50 border border-border rounded-lg p-5">
            <h3 className="font-semibold text-sm mb-2">Method</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For each pair, the rolling % change is added to the base currency's score and
              subtracted from the quote. We average per-currency to remove the "more pairs ⇒ louder
              score" bias, then min-max normalise to 0–100.
            </p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Data: public Deriv WebSocket (app_id 1089) · {PAIRS.length} major crosses · {livePairs}{" "}
          streaming
        </p>
      </div>
    </AppShell>
  );
}
