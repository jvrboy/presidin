/** Additional decision tools: fib, ORB, killzone, CVD proxy, correlation, multi-TF bias */
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

/** Classic swing fib pullback tool */
export function fibonacciTool(candles: Candle[]): ToolVote {
  if (candles.length < 40) return vote('fib', 'HOLD', 0.1, 0.3, 'short');
  const slice = candles.slice(-40);
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = 0;
  let loI = 0;
  slice.forEach((c, i) => {
    if (c.high >= hi) {
      hi = c.high;
      hiI = i;
    }
    if (c.low <= lo) {
      lo = c.low;
      loI = i;
    }
  });
  const range = hi - lo || 1;
  const price = slice[slice.length - 1].close;
  const uptrend = loI < hiI;
  const retrace = uptrend ? (hi - price) / range : (price - lo) / range;
  // 38.2–61.8 pullback zone
  if (uptrend && retrace >= 0.35 && retrace <= 0.65) {
    return vote('fib', 'BUY', 0.62, 0.9, `bull fib ${ (retrace * 100).toFixed(0) }%`, { retrace, hi, lo });
  }
  if (!uptrend && retrace >= 0.35 && retrace <= 0.65) {
    return vote('fib', 'SELL', 0.62, 0.9, `bear fib ${ (retrace * 100).toFixed(0) }%`, { retrace, hi, lo });
  }
  if (uptrend && retrace < 0.2) return vote('fib', 'BUY', 0.4, 0.55, 'shallow pullback / extension', { retrace });
  if (!uptrend && retrace < 0.2) return vote('fib', 'SELL', 0.4, 0.55, 'shallow pullback / extension', { retrace });
  return vote('fib', 'HOLD', 0.2, 0.4, `fib retrace ${ (retrace * 100).toFixed(0) }%`, { retrace });
}

/** Opening range breakout on last N bars as proxy for session OR */
export function openingRangeTool(candles: Candle[], rangeBars = 8): ToolVote {
  if (candles.length < rangeBars + 5) return vote('orb', 'HOLD', 0.1, 0.3, 'short');
  const openSlice = candles.slice(-(rangeBars + 15), -15);
  if (openSlice.length < rangeBars) return vote('orb', 'HOLD', 0.1, 0.3, 'no range');
  const hi = Math.max(...openSlice.map((c) => c.high));
  const lo = Math.min(...openSlice.map((c) => c.low));
  const last = candles[candles.length - 1].close;
  const mid = (hi + lo) / 2;
  const width = hi - lo || 1;
  if (last > hi) return vote('orb', 'BUY', 0.68, 1.0, `OR break up ${ ((last - hi) / width).toFixed(2) }`, { hi, lo });
  if (last < lo) return vote('orb', 'SELL', 0.68, 1.0, `OR break down ${ ((lo - last) / width).toFixed(2) }`, { hi, lo });
  if (last > mid) return vote('orb', 'BUY', 0.35, 0.5, 'inside OR above mid', { hi, lo });
  if (last < mid) return vote('orb', 'SELL', 0.35, 0.5, 'inside OR below mid', { hi, lo });
  return vote('orb', 'HOLD', 0.2, 0.35, 'inside OR mid', { hi, lo });
}

/** London / NY killzones (UTC) */
export function killzoneTool(): ToolVote {
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const t = hour + minute / 60;
  // London 7–10, NY 12–15 UTC
  if (t >= 7 && t < 10) return vote('killzone', 'BUY', 0.4, 0.55, 'London killzone');
  if (t >= 12 && t < 15) return vote('killzone', 'BUY', 0.42, 0.55, 'NY killzone');
  if (t >= 10 && t < 12) return vote('killzone', 'HOLD', 0.3, 0.4, 'London lunch');
  if (t >= 20 || t < 2) return vote('killzone', 'HOLD', 0.35, 0.45, 'Asia low liquidity');
  return vote('killzone', 'HOLD', 0.2, 0.3, `off-killzone ${hour}h`);
}

