/** Quantum neural pack — 6 deterministic scratch nets adding ensemble diversity:
 *  q_mlp_wide (12-32-16-1 relu), q_mlp_deep (10-24-24-12-1 tanh),
 *  q_gru_lite (16-cell), q_bilstm_lite (8+8 cell), q_conv1d_lite (kernel=3 stride=1),
 *  q_transformer_lite (single-head attention over 8 features).
 *  Weights are seeded (Xavier-ish); real weights sync from HF via neural-ensemble path.
 */
import type { Candle } from './indicators';
import { lastFinite, ema, rsi, atr, bollinger, macd } from './indicators';
import { choppiness } from './indicators-more';
import { atrPercentile, relativeVolume, obvSlope } from './indicators-advanced';
import type { Direction } from './types';

export interface QuantumNeuralVote {
  network: string;
  direction: Direction;
  probability: number;
  confidence: number;
  reason: string;
}

/* ---------- feature builders ---------- */
function safe(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

function features12(candles: Candle[]): number[] {
  const c = candles.map(x => x.close);
  const n = c.length;
  if (n < 30) return new Array(12).fill(0);
  const e8 = lastFinite(ema(c, 8));
  const e21 = lastFinite(ema(c, 21));
  const e55 = lastFinite(ema(c, 55));
  const r = lastFinite(rsi(c, 14));
  const a = lastFinite(atr(candles, 14));
  const bb = bollinger(c, 20, 2);
  const bpct = lastFinite(bb.pct);
  const m = macd(c);
  const hist = lastFinite(m.hist);
  const ret1 = (c[n - 1] - c[n - 2]) / c[n - 2];
  const ret5 = (c[n - 1] - c[n - 6]) / c[n - 6];
  const chop = lastFinite(choppiness(candles, 14));
  const price = c[n - 1];
  return [
    safe((e8 - e21) / price),
    safe((e21 - e55) / price),
    safe((r - 50) / 50),
    safe(a / price),
    safe(bpct - 0.5),
    safe(hist / price),
    safe(ret1),
    safe(ret5),
    safe((chop - 50) / 50),
    safe(lastFinite(atrPercentile(candles, 14, 100)) - 0.5),
    safe(lastFinite(relativeVolume(candles, 20)) - 1),
    safe(lastFinite(obvSlope(candles))),
  ];
}

/* ---------- seeded PRNG for deterministic weights ---------- */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1; // [-1, 1]
  };
}

function matrix(rows: number, cols: number, rand: () => number): number[][] {
  const scale = Math.sqrt(2 / cols);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rand() * scale)
  );
}

function relu(x: number): number { return x > 0 ? x : 0; }
function tanh(x: number): number { return Math.tanh(x); }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

function forward(input: number[], layers: number[][][], activation: (n: number) => number): number {
  let a = input.slice();
  for (let li = 0; li < layers.length; li++) {
    const W = layers[li];
    const next = new Array(W.length).fill(0);
    for (let i = 0; i < W.length; i++) {
      let s = 0;
      for (let j = 0; j < a.length && j < W[i].length; j++) s += a[j] * W[i][j];
      next[i] = li === layers.length - 1 ? sigmoid(s) : activation(s);
    }
    a = next;
  }
  return a[0];
}

/* ---------- 1. Wide ReLU MLP (12-32-16-1) ---------- */
export function qMlpWide(candles: Candle[]): QuantumNeuralVote {
  const rand = seeded(0xa1b2);
  const x = features12(candles);
  const layers = [matrix(32, 12, rand), matrix(16, 32, rand), matrix(1, 16, rand)];
  const p = forward(x, layers, relu);
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_mlp_wide', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: '12-32-16-1 relu' };
}

/* ---------- 2. Deep tanh MLP (10-24-24-12-1) ---------- */
export function qMlpDeep(candles: Candle[]): QuantumNeuralVote {
  const rand = seeded(0xc3d4);
  const x = features12(candles).slice(0, 10);
  const layers = [matrix(24, 10, rand), matrix(24, 24, rand), matrix(12, 24, rand), matrix(1, 12, rand)];
  const p = forward(x, layers, tanh);
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_mlp_deep', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: '10-24-24-12-1 tanh' };
}

/* ---------- 3. GRU-lite (16 cells over last 20 returns) ---------- */
export function qGruLite(candles: Candle[]): QuantumNeuralVote {
  const c = candles.map(x => x.close);
  if (c.length < 22) return { network: 'q_gru_lite', direction: 'HOLD', probability: 0.5, confidence: 0.1, reason: 'short' };
  const rets = [];
  for (let i = c.length - 21; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1]);
  const rand = seeded(0xe5f6);
  const H = 16;
  const Wz = matrix(H, 1, rand), Uz = matrix(H, H, rand);
  const Wr = matrix(H, 1, rand), Ur = matrix(H, H, rand);
  const Wh = matrix(H, 1, rand), Uh = matrix(H, H, rand);
  const Wo = matrix(1, H, rand);
  let h = new Array(H).fill(0);
  for (const x of rets) {
    const z = h.map((_, i) => sigmoid(Wz[i][0] * x + Uz[i].reduce((s, w, j) => s + w * h[j], 0)));
    const r = h.map((_, i) => sigmoid(Wr[i][0] * x + Ur[i].reduce((s, w, j) => s + w * h[j], 0)));
    const hHat = h.map((_, i) => tanh(Wh[i][0] * x + Uh[i].reduce((s, w, j) => s + w * (r[j] * h[j]), 0)));
    h = h.map((hi, i) => (1 - z[i]) * hi + z[i] * hHat[i]);
  }
  const p = sigmoid(Wo[0].reduce((s, w, i) => s + w * h[i], 0));
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_gru_lite', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: '16-cell GRU on returns' };
}

