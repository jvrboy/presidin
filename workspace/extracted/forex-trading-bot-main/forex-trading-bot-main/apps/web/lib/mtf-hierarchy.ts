/**
 * Multi-timeframe hierarchy
 * ─────────────────────────
 * MAIN bias TFs (US session style): 1H · 4H · 8H ONLY
 * SNIPER entry TFs: 5m · 15m · 30m ONLY
 *
 * Rules:
 * 1. Direction may only come from HTF agreement (1H/4H/8H).
 * 2. LTF (5/15/30) never flips HTF bias — they only time ENTRY.
 * 3. If HTF is mixed → HOLD (no trade).
 * 4. Sniper requires at least one LTF alignment with HTF bias.
 */

import type { Candle } from './indicators';
import { ema, rsi, atr, lastFinite } from './indicators';
import type { Direction } from './types';

export const HTF_GRANULARITY = {
  '1h': 3600,
  '4h': 14400,
  '8h': 28800,
} as const;

export const LTF_GRANULARITY = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
} as const;

export type HtfKey = keyof typeof HTF_GRANULARITY;
export type LtfKey = keyof typeof LTF_GRANULARITY;

export interface TfBias {
  tf: string;
  direction: Direction;
  confidence: number;
  reason: string;
  ema9?: number;
  ema21?: number;
  rsi?: number;
}

export interface MtfPlan {
  bias: Direction;
  biasConfidence: number;
  htf: TfBias[];
  ltf: TfBias[];
  sniperReady: boolean;
  sniperTf: string[];
  entryAllowed: boolean;
  reason: string;
}

function dirFromCandles(candles: Candle[], tf: string): TfBias {
  if (!candles || candles.length < 30) {
    return { tf, direction: 'HOLD', confidence: 0.1, reason: 'insufficient bars' };
  }
  const c = candles.map((x) => x.close);
  const e9 = lastFinite(ema(c, 9));
  const e21 = lastFinite(ema(c, 21));
  const e50 = lastFinite(ema(c, 50));
  const r = lastFinite(rsi(c, 14)) ?? 50;
  const px = c[c.length - 1];
  if (!(e9 && e21)) {
    return { tf, direction: 'HOLD', confidence: 0.1, reason: 'ema nan' };
  }

  let direction: Direction = 'HOLD';
  let confidence = 0.25;
  const reasons: string[] = [];

  // Stack + price
  if (px > e9 && e9 > e21 && (!e50 || e21 > e50)) {
    direction = 'BUY';
    confidence = 0.62;
    reasons.push('bull stack');
  } else if (px < e9 && e9 < e21 && (!e50 || e21 < e50)) {
    direction = 'SELL';
    confidence = 0.62;
    reasons.push('bear stack');
  } else if (e9 > e21) {
    direction = 'BUY';
    confidence = 0.42;
    reasons.push('ema9>21');
  } else if (e9 < e21) {
    direction = 'SELL';
    confidence = 0.42;
    reasons.push('ema9<21');
  }

  // RSI soft confirm (never sole driver on HTF)
  if (direction === 'BUY' && r > 52) {
    confidence = Math.min(0.85, confidence + 0.08);
    reasons.push(`rsi ${r.toFixed(0)}`);
  } else if (direction === 'SELL' && r < 48) {
    confidence = Math.min(0.85, confidence + 0.08);
    reasons.push(`rsi ${r.toFixed(0)}`);
  } else if (direction === 'BUY' && r < 40) {
    confidence *= 0.75;
    reasons.push('rsi lag');
  } else if (direction === 'SELL' && r > 60) {
    confidence *= 0.75;
    reasons.push('rsi lag');
  }

  // Momentum of last 3 closes
  const ret3 = (c[c.length - 1] - c[c.length - 4]) / (c[c.length - 4] || 1);
  if (direction === 'BUY' && ret3 > 0) confidence = Math.min(0.9, confidence + 0.05);
  if (direction === 'SELL' && ret3 < 0) confidence = Math.min(0.9, confidence + 0.05);
  if (direction === 'BUY' && ret3 < -0.002) confidence *= 0.85;
  if (direction === 'SELL' && ret3 > 0.002) confidence *= 0.85;

  return {
    tf,
    direction,
    confidence: Math.round(confidence * 1000) / 1000,
    reason: reasons.join('+') || 'flat',
    ema9: e9,
    ema21: e21,
    rsi: r,
  };
}

