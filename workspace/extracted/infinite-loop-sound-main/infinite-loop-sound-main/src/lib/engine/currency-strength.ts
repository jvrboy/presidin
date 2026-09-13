// Currency-strength meter.
//
// For each base currency, average its normalised performance across all
// available pairs that contain it. EUR strength = mean of EUR vs everything
// else, where each pair's normalised score is its % change over the window.

import type { Candle } from "./indicators";

export interface CurrencyStrength {
  currency: string;
  score: number; // -100..+100
  rank: number; // 1 = strongest
  pairsAnalyzed: number;
}

export interface PairChange {
  symbol: string; // e.g. "frxEURUSD"
  base: string; // "EUR"
  quote: string; // "USD"
  changePct: number;
}

const FX_RE = /^frx([A-Z]{3})([A-Z]{3})$/;

/** Extract base/quote ISO codes from a Deriv symbol. Returns null for non-FX. */
export function parseFxSymbol(symbol: string): { base: string; quote: string } | null {
  const m = symbol.match(FX_RE);
  return m ? { base: m[1], quote: m[2] } : null;
}

/** Compute % change over the candle window. */
export function changePct(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const a = candles[0].close;
  const b = candles[candles.length - 1].close;
  return a > 0 ? ((b - a) / a) * 100 : 0;
}

/**
 * Build a currency-strength leaderboard from a map of symbol → candles.
 * Non-FX symbols are ignored.
 */
export function currencyStrength(candlesBySymbol: Record<string, Candle[]>): CurrencyStrength[] {
  const buckets = new Map<string, { sum: number; n: number }>();

  for (const [sym, candles] of Object.entries(candlesBySymbol)) {
    const parsed = parseFxSymbol(sym);
    if (!parsed || !candles?.length) continue;
    const ch = changePct(candles);
    // base gains when pair rises
    const b = buckets.get(parsed.base) || { sum: 0, n: 0 };
    b.sum += ch;
    b.n += 1;
    buckets.set(parsed.base, b);
    // quote gains when pair falls
    const q = buckets.get(parsed.quote) || { sum: 0, n: 0 };
    q.sum -= ch;
    q.n += 1;
    buckets.set(parsed.quote, q);
  }

  const rows: Omit<CurrencyStrength, "rank">[] = Array.from(buckets.entries()).map(
    ([currency, { sum, n }]) => ({
      currency,
      score: n > 0 ? Math.max(-100, Math.min(100, (sum / n) * 10)) : 0,
      pairsAnalyzed: n,
    }),
  );

  return rows.sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Top-N strongest & weakest currencies, useful for pair-selection. */
export function topPairs(strengths: CurrencyStrength[], n = 3) {
  const strong = strengths.slice(0, n);
  const weak = strengths.slice(-n).reverse();
  const pairs: { long: string; short: string; spread: number }[] = [];
  for (const s of strong) {
    for (const w of weak) {
      if (s.currency === w.currency) continue;
      pairs.push({ long: s.currency, short: w.currency, spread: s.score - w.score });
    }
  }
  return pairs.sort((a, b) => b.spread - a.spread);
}
