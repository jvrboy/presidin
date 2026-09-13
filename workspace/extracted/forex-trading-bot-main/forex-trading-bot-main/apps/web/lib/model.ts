/**
 * Lightweight logistic regression signal model.
 * Weights from HuggingFace (justinsimpsad/forex-bot-weights) or defaults.
 * Fetch order: resolve/latest (trained) -> resolve/main -> bundled defaults.
 */

import type { Candle } from './indicators';
import { ema, rsi, macd, bollinger, atr, lastFinite, roc } from './indicators';
import type { Direction, Signal } from './types';

export interface ModelWeights {
  version: string;
  bias: number;
  weights: number[];
  threshold: number;
  trained_at?: string;
  samples?: number;
  accuracy?: number;
}

export const FEATURE_NAMES = [
  'ret_1',
  'ret_5',
  'rsi_14',
  'macd_hist',
  'bb_pct',
  'ema_spread',
  'roc_12',
  'atr_pct',
  'vol_z',
] as const;

const DEFAULT_WEIGHTS: ModelWeights = {
  version: 'default-v1',
  bias: 0,
  weights: [0.4, 0.3, -0.015, 0.8, -0.5, 0.6, 0.2, -0.1, 0.05],
  threshold: 0.12,
};

let cached: ModelWeights | null = null;
let cachedAt = 0;
const CACHE_MS = 30 * 60 * 1000;

export function featurize(candles: Candle[]): number[] {
  const c = candles.map((x) => x.close);
  const n = c.length;
  if (n < 30) return Array(FEATURE_NAMES.length).fill(0);

  const last = c[n - 1];
  const ret1 = n > 1 ? (last - c[n - 2]) / c[n - 2] : 0;
  const ret5 = n > 5 ? (last - c[n - 6]) / c[n - 6] : 0;
  const r = lastFinite(rsi(c, 14));
  const m = macd(c);
  const hist = lastFinite(m.hist);
  const bb = bollinger(c, 20, 2);
  const pct = lastFinite(bb.pct);
  const e9 = lastFinite(ema(c, 9));
  const e21 = lastFinite(ema(c, 21));
  const spread = e21 !== 0 ? (e9 - e21) / e21 : 0;
  const rocv = lastFinite(roc(c, 12));
  const atrv = lastFinite(atr(candles, 14));
  const atrPct = last !== 0 ? atrv / last : 0;

  const rets: number[] = [];
  for (let i = Math.max(1, n - 20); i < n; i++) {
    rets.push((c[i] - c[i - 1]) / c[i - 1]);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const std =
    Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1)) || 1;
  const volZ = (ret1 - mean) / std;

  return [ret1 * 100, ret5 * 100, r, hist, pct, spread * 100, rocv, atrPct * 100, volZ];
}

function sigmoid(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

async function fetchWeights(url: string, hfToken?: string): Promise<ModelWeights | null> {
  try {
    const headers: Record<string, string> = {};
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as ModelWeights;
      if (
        typeof data.version === 'string' &&
        Number.isFinite(data.bias) &&
        Number.isFinite(data.threshold) &&
        data.threshold >= 0.05 && data.threshold <= 0.45 &&
        Array.isArray(data.weights) &&
        data.weights.length === FEATURE_NAMES.length &&
        data.weights.every((weight) => Number.isFinite(weight) && Math.abs(weight) <= 20)
      ) {
        return { ...data, threshold: Math.min(0.45, Math.max(0.05, data.threshold)) };
      }
    }
  } catch {
    /* fall through to next source */
  }
  return null;
}

export async function loadWeights(hfToken?: string): Promise<ModelWeights> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const repo = process.env.HF_MODEL_REPO || 'justinsimpsad/forex-bot-weights';
  const base = `https://huggingface.co/${repo}/resolve`;

  const data =
    (await fetchWeights(`${base}/latest/weights.json`, hfToken)) ??
    (await fetchWeights(`${base}/main/weights.json`, hfToken));

  cached = data ?? DEFAULT_WEIGHTS;
  cachedAt = now;
  return cached;
}

export async function modelSignal(
  symbol: string,
  candles: Candle[],
  hfToken?: string
): Promise<Signal & { score: number; modelVersion: string; features: number[] }> {
  const w = await loadWeights(hfToken);
  const features = featurize(candles);
  let z = w.bias;
  for (let i = 0; i < features.length; i++) {
    z += (w.weights[i] || 0) * features[i];
  }
  const prob = sigmoid(z);
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
    source: 'model',
    reason: `lr ${w.version} p=${prob.toFixed(3)}`,
    score: Math.round(score * 1000) / 1000,
    modelVersion: w.version,
    features,
  };
}

export { DEFAULT_WEIGHTS };