/** Aggregate 1H + 4H + 8H into a single bias */
export function computeHtfBias(htfCandles: Partial<Record<HtfKey, Candle[]>>): {
  bias: Direction;
  confidence: number;
  details: TfBias[];
  reason: string;
} {
  const details: TfBias[] = [];
  for (const key of ['1h', '4h', '8h'] as HtfKey[]) {
    const bars = htfCandles[key];
    if (bars?.length) details.push(dirFromCandles(bars, key));
  }
  if (!details.length) {
    return { bias: 'HOLD', confidence: 0, details: [], reason: 'no HTF data' };
  }

  let buy = 0;
  let sell = 0;
  for (const d of details) {
    const w = d.tf === '4h' ? 1.3 : d.tf === '8h' ? 1.2 : 1.0; // 4H slightly dominant
    if (d.direction === 'BUY') buy += d.confidence * w;
    if (d.direction === 'SELL') sell += d.confidence * w;
  }

  const net = buy - sell;
  const total = buy + sell || 1;
  // Require clear majority — mixed HTF = no trade
  if (Math.abs(net) / total < 0.25) {
    return {
      bias: 'HOLD',
      confidence: Math.abs(net) / total,
      details,
      reason: `HTF mixed buy=${buy.toFixed(2)} sell=${sell.toFixed(2)}`,
    };
  }
  const bias: Direction = net > 0 ? 'BUY' : 'SELL';
  const confidence = Math.min(0.92, 0.45 + Math.abs(net) / total * 0.5);
  return {
    bias,
    confidence: Math.round(confidence * 1000) / 1000,
    details,
    reason: `HTF ${bias} (${details.map((d) => `${d.tf}:${d.direction}`).join(' ')})`,
  };
}

/** LTF sniper: only returns READY when LTF aligns with HTF bias */
export function computeLtfSniper(
  bias: Direction,
  ltfCandles: Partial<Record<LtfKey, Candle[]>>
): {
  ready: boolean;
  aligned: TfBias[];
  details: TfBias[];
  reason: string;
} {
  if (bias === 'HOLD') {
    return { ready: false, aligned: [], details: [], reason: 'no HTF bias' };
  }
  const details: TfBias[] = [];
  for (const key of ['5m', '15m', '30m'] as LtfKey[]) {
    const bars = ltfCandles[key];
    if (bars?.length) details.push(dirFromCandles(bars, key));
  }
  const aligned = details.filter((d) => d.direction === bias && d.confidence >= 0.38);
  // Need ≥1 aligned LTF; prefer 2+
  const ready = aligned.length >= 1;
  return {
    ready,
    aligned,
    details,
    reason: ready
      ? `sniper ${aligned.map((a) => a.tf).join('+')} aligned ${bias}`
      : `LTF not aligned to ${bias} (${details.map((d) => `${d.tf}:${d.direction}`).join(' ')})`,
  };
}

/** Full HTF→LTF plan */
export function buildMtfPlan(
  htfCandles: Partial<Record<HtfKey, Candle[]>>,
  ltfCandles: Partial<Record<LtfKey, Candle[]>>
): MtfPlan {
  const htf = computeHtfBias(htfCandles);
  const sniper = computeLtfSniper(htf.bias, ltfCandles);
  const entryAllowed = htf.bias !== 'HOLD' && sniper.ready;

  return {
    bias: htf.bias,
    biasConfidence: htf.confidence,
    htf: htf.details,
    ltf: sniper.details,
    sniperReady: sniper.ready,
    sniperTf: sniper.aligned.map((a) => a.tf),
    entryAllowed,
    reason: entryAllowed
      ? `${htf.reason} · ${sniper.reason}`
      : htf.bias === 'HOLD'
        ? htf.reason
        : `${htf.reason} · wait sniper: ${sniper.reason}`,
  };
}

/** ATR from preferred entry TF (15m fallback 5m) for TP/SL */
export function sniperAtr(ltfCandles: Partial<Record<LtfKey, Candle[]>>): number {
  const bars = ltfCandles['15m'] || ltfCandles['5m'] || ltfCandles['30m'];
  if (!bars?.length) return 0;
  return lastFinite(atr(bars, 14)) || 0;
}

export function sniperEntryPrice(ltfCandles: Partial<Record<LtfKey, Candle[]>>): number {
  const bars = ltfCandles['5m'] || ltfCandles['15m'] || ltfCandles['30m'];
  if (!bars?.length) return 0;
  return bars[bars.length - 1].close;
}
