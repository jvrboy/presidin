/** Deep LSTM: stacked 2-layer LSTM (16h → 10h) unrolled T=16, feature vector widened with rolling stats. */
import type { Candle } from './indicators';
import { featurize } from './model';
import { atr, ema, rsi, lastFinite } from './indicators';
import type { Direction, Signal } from './types';

function seed(s: number) {
  let a = s;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sig = (x: number) => (x > 20 ? 1 : x < -20 ? 0 : 1 / (1 + Math.exp(-x)));
const tanhF = (x: number) => { if (x > 20) return 1; if (x < -20) return -1; const e = Math.exp(2 * x); return (e - 1) / (e + 1); };

interface LayerW { wIx: number[][]; wIh: number[]; bI: number[]; wFx: number[][]; wFh: number[]; bF: number[]; wCx: number[][]; wCh: number[]; bC: number[]; wOx: number[][]; wOh: number[]; bO: number[]; }
interface DeepLstmWeights { version: string; l1: LayerW; l2: LayerW; wOut: number[]; bOut: number; threshold: number; }
let cache: DeepLstmWeights | null = null;

function initLayer(input: number, hidden: number, rnd: () => number): LayerW {
  const s = Math.sqrt(1 / input);
  const mkm = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * s * 0.4));
  const mkv = (r: number) => Array.from({ length: r }, () => (rnd() * 2 - 1) * 0.05);
  return { wIx: mkm(hidden, input), wIh: mkv(hidden), bI: mkv(hidden),
           wFx: mkm(hidden, input), wFh: mkv(hidden), bF: mkv(hidden),
           wCx: mkm(hidden, input), wCh: mkv(hidden), bC: mkv(hidden),
           wOx: mkm(hidden, input), wOh: mkv(hidden), bO: mkv(hidden) };
}

function initDeep(inputSize = 13, h1 = 16, h2 = 10): DeepLstmWeights {
  const rnd = seed(41421);
  return {
    version: 'deep-lstm-16-10-T16',
    l1: initLayer(inputSize, h1, rnd),
    l2: initLayer(h1, h2, rnd),
    wOut: Array.from({ length: h2 }, () => (rnd() * 2 - 1) * 0.4),
    bOut: 0, threshold: 0.1,
  };
}

function stepLstm(x: number[], h: number[], c: number[], w: LayerW) {
  const hidden = w.wIx.length;
  const nh: number[] = [], nc: number[] = [];
  for (let i = 0; i < hidden; i++) {
    let iG = w.bI[i], fG = w.bF[i], cG = w.bC[i], oG = w.bO[i];
    for (let j = 0; j < x.length; j++) {
      iG += w.wIx[i][j] * x[j]; fG += w.wFx[i][j] * x[j];
      cG += w.wCx[i][j] * x[j]; oG += w.wOx[i][j] * x[j];
    }
    iG += w.wIh[i] * h[i]; fG += w.wFh[i] * h[i]; cG += w.wCh[i] * h[i]; oG += w.wOh[i] * h[i];
    const iS = sig(iG), fS = sig(fG), cS = tanhF(cG), oS = sig(oG);
    const cNew = fS * c[i] + iS * cS;
    nc.push(cNew); nh.push(oS * tanhF(cNew));
  }
  return { h: nh, c: nc };
}

function widenFeatures(candles: Candle[]): number[] {
  const base = featurize(candles).map((v) => Math.tanh(v / 10));
  const c = candles.map((x) => x.close);
  const a = lastFinite(atr(candles, 14)) || 1;
  const r = lastFinite(rsi(c, 14));
  const e = lastFinite(ema(c, 21));
  const price = c[c.length - 1];
  const priceEma = Math.tanh(((price - e) / a) || 0);
  const rNorm = Math.tanh((r - 50) / 15);
  const rangeAtr = Math.tanh((candles[candles.length - 1].high - candles[candles.length - 1].low) / a);
  const bodyAtr = Math.tanh((candles[candles.length - 1].close - candles[candles.length - 1].open) / a);
  return [...base, priceEma, rNorm, rangeAtr, bodyAtr];
}

export async function deepLstmSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string }> {
  if (!cache) cache = initDeep(13, 16, 10);
  const w = cache;
  const T = 16;
  const minBars = 30;
  const window = candles.length > T + minBars ? candles : candles;
  if (window.length < T + minBars) {
    return { symbol, direction: 'HOLD', confidence: 0, source: 'deep_lstm', reason: 'insufficient', prob: 0.5, version: w.version };
  }
  const seqs: number[][] = [];
  for (let t = 0; t < T; t++) {
    const cut = window.slice(0, window.length - (T - 1 - t));
    if (cut.length < minBars) continue;
    seqs.push(widenFeatures(cut));
  }
  if (!seqs.length) return { symbol, direction: 'HOLD', confidence: 0, source: 'deep_lstm', reason: 'insufficient', prob: 0.5, version: w.version };
  let h1 = Array(w.l1.wIx.length).fill(0), c1 = Array(w.l1.wIx.length).fill(0);
  let h2 = Array(w.l2.wIx.length).fill(0), c2 = Array(w.l2.wIx.length).fill(0);
  for (const x of seqs) {
    const s1 = stepLstm(x, h1, c1, w.l1); h1 = s1.h; c1 = s1.c;
    const s2 = stepLstm(h1, h2, c2, w.l2); h2 = s2.h; c2 = s2.c;
  }
  let out = w.bOut;
  for (let i = 0; i < h2.length; i++) out += w.wOut[i] * h2[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'deep_lstm', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version };
}
