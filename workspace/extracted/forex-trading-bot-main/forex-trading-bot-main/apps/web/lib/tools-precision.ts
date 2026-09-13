/**
 * Precision tools — calibrated for multi-market (FX, indices, synthetics).
 * Designed to reduce false signals and improve TP/SL context.
 */
import type { Candle } from './indicators';
import { atr, ema, lastFinite, rsi, sma } from './indicators';
import type { ToolVote } from './tools';

type Direction = 'BUY' | 'SELL' | 'HOLD';

function vote(
  name: string,
  direction: Direction,
  confidence: number,
  weight: number,
  reason: string,
  meta?: Record<string, number | string | boolean>
): ToolVote {
  return {
    name,
    direction,
    confidence: Math.max(0, Math.min(1, confidence)),
    weight,
    reason,
    meta,
  };
}

/** Higher-high / lower-low structure */
export function structureTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('structure', 'HOLD', 0.1, 0.3, 'short');
  const highs = candles.slice(-20).map((c) => c.high);
  const lows = candles.slice(-20).map((c) => c.low);
  const hh = highs[highs.length - 1] > Math.max(...highs.slice(0, -3));
  const ll = lows[lows.length - 1] < Math.min(...lows.slice(0, -3));
  const hl = lows[lows.length - 1] > Math.min(...lows.slice(0, -8));
  const lh = highs[highs.length - 1] < Math.max(...highs.slice(0, -8));
  if (hh && hl) return vote('structure', 'BUY', 0.62, 0.95, 'HH+HL structure');
  if (ll && lh) return vote('structure', 'SELL', 0.62, 0.95, 'LL+LH structure');
  return vote('structure', 'HOLD', 0.2, 0.4, 'mixed structure');
}

/** EMA stack 9/21/50 alignment */
export function emaStackTool(candles: Candle[]): ToolVote {
  if (candles.length < 55) return vote('ema_stack', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const e9 = lastFinite(ema(c, 9));
  const e21 = lastFinite(ema(c, 21));
  const e50 = lastFinite(ema(c, 50));
  const px = c[c.length - 1];
  if (!(e9 && e21 && e50)) return vote('ema_stack', 'HOLD', 0.1, 0.3, 'nan');
  if (px > e9 && e9 > e21 && e21 > e50)
    return vote('ema_stack', 'BUY', 0.68, 1.05, 'full bull stack');
  if (px < e9 && e9 < e21 && e21 < e50)
    return vote('ema_stack', 'SELL', 0.68, 1.05, 'full bear stack');
  if (e9 > e21) return vote('ema_stack', 'BUY', 0.38, 0.55, '9>21 only');
  if (e9 < e21) return vote('ema_stack', 'SELL', 0.38, 0.55, '9<21 only');
  return vote('ema_stack', 'HOLD', 0.2, 0.35, 'flat stack');
}

/** RSI + price momentum agreement (avoids lone RSI faults) */
export function momentumConfirmTool(candles: Candle[]): ToolVote {
  if (candles.length < 25) return vote('mom_confirm', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const r = lastFinite(rsi(c, 14)) ?? 50;
  const ret5 = (c[c.length - 1] - c[c.length - 6]) / (c[c.length - 6] || 1);
  // Require agreement — RSI alone was a top loss fault signal
  if (r < 32 && ret5 < -0.001) return vote('mom_confirm', 'BUY', 0.58, 0.9, `oversold+weak ${r.toFixed(0)}`);
  if (r > 68 && ret5 > 0.001) return vote('mom_confirm', 'SELL', 0.58, 0.9, `overbought+strong ${r.toFixed(0)}`);
  if (r > 55 && ret5 > 0.002) return vote('mom_confirm', 'BUY', 0.48, 0.7, `momentum up ${r.toFixed(0)}`);
  if (r < 45 && ret5 < -0.002) return vote('mom_confirm', 'SELL', 0.48, 0.7, `momentum down ${r.toFixed(0)}`);
  return vote('mom_confirm', 'HOLD', 0.2, 0.4, `mixed r=${r.toFixed(0)} ret5=${(ret5 * 100).toFixed(2)}%`);
}

/** ATR expansion / compression regime */
export function atrRegimeTool(candles: Candle[]): ToolVote {
  if (candles.length < 40) return vote('atr_regime', 'HOLD', 0.1, 0.3, 'short');
  const a = atr(candles, 14);
  const last = lastFinite(a);
  const avg = lastFinite(sma(a.filter((x) => Number.isFinite(x)) as number[], 20));
  if (!last || !avg) return vote('atr_regime', 'HOLD', 0.1, 0.3, 'nan');
  const ratio = last / avg;
  if (ratio > 1.6) return vote('atr_regime', 'HOLD', 0.55, 0.85, `ATR expanded ${ratio.toFixed(2)}x — caution`);
  if (ratio < 0.65) return vote('atr_regime', 'HOLD', 0.4, 0.5, `ATR compressed ${ratio.toFixed(2)}x — wait break`);
  return vote('atr_regime', 'HOLD', 0.15, 0.25, `ATR normal ${ratio.toFixed(2)}x`);
}

/** Candle rejection (pin bar / engulf) */
export function candleRejectTool(candles: Candle[]): ToolVote {
  if (candles.length < 5) return vote('candle_reject', 'HOLD', 0.1, 0.3, 'short');
  const a = candles[candles.length - 2];
  const b = candles[candles.length - 1];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low || 1e-9;
  const lowerWick = Math.min(b.open, b.close) - b.low;
  const upperWick = b.high - Math.max(b.open, b.close);
  // bullish pin
  if (lowerWick > body * 2 && lowerWick / range > 0.55)
    return vote('candle_reject', 'BUY', 0.6, 0.85, 'bullish rejection wick');
  // bearish pin
  if (upperWick > body * 2 && upperWick / range > 0.55)
    return vote('candle_reject', 'SELL', 0.6, 0.85, 'bearish rejection wick');
  // engulf
  if (b.close > b.open && a.close < a.open && b.close >= a.open && b.open <= a.close)
    return vote('candle_reject', 'BUY', 0.58, 0.8, 'bullish engulf');
  if (b.close < b.open && a.close > a.open && b.open >= a.close && b.close <= a.open)
    return vote('candle_reject', 'SELL', 0.58, 0.8, 'bearish engulf');
  return vote('candle_reject', 'HOLD', 0.15, 0.3, 'no rejection pattern');
}

/** Distance-to-extremes mean reversion only when not trending hard */
export function edgeDistanceTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('edge_dist', 'HOLD', 0.1, 0.3, 'short');
  const slice = candles.slice(-30);
  const hi = Math.max(...slice.map((c) => c.high));
  const lo = Math.min(...slice.map((c) => c.low));
  const px = slice[slice.length - 1].close;
  const pos = (px - lo) / (hi - lo || 1);
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const trend = e21 ? Math.abs(px - e21) / (e21 * 0.002 || 1) : 0;
  if (pos < 0.12 && trend < 2) return vote('edge_dist', 'BUY', 0.55, 0.75, `near range low ${pos.toFixed(2)}`);
  if (pos > 0.88 && trend < 2) return vote('edge_dist', 'SELL', 0.55, 0.75, `near range high ${pos.toFixed(2)}`);
  return vote('edge_dist', 'HOLD', 0.2, 0.35, `mid ${pos.toFixed(2)}`);
}

export function runPrecisionTools(candles: Candle[]): ToolVote[] {
  return [
    structureTool(candles),
    emaStackTool(candles),
    momentumConfirmTool(candles),
    atrRegimeTool(candles),
    candleRejectTool(candles),
    edgeDistanceTool(candles),
  ];
}
