// Discretionary strategy detectors that contribute confluence reasons
// alongside the technical engine. Each detector returns a list of
// {side, weight, note} contributions used by scoreAccuracy() and shown
// in the Heatmap reasons panel.
//
// Sources: BTMM (Steve Mauro), MSNR (Malaysian S&R), Alchemist (MSNR+SMC),
// CRT (Candle Range Theory), VSA (Tom Williams), Order Flow.

import type { Candle } from "./indicators";
import type { Tick } from "./heatmap-analytics";

export interface StrategyHit {
  name: string;
  side: "BUY" | "SELL";
  weight: number; // 0..25
  note: string;
}

const last = <T>(arr: T[], n = 1): T | undefined => arr[arr.length - n];

/* ============================================================
 * BTMM — Session sweep / Asian-range break
 * Detects: sharp rejection from prior swing extreme (stop run)
 * ============================================================ */
function btmmStopRun(c: Candle[]): StrategyHit | null {
  if (c.length < 30) return null;
  const recent = c.slice(-30);
  const k = recent[recent.length - 1];
  const priorHigh = Math.max(...recent.slice(0, -1).map((x) => x.high));
  const priorLow = Math.min(...recent.slice(0, -1).map((x) => x.low));
  const body = Math.abs(k.close - k.open);
  const upWick = k.high - Math.max(k.open, k.close);
  const dnWick = Math.min(k.open, k.close) - k.low;
  if (k.high > priorHigh && upWick > body * 1.5 && k.close < priorHigh) {
    return {
      name: "BTMM",
      side: "SELL",
      weight: 14,
      note: "BTMM stop run above prior high — rejection wick",
    };
  }
  if (k.low < priorLow && dnWick > body * 1.5 && k.close > priorLow) {
    return {
      name: "BTMM",
      side: "BUY",
      weight: 14,
      note: "BTMM stop run below prior low — rejection wick",
    };
  }
  return null;
}

/* ============================================================
 * MSNR — Malaysian S&R: A/V level retest (clean reaction zone)
 * ============================================================ */
function msnrRetest(c: Candle[]): StrategyHit | null {
  if (c.length < 40) return null;
  const window = c.slice(-40, -3);
  const k = last(c)!;
  // find recent obvious swing pivots
  for (let i = 2; i < window.length - 2; i++) {
    const p = window[i];
    const isHigh =
      p.high > window[i - 1].high &&
      p.high > window[i + 1].high &&
      p.high > window[i - 2].high &&
      p.high > window[i + 2].high;
    const isLow =
      p.low < window[i - 1].low &&
      p.low < window[i + 1].low &&
      p.low < window[i - 2].low &&
      p.low < window[i + 2].low;
    if (isHigh && Math.abs(k.high - p.high) / p.high < 0.0015 && k.close < k.open) {
      return {
        name: "MSNR",
        side: "SELL",
        weight: 12,
        note: `MSNR A-level retest @ ${p.high.toFixed(5)}`,
      };
    }
    if (isLow && Math.abs(k.low - p.low) / p.low < 0.0015 && k.close > k.open) {
      return {
        name: "MSNR",
        side: "BUY",
        weight: 12,
        note: `MSNR V-level retest @ ${p.low.toFixed(5)}`,
      };
    }
  }
  return null;
}

/* ============================================================
 * Alchemist — MSNR + Smart Money confluence at prior order block
 * (uses the last strong opposite-direction candle as OB)
 * ============================================================ */
function alchemistOB(c: Candle[]): StrategyHit | null {
  if (c.length < 20) return null;
  const recent = c.slice(-20);
  const k = last(recent)!;
  for (let i = recent.length - 4; i >= 0; i--) {
    const o = recent[i];
    const next = recent[i + 1];
    if (!next) continue;
    const obBody = Math.abs(o.close - o.open);
    const nextBody = Math.abs(next.close - next.open);
    if (nextBody < obBody * 1.4) continue;
    // bullish OB = down candle followed by strong up candle
    if (o.close < o.open && next.close > next.open) {
      if (k.low <= o.high && k.close > o.low) {
        return {
          name: "Alchemist",
          side: "BUY",
          weight: 13,
          note: `Alchemist bullish OB @ ${o.low.toFixed(5)}-${o.high.toFixed(5)}`,
        };
      }
    }
    if (o.close > o.open && next.close < next.open) {
      if (k.high >= o.low && k.close < o.high) {
        return {
          name: "Alchemist",
          side: "SELL",
          weight: 13,
          note: `Alchemist bearish OB @ ${o.low.toFixed(5)}-${o.high.toFixed(5)}`,
        };
      }
    }
  }
  return null;
}

