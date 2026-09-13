// Derived market signals from raw tick streams.
// These are *honest* derivations from price microstructure — not made-up
// twitter sentiment / fake options flow. UI must label them as derived.
import type { FeedTick } from "@/hooks/use-deriv-feed";

// ---------- Momentum / "sentiment" proxy ----------
//
// A real sentiment score requires text feeds we don't have. Instead we compute
// a price-action proxy:
//   - rolling return (drift), normalised to [-1, +1]
//   - rolling volatility (uncertainty)
//   - "bull/bear" ratio = fraction of last N ticks where delta > 0
//   - score = bull% (0-100), trending = vol > median(vol)
export interface SentimentProxy {
  symbol: string;
  score: number; // 0..100, 50 = neutral
  bullish: number; // % of recent ticks with positive delta
  bearish: number; // % negative
  ticks: number;
  changePct: string; // signed pct over the rolling window
  trending: boolean; // volatility above its own rolling median
  last: number;
}

export function sentimentProxy(t: FeedTick): SentimentProxy | null {
  const w = t.window;
  if (w.length < 10) return null;

  // up vs down between consecutive samples
  let up = 0;
  let down = 0;
  for (let i = 1; i < w.length; i++) {
    const d = w[i] - w[i - 1];
    if (d > 0) up++;
    else if (d < 0) down++;
  }
  const total = up + down || 1;
  const bullish = (up / total) * 100;
  const bearish = 100 - bullish;
  const score = Math.round(bullish);

  const startPx = w[0];
  const lastPx = w[w.length - 1];
  const pct = startPx > 0 ? ((lastPx - startPx) / startPx) * 100 : 0;

  const v = t.volWindow;
  const median = v.length > 0 ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0;
  const lastVol = v.length > 0 ? v[v.length - 1] : 0;
  const trending = lastVol > median * 1.2;

  return {
    symbol: t.symbol,
    score,
    bullish: Math.round(bullish),
    bearish: Math.round(bearish),
    ticks: w.length,
    changePct: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    trending,
    last: lastPx,
  };
}

// ---------- "Institutional block" detection ----------
//
// Deriv doesn't expose dark-pool data; nobody public does for FX. What we *can*
// honestly detect is *outsized tick moves* — single deltas > N stdev of the
// rolling window. These are statistically anomalous and are a reasonable
// proxy for "large players moved size into the book."
export interface Block {
  time: string;
  symbol: string;
  display: string;
  side: "BUY" | "SELL";
  pctMove: string;
  price: number;
  z: number; // z-score of the move
}

export function detectBlocks(t: FeedTick, display: string, zThreshold = 2.5): Block | null {
  const v = t.volWindow;
  if (v.length < 30) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  const sd = Math.sqrt(variance) || 1e-9;
  const z = (Math.abs(t.pctDelta) - mean) / sd;
  if (z < zThreshold) return null;
  return {
    time: new Date(t.epoch * 1000).toISOString().slice(11, 16),
    symbol: t.symbol,
    display,
    side: t.delta >= 0 ? "BUY" : "SELL",
    pctMove: `${t.pctDelta >= 0 ? "+" : ""}${t.pctDelta.toFixed(3)}%`,
    price: t.last,
    z,
  };
}

// ---------- Realised volatility + IV proxy ----------
//
// True implied vol needs an options chain. We don't have one — Deriv's options
// API is for binary contracts. Instead we ship a *realised vol* number (annualised
// stdev of returns), label it "RV", and synthesise an "IV proxy" by inflating RV
// with a kurtosis adjustment. The UI labels these clearly.
export interface VolMetric {
  symbol: string;
  display: string;
  realisedVol: number; // annualised %, e.g. 12.4
  ivProxy: number; // realised + tail premium
  pctile: number; // realised vol percentile vs its own window
  trend: "UP" | "DOWN" | "FLAT";
}

export function volMetrics(t: FeedTick, display: string): VolMetric | null {
  const v = t.volWindow;
  if (v.length < 20) return null;
  const recent = v.slice(-20);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  // annualise from per-tick (rough; assumes ~1s ticks, 252*24*3600 ticks/yr)
  const annualised = sd * Math.sqrt(252 * 24 * 60 * 60);
  // tail-fat IV proxy: 1.15 * RV + 0.05% floor
  const ivProxy = annualised * 1.15 + 0.05;
  const sorted = [...v].sort((a, b) => a - b);
  const idx = sorted.findIndex((x) => x >= sd);
  const pctile = idx < 0 ? 100 : Math.round((idx / sorted.length) * 100);

  const earlier = v.slice(-40, -20);
  const earlierMean =
    earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : mean;
  const trend: VolMetric["trend"] =
    mean > earlierMean * 1.1 ? "UP" : mean < earlierMean * 0.9 ? "DOWN" : "FLAT";

  return {
    symbol: t.symbol,
    display,
    realisedVol: Number(annualised.toFixed(2)),
    ivProxy: Number(ivProxy.toFixed(2)),
    pctile,
    trend,
  };
}
