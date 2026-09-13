/**
 * High-quality multi-timeframe signal engine for manual MT5 trading.
 * Gates from R25 loss autopsy + historical backtest:
 *  - HTF 1H/4H/8H bias (strict majority)
 *  - 5m MUST agree with HTF
 *  - >=2 of 3 LTF (5m/15m/30m) aligned
 *  - 5m chop filter
 * Approved universe from max-history BT (FX only, WR>=55%)
 */

import type { Candle } from './indicators';
import { ema, rsi, atr, lastFinite } from './indicators';
import type { Direction } from './types';

export const HQ_APPROVED = [
  'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxUSDCHF', 'frxUSDCAD', 'frxAUDUSD',
] as const;

export const MT5_MAP: Record<string, string> = {
  frxEURUSD: 'EURUSD', frxGBPUSD: 'GBPUSD', frxUSDJPY: 'USDJPY',
  frxUSDCHF: 'USDCHF', frxUSDCAD: 'USDCAD', frxAUDUSD: 'AUDUSD', frxNZDUSD: 'NZDUSD',
  OTC_SPC: 'US500', OTC_NDX: 'USTEC', OTC_DJI: 'US30',
  OTC_FTSE: 'UK100', OTC_GDAXI: 'GER40', OTC_FCHI: 'FRA40',
};

export interface TfSnap {
  tf: string;
  direction: Direction;
  confidence: number;
  rsi?: number;
}

export interface HqSignal {
  symbol: string;
  mt5: string;
  direction: Direction;
  actionable: boolean;
  confidence: number;
  entry: number;
  sl: number;
  tp: number;
  atr: number;
  rr: number;
  reason: string;
  htf: TfSnap[];
  ltf: TfSnap[];
  timeframe: string;
}

function dirFromCandles(candles: Candle[], tf: string): TfSnap {
  if (!candles || candles.length < 30) {
    return { tf, direction: 'HOLD', confidence: 0.1 };
  }
  const c = candles.map((x) => x.close);
  const e9 = lastFinite(ema(c, 9));
  const e21 = lastFinite(ema(c, 21));
  const e50 = lastFinite(ema(c, 50));
  const r = lastFinite(rsi(c, 14)) ?? 50;
  const px = c[c.length - 1];
  let direction: Direction = 'HOLD';
  let confidence = 0.25;
  if (e9 && e21) {
    if (px > e9 && e9 > e21 && (!e50 || e21 > e50)) {
      direction = 'BUY';
      confidence = 0.62;
    } else if (px < e9 && e9 < e21 && (!e50 || e21 < e50)) {
      direction = 'SELL';
      confidence = 0.62;
    } else if (e9 > e21) {
      direction = 'BUY';
      confidence = 0.42;
    } else if (e9 < e21) {
      direction = 'SELL';
      confidence = 0.42;
    }
  }
  if (direction === 'BUY' && r > 52) confidence = Math.min(0.88, confidence + 0.08);
  if (direction === 'SELL' && r < 48) confidence = Math.min(0.88, confidence + 0.08);
  if (direction === 'BUY' && r > 72) confidence *= 0.7;
  if (direction === 'SELL' && r < 28) confidence *= 0.7;
  return { tf, direction, confidence: Math.round(confidence * 1000) / 1000, rsi: Math.round(r * 10) / 10 };
}

function htfBias(snaps: TfSnap[]): { bias: Direction; confidence: number } {
  let buy = 0;
  let sell = 0;
  for (const s of snaps) {
    const w = s.tf === '4h' ? 1.3 : s.tf === '8h' ? 1.2 : 1.0;
    if (s.direction === 'BUY') buy += s.confidence * w;
    if (s.direction === 'SELL') sell += s.confidence * w;
  }
  const net = buy - sell;
  const total = buy + sell || 1;
  if (Math.abs(net) / total < 0.28) return { bias: 'HOLD', confidence: Math.abs(net) / total };
  const bias: Direction = net > 0 ? 'BUY' : 'SELL';
  return { bias, confidence: Math.min(0.9, 0.5 + (Math.abs(net) / total) * 0.45) };
}

function isChop(candles: Candle[], look = 20): boolean {
  if (!candles || candles.length < look + 5) return true;
  const c = candles.map((x) => x.close);
  const a = lastFinite(atr(candles, 14)) || 0;
  const px = c[c.length - 1] || 1;
  const atrPct = a / px;
  const window = c.slice(-look);
  const mid = window.reduce((s, x) => s + x, 0) / window.length;
  const rng = (Math.max(...window) - Math.min(...window)) / (mid || 1);
  let alt = 0;
  for (let i = c.length - look + 1; i < c.length; i++) {
    if ((c[i] - c[i - 1]) * (c[i - 1] - c[i - 2]) < 0) alt++;
  }
  const altRatio = alt / (look - 1);
  return atrPct < 0.00015 || rng < 0.0012 || altRatio > 0.65;
}

export function buildHqSignal(
  symbol: string,
  htfCandles: Partial<Record<'1h' | '4h' | '8h', Candle[]>>,
  ltfCandles: Partial<Record<'5m' | '15m' | '30m', Candle[]>>
): HqSignal {
  const htf: TfSnap[] = [];
  for (const tf of ['1h', '4h', '8h'] as const) {
    if (htfCandles[tf]?.length) htf.push(dirFromCandles(htfCandles[tf]!, tf));
  }
  const ltf: TfSnap[] = [];
  for (const tf of ['5m', '15m', '30m'] as const) {
    if (ltfCandles[tf]?.length) ltf.push(dirFromCandles(ltfCandles[tf]!, tf));
  }
  const { bias, confidence: bconf } = htfBias(htf);
  const bars5 = ltfCandles['5m'] || [];
  const entry = bars5.length ? bars5[bars5.length - 1].close : 0;
  const a = bars5.length ? lastFinite(atr(bars5, 14)) || entry * 0.0005 : entry * 0.0005;

  let actionable = false;
  let confidence = bconf;
  let reason = 'no_htf_bias';

  if (bias === 'HOLD') {
    reason = 'HTF mixed/flat';
  } else if (isChop(bars5)) {
    reason = 'chop_5m';
  } else {
    const map = Object.fromEntries(ltf.map((x) => [x.tf, x]));
    if (!map['5m'] || map['5m'].direction !== bias) {
      reason = `5m_conflict:${map['5m']?.direction || 'na'}`;
    } else {
      const aligned = ltf.filter((x) => x.direction === bias).map((x) => x.tf);
      if (aligned.length < 2) {
        reason = `ltf_weak:${aligned.join('+') || 'none'}`;
      } else {
        actionable = true;
        confidence = Math.min(0.92, 0.55 + 0.12 * aligned.length + (aligned.length === 3 ? 0.08 : 0));
        reason = `HQ aligned ${aligned.join('+')}`;
      }
    }
  }

  const direction: Direction = actionable ? bias : 'HOLD';
  let sl = entry;
  let tp = entry;
  if (direction === 'BUY') {
    sl = entry - 1.5 * a;
    tp = entry + 2.5 * a;
  } else if (direction === 'SELL') {
    sl = entry + 1.5 * a;
    tp = entry - 2.5 * a;
  }

  return {
    symbol,
    mt5: MT5_MAP[symbol] || symbol,
    direction,
    actionable,
    confidence: Math.round(confidence * 1000) / 1000,
    entry,
    sl,
    tp,
    atr: a,
    rr: 2.5 / 1.5,
    reason,
    htf,
    ltf,
    timeframe: '1H/4H/8H → 5m/15m/30m HQ',
  };
}