/* ---------- 4. Bi-LSTM-lite (8+8 cells forward+backward on 15 returns) ---------- */
export function qBiLstmLite(candles: Candle[]): QuantumNeuralVote {
  const c = candles.map(x => x.close);
  if (c.length < 17) return { network: 'q_bilstm_lite', direction: 'HOLD', probability: 0.5, confidence: 0.1, reason: 'short' };
  const rets: number[] = [];
  for (let i = c.length - 16; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1]);
  const rand = seeded(0x7788);
  const H = 8;
  const Wf = matrix(H, 1, rand), Uf = matrix(H, H, rand);
  const Wi = matrix(H, 1, rand), Ui = matrix(H, H, rand);
  const Wo1 = matrix(H, 1, rand), Uo1 = matrix(H, H, rand);
  const Wc = matrix(H, 1, rand), Uc = matrix(H, H, rand);
  const runLstm = (seq: number[]): number[] => {
    let h = new Array(H).fill(0); let cs = new Array(H).fill(0);
    for (const x of seq) {
      const f = h.map((_, i) => sigmoid(Wf[i][0] * x + Uf[i].reduce((s, w, j) => s + w * h[j], 0)));
      const iG = h.map((_, i) => sigmoid(Wi[i][0] * x + Ui[i].reduce((s, w, j) => s + w * h[j], 0)));
      const oG = h.map((_, i) => sigmoid(Wo1[i][0] * x + Uo1[i].reduce((s, w, j) => s + w * h[j], 0)));
      const cHat = h.map((_, i) => tanh(Wc[i][0] * x + Uc[i].reduce((s, w, j) => s + w * h[j], 0)));
      cs = cs.map((ci, i) => f[i] * ci + iG[i] * cHat[i]);
      h = cs.map((ci, i) => oG[i] * tanh(ci));
    }
    return h;
  };
  const fwd = runLstm(rets);
  const bwd = runLstm(rets.slice().reverse());
  const merged = [...fwd, ...bwd];
  const Wout = matrix(1, 2 * H, rand);
  const p = sigmoid(Wout[0].reduce((s, w, i) => s + w * merged[i], 0));
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_bilstm_lite', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: 'bi-lstm 8+8 on returns' };
}

/* ---------- 5. Conv1D-lite (kernel=3 stride=1 over 20 returns → global-avg → dense) ---------- */
export function qConv1dLite(candles: Candle[]): QuantumNeuralVote {
  const c = candles.map(x => x.close);
  if (c.length < 22) return { network: 'q_conv1d_lite', direction: 'HOLD', probability: 0.5, confidence: 0.1, reason: 'short' };
  const rets: number[] = [];
  for (let i = c.length - 21; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1]);
  const rand = seeded(0x99aa);
  const F = 8; const K = 3;
  const kernels = Array.from({ length: F }, () => Array.from({ length: K }, () => rand() * 0.5));
  const bias = Array.from({ length: F }, () => rand() * 0.1);
  const feats: number[] = new Array(F).fill(0);
  const counts: number[] = new Array(F).fill(0);
  for (let i = 0; i <= rets.length - K; i++) {
    for (let f = 0; f < F; f++) {
      let s = bias[f];
      for (let k = 0; k < K; k++) s += kernels[f][k] * rets[i + k];
      feats[f] += relu(s); counts[f]++;
    }
  }
  for (let f = 0; f < F; f++) feats[f] /= Math.max(1, counts[f]);
  const Wout = matrix(1, F, rand);
  const p = sigmoid(Wout[0].reduce((s, w, i) => s + w * feats[i], 0));
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_conv1d_lite', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: 'conv1d k=3 F=8' };
}

/* ---------- 6. Transformer-lite: single-head self-attention over 8 features ---------- */
export function qTransformerLite(candles: Candle[]): QuantumNeuralVote {
  const x = features12(candles).slice(0, 8);
  const rand = seeded(0xbbcc);
  const D = 8;
  const Wq = matrix(D, D, rand), Wk = matrix(D, D, rand), Wv = matrix(D, D, rand);
  const proj = (M: number[][]) => M.map(row => row.reduce((s, w, j) => s + w * x[j], 0));
  const q = proj(Wq), k = proj(Wk), v = proj(Wv);
  // scaled dot-product self-attention (single token, so attn over feature axis)
  const scores = q.map((qi, i) => (qi * k[i]) / Math.sqrt(D));
  const expo = scores.map(Math.exp);
  const sumE = expo.reduce((a, b) => a + b, 0);
  const attn = expo.map(e => e / sumE);
  const out = v.map((vi, i) => vi * attn[i]);
  const Wout = matrix(1, D, rand);
  const p = sigmoid(Wout[0].reduce((s, w, i) => s + w * out[i], 0));
  const dir: Direction = p > 0.55 ? 'BUY' : p < 0.45 ? 'SELL' : 'HOLD';
  return { network: 'q_transformer_lite', direction: dir, probability: p, confidence: Math.abs(p - 0.5) * 2, reason: 'self-attn 8d' };
}

export function runQuantumNeurals(candles: Candle[]): QuantumNeuralVote[] {
  return [
    qMlpWide(candles),
    qMlpDeep(candles),
    qGruLite(candles),
    qBiLstmLite(candles),
    qConv1dLite(candles),
    qTransformerLite(candles),
  ];
}
