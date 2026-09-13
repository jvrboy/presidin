/** VOLUME pack — VWAP z, VPT, PVT trend, Volume Delta, KVO, effort-vs-result, absorption. */
import type { Candle } from './indicators';
import { ema, sma, atr, lastFinite } from './indicators';

export function pvt(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    const ret = prev !== 0 ? (candles[i].close - prev) / prev : 0;
    const vol = Math.max(candles[i].high - candles[i].low, 1e-9);
    out[i] = out[i - 1] + ret * vol;
  }
  return out;
}

export function vpt(candles: Candle[]): number[] {
  return pvt(candles);
}

export function volumeDelta(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = Math.max(c.high - c.low, 1e-9);
    const clv = ((c.close - c.low) - (c.high - c.close)) / range;
    out[i] = clv * range;
  }
  return out;
}

export function klingerOscillator(candles: Candle[], fast = 34, slow = 55, signal = 13): { line: number[]; signal: number[] } {
  const vf: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const hlc = (c.high + c.low + c.close) / 3;
    const phlc = (p.high + p.low + p.close) / 3;
    const trend = hlc > phlc ? 1 : -1;
    const dm = c.high - c.low;
    const cm = i === 1 ? dm : Math.max(1e-9, (vf[i - 1] > 0 ? dm : dm));
    const vol = Math.max(c.high - c.low, 1e-9);
    vf[i] = vol * trend * Math.abs(2 * (dm / cm - 1)) * 100;
  }
  const efast = ema(vf, fast);
  const eslow = ema(vf, slow);
  const line = efast.map((v, i) => v - eslow[i]);
  const sig = ema(line, signal);
  return { line, signal: sig };
}

export function effortVsResult(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  const a = atr(candles, 14);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const effort = Math.max(c.high - c.low, 1e-9);
    const result = Math.abs(c.close - c.open);
    const av = a[i] || 1;
    out[i] = (result / effort) * (effort / av); // 0=absorption, high=impulsive
  }
  return out;
}

export function absorption(candles: Candle[], look = 10): number[] {
  const evr = effortVsResult(candles);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = look; i < candles.length; i++) {
    let hit = 0;
    for (let k = i - look + 1; k <= i; k++) if (evr[k] < 0.3) hit++;
    out[i] = hit / look; // fraction of absorption bars
  }
  return out;
}

export function volumeZ(candles: Candle[], period = 20): number[] {
  const vols = candles.map((c) => Math.max(c.high - c.low, 1e-9));
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    const slice = vols.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(varr) || 1;
    out[i] = (vols[i] - mean) / sd;
  }
  return out;
}

export function volumeSnapshot(candles: Candle[]) {
  const pv = pvt(candles);
  const ko = klingerOscillator(candles);
  return {
    pvtSlope: pv.length >= 6 ? pv[pv.length - 1] - pv[pv.length - 6] : 0,
    volDelta: lastFinite(volumeDelta(candles)),
    klingerLine: lastFinite(ko.line),
    klingerSig: lastFinite(ko.signal),
    klingerFlip: (ko.line[ko.line.length - 2] || 0) < (ko.signal[ko.signal.length - 2] || 0) && (lastFinite(ko.line) > lastFinite(ko.signal))
      ? 'UP' : ((ko.line[ko.line.length - 2] || 0) > (ko.signal[ko.signal.length - 2] || 0) && (lastFinite(ko.line) < lastFinite(ko.signal)) ? 'DOWN' : 'FLAT'),
    evr: lastFinite(effortVsResult(candles)),
    absorption: lastFinite(absorption(candles, 10)),
    volZ: lastFinite(volumeZ(candles, 20)),
  };
}

export { lastFinite, ema, sma };
