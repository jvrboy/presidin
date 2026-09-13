/** TREND pack — TTM Trend, Zero-Lag EMA, MAMA/FAMA-lite, Trend Intensity, ADX Delta, MA Slope Cascade. */
import type { Candle } from './indicators';
import { sma, ema, atr, lastFinite, macd } from './indicators';

export function ttmTrend(candles: Candle[]): { direction: number[]; strength: number[] } {
  const dir: number[] = new Array(candles.length).fill(0);
  const str: number[] = new Array(candles.length).fill(0);
  for (let i = 5; i < candles.length; i++) {
    let up = 0;
    let dn = 0;
    for (let k = i - 5; k < i; k++) {
      const c = candles[k];
      if (c.close > c.open) up++;
      else if (c.close < c.open) dn++;
    }
    dir[i] = up > dn ? 1 : dn > up ? -1 : 0;
    str[i] = Math.abs(up - dn) / 6;
  }
  return { direction: dir, strength: str };
}

export function zeroLagEma(values: number[], period = 20): number[] {
  const lag = Math.floor((period - 1) / 2);
  const src = values.map((v, i) => 2 * v - (values[i - lag] ?? v));
  return ema(src, period);
}

export function mamaFama(values: number[], fast = 0.5, slow = 0.05): { mama: number[]; fama: number[] } {
  const mama: number[] = new Array(values.length).fill(0);
  const fama: number[] = new Array(values.length).fill(0);
  if (!values.length) return { mama, fama };
  mama[0] = values[0]; fama[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    const alpha = i < 4 ? fast : Math.max(slow, Math.min(fast, fast * (1 - Math.abs(values[i] - values[i - 1]) / Math.max(Math.abs(values[i - 1]), 1e-9))));
    mama[i] = alpha * values[i] + (1 - alpha) * mama[i - 1];
    fama[i] = 0.5 * alpha * mama[i] + (1 - 0.5 * alpha) * fama[i - 1];
  }
  return { mama, fama };
}

export function trendIntensity(candles: Candle[], period = 30): number[] {
  const c = candles.map((x) => x.close);
  const s = sma(c, period);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    let up = 0;
    let dn = 0;
    for (let k = i - period + 1; k <= i; k++) {
      if (c[k] > s[k]) up++;
      else if (c[k] < s[k]) dn++;
    }
    out[i] = ((up - dn) / period) * 100;
  }
  return out;
}

export function adxDelta(candles: Candle[], period = 14): number[] {
  // ADX slope proxy — d(hist)/dt of MACD as trend acceleration
  const c = candles.map((x) => x.close);
  const m = macd(c);
  const out: number[] = new Array(c.length).fill(0);
  for (let i = 1; i < m.hist.length; i++) out[i] = (m.hist[i] || 0) - (m.hist[i - 1] || 0);
  return out;
}

export function maSlopeCascade(values: number[]) {
  const emas = [8, 21, 50, 100].map((n) => ema(values, n));
  const slopes = emas.map((e) => (e.length >= 3 ? (e[e.length - 1] - e[e.length - 3]) / Math.max(Math.abs(e[e.length - 3]), 1e-9) : 0));
  const bull = slopes.every((s) => s > 0);
  const bear = slopes.every((s) => s < 0);
  const alignment = slopes.filter((s) => s > 0).length - slopes.filter((s) => s < 0).length;
  return { slopes, bull, bear, alignment };
}

export function ttmSqueeze(candles: Candle[]): { squeeze: boolean; release: 'UP' | 'DOWN' | null } {
  const c = candles.map((x) => x.close);
  const m = sma(c, 20);
  let sq = false;
  let rel: 'UP' | 'DOWN' | null = null;
  const std = c.slice(-20);
  const mean = std.reduce((a, b) => a + b, 0) / std.length;
  const varr = std.reduce((a, b) => a + (b - mean) ** 2, 0) / std.length;
  const sd = Math.sqrt(varr);
  const bbW = 4 * sd;
  const a = lastFinite(atr(candles, 14));
  const kcW = 3 * a;
  if (bbW < kcW) sq = true;
  const price = c[c.length - 1];
  if (!sq && price > lastFinite(m)) rel = 'UP';
  else if (!sq && price < lastFinite(m)) rel = 'DOWN';
  return { squeeze: sq, release: rel };
}

export function trendSnapshot(candles: Candle[]) {
  const c = candles.map((x) => x.close);
  const t = ttmTrend(candles);
  return {
    ttmDir: t.direction[t.direction.length - 1],
    ttmStr: t.strength[t.strength.length - 1],
    zlema: lastFinite(zeroLagEma(c, 20)),
    trendIntensity: lastFinite(trendIntensity(candles, 30)),
    adxDelta: lastFinite(adxDelta(candles)),
    ...maSlopeCascade(c),
    squeeze: ttmSqueeze(candles),
  };
}

export { lastFinite, ema, sma };
