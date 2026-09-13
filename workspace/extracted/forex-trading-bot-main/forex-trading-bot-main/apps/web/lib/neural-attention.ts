/** Attention-lite NN (mlp4) — 9 features with soft self-attention weighting, then 1 hidden + sigmoid. */
import type { Candle } from './indicators';
import { featurize } from './model';
import type { Direction, Signal } from './types';

export interface AttentionWeights {
  version: string;
  wq: number[]; // per-feature query
  wk: number[]; // per-feature key
  wv: number[]; // per-feature value
  w_hidden: number[][]; // [h][input]
  b_hidden: number[];
  w_out: number[];
  b_out: number;
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

function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const es = xs.map((x) => Math.exp(x - m));
  const s = es.reduce((a, b) => a + b, 0) || 1;
  return es.map((e) => e / s);
}

function tanh(x: number): number { if (x > 20) return 1; if (x < -20) return -1; const e = Math.exp(2 * x); return (e - 1) / (e + 1); }
function sigmoid(x: number): number { if (x > 20) return 1; if (x < -20) return 0; return 1 / (1 + Math.exp(-x)); }

let cached: AttentionWeights | null = null;

function initAttention(n = 9, h = 12): AttentionWeights {
  const rng = mulberry32(2718);
  const rand = (scale = 0.4) => (rng() * 2 - 1) * scale;
  const arr = (k: number, s = 0.4) => Array.from({ length: k }, () => rand(s));
  const mat = (r: number, c: number, s = 0.4) => Array.from({ length: r }, () => arr(c, s));
  return {
    version: 'mlp4-attention-12',
    wq: arr(n, 0.5), wk: arr(n, 0.5), wv: arr(n, 0.5),
    w_hidden: mat(h, n, 0.4), b_hidden: arr(h, 0.1),
    w_out: arr(h, 0.5), b_out: 0,
    threshold: 0.11,
  };
}

function forwardAttention(features: number[], w: AttentionWeights): number {
  const q = features.map((f, i) => f * (w.wq[i] || 0));
  const k = features.map((f, i) => f * (w.wk[i] || 0));
  const v = features.map((f, i) => f * (w.wv[i] || 0));
  const scores = features.map((_, i) => (q[i] * k[i]) / Math.sqrt(features.length));
  const attn = softmax(scores);
  const context = v.map((val, i) => val * attn[i]);
  const h: number[] = [];
  for (let i = 0; i < w.w_hidden.length; i++) {
    let s = w.b_hidden[i] || 0;
    for (let j = 0; j < context.length; j++) s += (w.w_hidden[i][j] || 0) * context[j];
    h.push(tanh(s));
  }
  let out = w.b_out || 0;
  for (let j = 0; j < h.length; j++) out += (w.w_out[j] || 0) * h[j];
  return sigmoid(out);
}

export async function attentionSignal(symbol: string, candles: Candle[]): Promise<Signal & { score: number; prob: number; attn: number[] }> {
  if (!cached) cached = initAttention(9, 12);
  const base = featurize(candles);
  const norm = base.map((x) => Math.tanh(x / 10));
  const prob = forwardAttention(norm, cached);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > cached.threshold) direction = 'BUY';
  else if (score < -cached.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  const q = norm.map((f, i) => f * (cached!.wq[i] || 0));
  const k = norm.map((f, i) => f * (cached!.wk[i] || 0));
  const scores = norm.map((_, i) => (q[i] * k[i]) / Math.sqrt(norm.length));
  const attn = softmax(scores).map((a) => Math.round(a * 1000) / 1000);
  return {
    symbol, direction,
    confidence: Math.round(confidence * 1000) / 1000,
    source: 'neural_attention',
    reason: `mlp4 ${cached.version} p=${prob.toFixed(3)}`,
    score: Math.round(score * 1000) / 1000,
    prob: Math.round(prob * 1000) / 1000,
    attn,
  };
}