/* ============================================================
 * CRT — Candle Range Theory: 3-candle liquidity raid
 * (range candle → sweep candle → reversal closing back into range)
 * ============================================================ */
function crtRaid(c: Candle[]): StrategyHit | null {
  if (c.length < 3) return null;
  const [c1, c2, c3] = c.slice(-3);
  if (c2.high > c1.high && c3.close < c1.high && c3.close < c2.close) {
    return {
      name: "CRT",
      side: "SELL",
      weight: 15,
      note: "CRT bearish raid — swept range high then closed back inside",
    };
  }
  if (c2.low < c1.low && c3.close > c1.low && c3.close > c2.close) {
    return {
      name: "CRT",
      side: "BUY",
      weight: 15,
      note: "CRT bullish raid — swept range low then closed back inside",
    };
  }
  return null;
}

/* ============================================================
 * VSA — Volume Spread Analysis: no-supply / no-demand & climactic
 * ============================================================ */
function vsa(c: Candle[]): StrategyHit | null {
  if (c.length < 25) return null;
  const k = last(c)!;
  const avgVol = c.slice(-21, -1).reduce((a, b) => a + (b.volume || 1), 0) / 20;
  const v = k.volume || 1;
  const spread = k.high - k.low;
  const avgSpread = c.slice(-21, -1).reduce((a, b) => a + (b.high - b.low), 0) / 20;
  if (v > avgVol * 2 && spread > avgSpread * 1.6 && k.close < k.open) {
    return {
      name: "VSA",
      side: "BUY",
      weight: 10,
      note: "VSA selling climax — capitulation volume",
    };
  }
  if (v > avgVol * 2 && spread > avgSpread * 1.6 && k.close > k.open) {
    return { name: "VSA", side: "SELL", weight: 10, note: "VSA buying climax — exhaustion volume" };
  }
  if (v < avgVol * 0.5 && k.close < k.open && spread < avgSpread * 0.7) {
    return { name: "VSA", side: "BUY", weight: 8, note: "VSA no-supply — sellers exhausted" };
  }
  if (v < avgVol * 0.5 && k.close > k.open && spread < avgSpread * 0.7) {
    return { name: "VSA", side: "SELL", weight: 8, note: "VSA no-demand — buyers exhausted" };
  }
  return null;
}

/* ============================================================
 * Order Flow — synthetic cumulative delta divergence
 * ============================================================ */
function orderFlowDelta(c: Candle[], ticks: Tick[]): StrategyHit | null {
  if (ticks.length < 40 || c.length < 5) return null;
  let acc = 0;
  for (let i = 1; i < ticks.length; i++) {
    const d = ticks[i].quote - ticks[i - 1].quote;
    if (d > 0) acc++;
    else if (d < 0) acc--;
  }
  const k = last(c)!;
  const prev = c[c.length - 2];
  // bullish: price makes new low but delta higher than recent low
  if (k.low < prev.low && acc > 0) {
    return {
      name: "OrderFlow",
      side: "BUY",
      weight: 10,
      note: "Order-flow bullish divergence — price lower, delta positive",
    };
  }
  if (k.high > prev.high && acc < 0) {
    return {
      name: "OrderFlow",
      side: "SELL",
      weight: 10,
      note: "Order-flow bearish divergence — price higher, delta negative",
    };
  }
  return null;
}

export function evaluateStrategies(candles: Candle[], ticks: Tick[]): StrategyHit[] {
  const out: (StrategyHit | null)[] = [
    btmmStopRun(candles),
    msnrRetest(candles),
    alchemistOB(candles),
    crtRaid(candles),
    vsa(candles),
    orderFlowDelta(candles, ticks),
  ];
  return out.filter((x): x is StrategyHit => x !== null);
}
