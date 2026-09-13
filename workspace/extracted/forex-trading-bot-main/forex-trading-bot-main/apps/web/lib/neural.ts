/**
 * Scratch multi-layer perceptron (no deps).
 * Weights loadable from HF (neural_weights.json) or seeded defaults.
 * Architecture: input(9) → hidden(16) → hidden(8) → output(1) sigmoid
 */

import type { Candle } from './indicators';
import { featurize, FEATURE_NAMES } from './model';
import type { Direction, Signal } from './types';

export interface NeuralWeights {
  version: string;
  w1: number[][]; // [hidden][input]
  b1: number[];
  w2: number[][]; // [hidden2][hidden]
  b2: number[];
  w3: number[]; // [hidden2] → 1
  b3: number;
  threshold: number;
}

function randn(): number {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function initWeights(input = 9, h1 = 16, h2 = 8): NeuralWeights {
  const scale1 = Math.sqrt(2 / input);
  const scale2 = Math.sqrt(2 / h1);
  const scale3 = Math.sqrt(2 / h2);
  const w1 = Array.from({ length: h1 }, () =>
    Array.from({ length: input }, () => randn() * scale1 * 0.3)
  );
  const b1 = Array(h1).fill(0);
  const w2 = Array.from({ length: h2 }, () =>
    Array.from({ length: h1 }, () => randn() * scale2 * 0.3)
  );
  const b2 = Array(h2).fill(0);
  const w3 = Array.from({ length: h2 }, () => randn() * scale3 * 0.3);
  return {
    version: 'scratch-mlp-seed',
    w1,
    b1,
    w2,
    b2,
    w3,
    b3: 0,
    threshold: 0.12,
  };
}

function isValidNeuralWeights(value: unknown, inputSize: number): value is NeuralWeights {
  const data = value as NeuralWeights;
  return Boolean(
    data && typeof data.version === 'string' &&
    Array.isArray(data.w1) && data.w1.length > 0 && data.w1.every((row) => Array.isArray(row) && row.length === inputSize && row.every((x) => Number.isFinite(x) && Math.abs(x) <= 20)) &&
    Array.isArray(data.b1) && data.b1.length === data.w1.length && data.b1.every(Number.isFinite) &&
    Array.isArray(data.w2) && data.w2.length > 0 && data.w2.every((row) => Array.isArray(row) && row.length === data.w1.length && row.every((x) => Number.isFinite(x) && Math.abs(x) <= 20)) &&
    Array.isArray(data.b2) && data.b2.length === data.w2.length && data.b2.every(Number.isFinite) &&
    Array.isArray(data.w3) && data.w3.length === data.w2.length && data.w3.every((x) => Number.isFinite(x) && Math.abs(x) <= 20) &&
    Number.isFinite(data.b3) && Number.isFinite(data.threshold) && data.threshold >= 0.05 && data.threshold <= 0.45
  );
}

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function sigmoid(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function forward(features: number[], w: NeuralWeights): number {
  const h1: number[] = [];
  for (let i = 0; i < w.w1.length; i++) {
    let s = w.b1[i] || 0;
    for (let j = 0; j < features.length; j++) s += (w.w1[i][j] || 0) * features[j];
    h1.push(relu(s));
  }
  const h2: number[] = [];
  for (let i = 0; i < w.w2.length; i++) {
    let s = w.b2[i] || 0;
    for (let j = 0; j < h1.length; j++) s += (w.w2[i][j] || 0) * h1[j];
    h2.push(relu(s));
  }
  let out = w.b3 || 0;
  for (let j = 0; j < h2.length; j++) out += (w.w3[j] || 0) * h2[j];
  return sigmoid(out);
}

let cached: NeuralWeights | null = null;
let cachedAt = 0;
const CACHE_MS = 30 * 60 * 1000;

export async function loadNeuralWeights(hfToken?: string): Promise<NeuralWeights> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const repo = process.env.HF_MODEL_REPO || 'justinsimpsad/forex-bot-weights';
  const url = `https://huggingface.co/${repo}/resolve/main/neural_weights.json`;
  try {
    const headers: Record<string, string> = {};
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as NeuralWeights;
      if (isValidNeuralWeights(data, FEATURE_NAMES.length)) {
        cached = data;
        cachedAt = now;
        return data;
      }
    }
  } catch {
    /* seed */
  }
  cached = initWeights(FEATURE_NAMES.length);
  cachedAt = now;
  return cached;
}

export async function neuralSignal(
  symbol: string,
  candles: Candle[],
  hfToken?: string
): Promise<Signal & { score: number; neuralVersion: string; prob: number }> {
  const w = await loadNeuralWeights(hfToken);
  const features = featurize(candles);
  // light feature norm
  const norm = features.map((x) => Math.tanh(x / 10));
  const prob = forward(norm, w);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);

  return {
    symbol,
    direction,
    confidence: Math.round(confidence * 1000) / 1000,
    source: 'neural',
    reason: `mlp ${w.version} p=${prob.toFixed(3)}`,
    score: Math.round(score * 1000) / 1000,
    neuralVersion: w.version,
    prob: Math.round(prob * 1000) / 1000,
  };
}
