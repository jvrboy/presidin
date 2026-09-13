/** Second scratch MLP (tanh) + ensemble — combines mlp1 (neural.ts), mlp2 (tanh) and logistic (model.ts) into one vote. */
import type { Candle } from './indicators';
import { featurize, loadWeights, type ModelWeights } from './model';
import { forward, loadNeuralWeights, type NeuralWeights } from './neural';
import type { Direction, Signal } from './types';

export interface EnsembleWeights extends NeuralWeights {
  version: string;
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

export function initMlp2(input = 9, h1 = 24, h2 = 12): EnsembleWeights {
  const rng = mulberry32(1337);
  const scale1 = Math.sqrt(2 / input);
  const scale2 = Math.sqrt(2 / h1);
  const scale3 = Math.sqrt(2 / h2);
  const w1 = Array.from({ length: h1 }, () => Array.from({ length: input }, () => (rng() * 2 - 1) * scale1 * 0.4));
  const b1 = Array.from({ length: h1 }, () => (rng() * 2 - 1) * 0.1);
  const w2 = Array.from({ length: h2 }, () => Array.from({ length: h1 }, () => (rng() * 2 - 1) * scale2 * 0.4));
  const b2 = Array.from({ length: h2 }, () => (rng() * 2 - 1) * 0.1);
  const w3 = Array.from({ length: h2 }, () => (rng() * 2 - 1) * scale3 * 0.4);
  return { version: 'mlp2-24x12', w1, b1, w2, b2, w3, b3: 0, threshold: 0.12 };
}

function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
}

export function forwardTanh(features: number[], w: EnsembleWeights): number {
  const h1: number[] = [];
  for (let i = 0; i < w.w1.length; i++) {
    let s = w.b1[i] || 0;
    for (let j = 0; j < features.length; j++) s += (w.w1[i][j] || 0) * features[j];
    h1.push(tanh(s));
  }
  const h2: number[] = [];
  for (let i = 0; i < w.w2.length; i++) {
    let s = w.b2[i] || 0;
    for (let j = 0; j < h1.length; j++) s += (w.w2[i][j] || 0) * h1[j];
    h2.push(tanh(s));
  }
  let out = w.b3 || 0;
  for (let j = 0; j < h2.length; j++) out += (w.w3[j] || 0) * h2[j];
  return 1 / (1 + Math.exp(-out));
}

function logitProb(bias: number, weights: number[], features: number[]): number {
  let z = bias || 0;
  for (let i = 0; i < features.length; i++) z += (weights[i] || 0) * features[i];
  return 1 / (1 + Math.exp(-z));
}

export async function ensembleSignal(
  symbol: string,
  candles: Candle[],
  hfToken?: string
): Promise<Signal & { score: number; neuralVersion: string; prob: number; parts: number[] }> {
  const features = featurize(candles);
  const norm = features.map((x) => Math.tanh(x / 10));

  const [w1, w2, wl] = await Promise.all([
    loadNeuralWeights(hfToken) as Promise<NeuralWeights>,
    Promise.resolve(initMlp2(features.length)) as Promise<EnsembleWeights>,
    loadWeights(hfToken) as Promise<ModelWeights>,
  ]);

  const p1 = forward(norm, w1);
  const p2 = forwardTanh(norm, w2);
  const p3 = logitProb(wl.bias, wl.weights, features);
  const prob = (p1 + p2 + p3) / 3;
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w2.threshold) direction = 'BUY';
  else if (score < -w2.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);

  return {
    symbol,
    direction,
    confidence: Math.round(confidence * 1000) / 1000,
    source: 'ensemble',
    reason: `ensemble ${w1.version}+${w2.version}+${wl.version} p=${prob.toFixed(3)}`,
    score: Math.round(score * 1000) / 1000,
    neuralVersion: `ensemble:${w1.version}+${w2.version}`,
    prob: Math.round(prob * 1000) / 1000,
    parts: [p1, p2, p3].map((p) => Math.round(p * 1000) / 1000),
  };
}
