/** Regime-gated MLP (mlp3) — 3 hidden layers, leaky-relu, gated by regime features (chop, hurst, vol rank). */
import type { Candle } from './indicators';
import { featurize } from './model';
import { regimeSnapshot } from './indicators-regime';
import type { Direction, Signal } from './types';

export interface RegimeWeights {
  version: string;
  w1: number[][]; b1: number[];
  w2: number[][]; b2: number[];
  w3: number[][]; b3: number[];
  w4: number[]; b4: number;
  threshold: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leaky(x: number): number { return x > 0 ? x : 0.01 * x; }
function sigmoid(x: number): number { if (x > 20) return 1; if (x < -20) return 0; return 1 / (1 + Math.exp(-x)); }

let cached: RegimeWeights | null = null;

function initRegimeMlp(input = 12, h1 = 32, h2 = 20, h3 = 10): RegimeWeights {
  const rng = mulberry32(9721);
  const s1 = Math.sqrt(2 / input); const s2 = Math.sqrt(2 / h1); const s3 = Math.sqrt(2 / h2); const s4 = Math.sqrt(2 / h3);
  const mk2 = (a: number, b: number, s: number) => Array.from({ length: a }, () => Array.from({ length: b }, () => (rng() * 2 - 1) * s * 0.35));
  const mk1 = (a: number) => Array.from({ length: a }, () => (rng() * 2 - 1) * 0.08);
  return {
    version: 'mlp3-regime-32x20x10',
    w1: mk2(h1, input, s1), b1: mk1(h1),
    w2: mk2(h2, h1, s2), b2: mk1(h2),
    w3: mk2(h3, h2, s3), b3: mk1(h3),
    w4: Array.from({ length: h3 }, () => (rng() * 2 - 1) * s4 * 0.35), b4: 0,
    threshold: 0.1,
  };
}

function forwardRegime(features: number[], w: RegimeWeights): number {
  const h1: number[] = [];
  for (let i = 0; i < w.w1.length; i++) {
    let s = w.b1[i] || 0;
    for (let j = 0; j < features.length; j++) s += (w.w1[i][j] || 0) * features[j];
    h1.push(leaky(s));
  }
  const h2: number[] = [];
  for (let i = 0; i < w.w2.length; i++) {
    let s = w.b2[i] || 0;
    for (let j = 0; j < h1.length; j++) s += (w.w2[i][j] || 0) * h1[j];
    h2.push(leaky(s));
  }
  const h3: number[] = [];
  for (let i = 0; i < w.w3.length; i++) {
    let s = w.b3[i] || 0;
    for (let j = 0; j < h2.length; j++) s += (w.w3[i][j] || 0) * h2[j];
    h3.push(leaky(s));
  }
  let out = w.b4 || 0;
  for (let j = 0; j < h3.length; j++) out += (w.w4[j] || 0) * h3[j];
  return sigmoid(out);
}

export async function regimeMlpSignal(symbol: string, candles: Candle[]): Promise<Signal & { score: number; prob: number; regime: any }> {
  if (!cached) cached = initRegimeMlp(12);
  const base = featurize(candles);
  const r = regimeSnapshot(candles);
  const norm = base.map((x) => Math.tanh(x / 10));
  const regimeFeats = [
    Math.tanh((r.hurst - 0.5) * 4),
    Math.tanh((r.volRank - 0.5) * 2),
    Math.tanh((r.er - 0.3) * 4),
    Math.tanh(r.tqi),
  ];
  const isTrend = r.zone === 'TREND' ? 1 : r.zone === 'RANGE' ? -1 : 0;
  regimeFeats[0] *= 1 + Math.abs(isTrend) * 0.5;
  const input = [...norm.slice(0, 8), ...regimeFeats];
  const prob = forwardRegime(input, cached);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > cached.threshold) direction = 'BUY';
  else if (score < -cached.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return {
    symbol, direction,
    confidence: Math.round(confidence * 1000) / 1000,
    source: 'neural_regime',
    reason: `mlp3 ${cached.version} p=${prob.toFixed(3)} zone=${r.zone}`,
    score: Math.round(score * 1000) / 1000,
    prob: Math.round(prob * 1000) / 1000,
    regime: { hurst: r.hurst, volRank: r.volRank, er: r.er, tqi: r.tqi, zone: r.zone },
  };
}