/** Cumulative volume-delta proxy from candle body direction */
export function cvdProxyTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('cvd', 'HOLD', 0.1, 0.3, 'short');
  const slice = candles.slice(-30);
  let cvd = 0;
  const series: number[] = [];
  for (const c of slice) {
    const body = c.close - c.open;
    const range = c.high - c.low || 1e-9;
    // volume proxy = range; sign from body
    cvd += (body / range) * range;
    series.push(cvd);
  }
  const last = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 6)];
  const slope = last - prev;
  const priceUp = slice[slice.length - 1].close >= slice[0].close;
  if (slope > 0 && priceUp) return vote('cvd', 'BUY', 0.58, 0.85, `CVD rising ${slope.toFixed(4)}`);
  if (slope < 0 && !priceUp) return vote('cvd', 'SELL', 0.58, 0.85, `CVD falling ${slope.toFixed(4)}`);
  if (slope > 0 && !priceUp) return vote('cvd', 'BUY', 0.5, 0.8, 'bullish CVD divergence');
  if (slope < 0 && priceUp) return vote('cvd', 'SELL', 0.5, 0.8, 'bearish CVD divergence');
  return vote('cvd', 'HOLD', 0.2, 0.4, `CVD flat ${slope.toFixed(4)}`);
}

/** Multi-EMA stack alignment */
export function emaStackTool(candles: Candle[]): ToolVote {
  if (candles.length < 55) return vote('ema_stack', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const e8 = lastFinite(ema(c, 8));
  const e21 = lastFinite(ema(c, 21));
  const e55 = lastFinite(ema(c, 55));
  if (e8 > e21 && e21 > e55) return vote('ema_stack', 'BUY', 0.6, 0.9, 'bull stack 8>21>55');
  if (e8 < e21 && e21 < e55) return vote('ema_stack', 'SELL', 0.6, 0.9, 'bear stack 8<21<55');
  return vote('ema_stack', 'HOLD', 0.25, 0.45, 'EMA stack mixed');
}

/** RSI regime + momentum acceleration */
export function rsiAccelTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('rsi_accel', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const r0 = lastFinite(r);
  const r1 = r[r.length - 3] ?? r0;
  const accel = r0 - r1;
  if (r0 < 35 && accel > 2) return vote('rsi_accel', 'BUY', 0.62, 0.85, `RSI turn up ${r0.toFixed(1)}`);
  if (r0 > 65 && accel < -2) return vote('rsi_accel', 'SELL', 0.62, 0.85, `RSI turn down ${r0.toFixed(1)}`);
  if (r0 > 55 && accel > 0) return vote('rsi_accel', 'BUY', 0.4, 0.5, `RSI momentum ${r0.toFixed(1)}`);
  if (r0 < 45 && accel < 0) return vote('rsi_accel', 'SELL', 0.4, 0.5, `RSI momentum ${r0.toFixed(1)}`);
  return vote('rsi_accel', 'HOLD', 0.2, 0.35, `RSI ${r0.toFixed(1)} accel ${accel.toFixed(1)}`);
}

/** ATR expansion / contraction regime */
export function atrRegimeTool(candles: Candle[]): ToolVote {
  if (candles.length < 40) return vote('atr_regime', 'HOLD', 0.1, 0.3, 'short');
  const a = atr(candles, 14);
  const now = lastFinite(a);
  const avg = lastFinite(sma(a, 20));
  const ratio = avg ? now / avg : 1;
  const c = candles.map((x) => x.close);
  const slope = lastFinite(ema(c, 8)) - lastFinite(ema(c, 21));
  if (ratio > 1.35 && slope > 0) return vote('atr_regime', 'BUY', 0.55, 0.8, `ATR expand up x${ratio.toFixed(2)}`);
  if (ratio > 1.35 && slope < 0) return vote('atr_regime', 'SELL', 0.55, 0.8, `ATR expand down x${ratio.toFixed(2)}`);
  if (ratio < 0.7) return vote('atr_regime', 'HOLD', 0.4, 0.7, `ATR squeeze x${ratio.toFixed(2)}`);
  return vote('atr_regime', 'HOLD', 0.2, 0.4, `ATR normal x${ratio.toFixed(2)}`);
}

export function runExtraTools(candles: Candle[]): ToolVote[] {
  return [
    fibonacciTool(candles),
    openingRangeTool(candles),
    killzoneTool(),
    cvdProxyTool(candles),
    emaStackTool(candles),
    rsiAccelTool(candles),
    atrRegimeTool(candles),
  ];
}
