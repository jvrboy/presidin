/** Deep neural networks: LSTM-lite, GRU, TCN-lite, deep-residual MLP, small transformer with self-attention.
 *  All deterministic, seeded, no external deps. Feature source: model.featurize(candles).
 */
import type { Candle } from './indicators';
import { featurize } from './model';
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
const relu = (x: number) => (x > 0 ? x : 0);

/* ------------------ LSTM-lite (single cell, 12 hidden, unrolled over T=8 windows) ------------------ */
interface LSTMWeights { version: string; wIx: number[][]; wIh: number[]; bI: number[]; wFx: number[][]; wFh: number[]; bF: number[]; wCx: number[][]; wCh: number[]; bC: number[]; wOx: number[][]; wOh: number[]; bO: number[]; wOut: number[]; bOut: number; threshold: number; }
let lstmCache: LSTMWeights | null = null;
function initLstm(input = 9, hidden = 12): LSTMWeights {
  const rnd = seed(24681);
  const s1 = Math.sqrt(1 / input);
  const mkm = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * s1 * 0.4));
  const mkv = (r: number) => Array.from({ length: r }, () => (rnd() * 2 - 1) * 0.05);
  return {
    version: 'lstm-lite-12h',
    wIx: mkm(hidden, input), wIh: mkv(hidden), bI: mkv(hidden),
    wFx: mkm(hidden, input), wFh: mkv(hidden), bF: mkv(hidden),
    wCx: mkm(hidden, input), wCh: mkv(hidden), bC: mkv(hidden),
    wOx: mkm(hidden, input), wOh: mkv(hidden), bO: mkv(hidden),
    wOut: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.4), bOut: 0,
    threshold: 0.1,
  };
}
export async function lstmSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string }> {
  if (!lstmCache) lstmCache = initLstm(9, 12);
  const w = lstmCache;
  const T = 8;
  const window = candles.length > T + 30 ? candles.slice(-(T + 30)) : candles;
  const seqs: number[][] = [];
  for (let t = 0; t < T; t++) {
    const cut = window.slice(0, window.length - (T - 1 - t));
    if (cut.length < 30) continue;
    seqs.push(featurize(cut).map((v) => Math.tanh(v / 10)));
  }
  if (!seqs.length) return { symbol, direction: 'HOLD', confidence: 0, source: 'lstm', reason: 'insufficient', prob: 0.5, version: w.version };
  const hidden = w.wIx.length;
  let h = Array(hidden).fill(0);
  let c = Array(hidden).fill(0);
  for (const x of seqs) {
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
    h = nh; c = nc;
  }
  let out = w.bOut;
  for (let i = 0; i < hidden; i++) out += w.wOut[i] * h[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'lstm', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version };
}

/* ------------------ GRU (10 hidden, unrolled T=8) ------------------ */
interface GRUWeights { version: string; wZx: number[][]; wZh: number[]; bZ: number[]; wRx: number[][]; wRh: number[]; bR: number[]; wHx: number[][]; wHh: number[]; bH: number[]; wOut: number[]; bOut: number; threshold: number; }
let gruCache: GRUWeights | null = null;
function initGru(input = 9, hidden = 10): GRUWeights {
  const rnd = seed(31415);
  const s1 = Math.sqrt(1 / input);
  const mkm = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * s1 * 0.4));
  const mkv = (r: number) => Array.from({ length: r }, () => (rnd() * 2 - 1) * 0.05);
  return {
    version: 'gru-10h',
    wZx: mkm(hidden, input), wZh: mkv(hidden), bZ: mkv(hidden),
    wRx: mkm(hidden, input), wRh: mkv(hidden), bR: mkv(hidden),
    wHx: mkm(hidden, input), wHh: mkv(hidden), bH: mkv(hidden),
    wOut: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.4), bOut: 0,
    threshold: 0.1,
  };
}
export async function gruSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string }> {
  if (!gruCache) gruCache = initGru();
  const w = gruCache;
  const T = 8;
  const window = candles.length > T + 30 ? candles.slice(-(T + 30)) : candles;
  const seqs: number[][] = [];
  for (let t = 0; t < T; t++) {
    const cut = window.slice(0, window.length - (T - 1 - t));
    if (cut.length < 30) continue;
    seqs.push(featurize(cut).map((v) => Math.tanh(v / 10)));
  }
  if (!seqs.length) return { symbol, direction: 'HOLD', confidence: 0, source: 'gru', reason: 'insufficient', prob: 0.5, version: w.version };
  const hidden = w.wZx.length;
  let h = Array(hidden).fill(0);
  for (const x of seqs) {
    const nh: number[] = [];
    for (let i = 0; i < hidden; i++) {
      let zG = w.bZ[i], rG = w.bR[i], hG = w.bH[i];
      for (let j = 0; j < x.length; j++) {
        zG += w.wZx[i][j] * x[j]; rG += w.wRx[i][j] * x[j]; hG += w.wHx[i][j] * x[j];
      }
      zG += w.wZh[i] * h[i]; rG += w.wRh[i] * h[i];
      const zS = sig(zG), rS = sig(rG);
      hG += w.wHh[i] * (rS * h[i]);
      const hCand = tanhF(hG);
      nh.push((1 - zS) * h[i] + zS * hCand);
    }
    h = nh;
  }
  let out = w.bOut;
  for (let i = 0; i < hidden; i++) out += w.wOut[i] * h[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'gru', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version };
}

/* ------------------ TCN-lite (2 dilated 1-D conv layers, k=3) ------------------ */
interface TCNWeights { version: string; conv1: number[][]; b1: number[]; conv2: number[][]; b2: number[]; wOut: number[]; bOut: number; threshold: number; }
let tcnCache: TCNWeights | null = null;
function initTcn(input = 9, ch1 = 12, ch2 = 8): TCNWeights {
  const rnd = seed(17171);
  const s1 = Math.sqrt(2 / (input * 3));
  const mkm = (r: number, c: number, s: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * s * 0.4));
  return {
    version: 'tcn-lite-2layer',
    conv1: mkm(ch1, input * 3, s1), b1: Array.from({ length: ch1 }, () => (rnd() * 2 - 1) * 0.05),
    conv2: mkm(ch2, ch1 * 3, Math.sqrt(2 / (ch1 * 3))), b2: Array.from({ length: ch2 }, () => (rnd() * 2 - 1) * 0.05),
    wOut: Array.from({ length: ch2 }, () => (rnd() * 2 - 1) * 0.4), bOut: 0, threshold: 0.1,
  };
}
export async function tcnSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string }> {
  if (!tcnCache) tcnCache = initTcn();
  const w = tcnCache;
  const T = 8;
  const window = candles.length > T + 30 ? candles.slice(-(T + 30)) : candles;
  const seqs: number[][] = [];
  for (let t = 0; t < T; t++) {
    const cut = window.slice(0, window.length - (T - 1 - t));
    if (cut.length < 30) continue;
    seqs.push(featurize(cut).map((v) => Math.tanh(v / 10)));
  }
  if (seqs.length < 5) return { symbol, direction: 'HOLD', confidence: 0, source: 'tcn', reason: 'insufficient', prob: 0.5, version: w.version };
  const F = seqs[0].length;
  // layer 1: 3-wide conv with dilation 1
  const l1: number[][] = [];
  for (let t = 2; t < seqs.length; t++) {
    const flat = [...seqs[t - 2], ...seqs[t - 1], ...seqs[t]];
    const out = w.b1.map((b, ch) => { let s = b; for (let j = 0; j < flat.length; j++) s += w.conv1[ch][j] * flat[j]; return relu(s); });
    l1.push(out);
  }
  // layer 2: 3-wide conv with dilation 2 (samples: t-4, t-2, t)
  const l2: number[][] = [];
  for (let t = 4; t < l1.length; t++) {
    const flat = [...l1[t - 4], ...l1[t - 2], ...l1[t]];
    const out = w.b2.map((b, ch) => { let s = b; for (let j = 0; j < flat.length; j++) s += w.conv2[ch][j] * flat[j]; return relu(s); });
    l2.push(out);
  }
  const last = l2.length ? l2[l2.length - 1] : l1[l1.length - 1] || new Array(w.b2.length).fill(0);
  let out = w.bOut;
  for (let i = 0; i < w.wOut.length && i < last.length; i++) out += w.wOut[i] * last[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'tcn', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version };
}

/* ------------------ Deep-residual MLP (4 layers, skip connections) ------------------ */
interface ResWeights { version: string; layers: { W: number[][]; b: number[] }[]; wOut: number[]; bOut: number; threshold: number; }
let resCache: ResWeights | null = null;
function initRes(input = 9, hidden = 16, depth = 4): ResWeights {
  const rnd = seed(88899);
  const s = Math.sqrt(2 / hidden);
  const mkm = (r: number, c: number, sc: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * sc * 0.4));
  const layers = [];
  const first = { W: mkm(hidden, input, Math.sqrt(2 / input)), b: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.05) };
  layers.push(first);
  for (let k = 1; k < depth; k++) layers.push({ W: mkm(hidden, hidden, s), b: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.05) });
  return { version: 'resmlp-4x16', layers, wOut: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.4), bOut: 0, threshold: 0.1 };
}
export async function residualSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string }> {
  if (!resCache) resCache = initRes();
  const w = resCache;
  const x = featurize(candles).map((v) => Math.tanh(v / 10));
  let h: number[] = [];
  let prev: number[] = [];
  for (let li = 0; li < w.layers.length; li++) {
    const L = w.layers[li];
    const inVec = li === 0 ? x : h;
    const nh: number[] = [];
    for (let i = 0; i < L.W.length; i++) {
      let sum = L.b[i];
      for (let j = 0; j < inVec.length; j++) sum += L.W[i][j] * inVec[j];
      let v = relu(sum);
      if (li > 0 && prev.length === L.W.length) v = v + 0.5 * prev[i];
      nh.push(v);
    }
    prev = li === 0 ? nh : h;
    h = nh;
  }
  let out = w.bOut;
  for (let i = 0; i < h.length && i < w.wOut.length; i++) out += w.wOut[i] * h[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'residual', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version };
}

/* ------------------ Small Transformer (1 layer, 2-head self-attention over T=8 tokens) ------------------ */
interface TrWeights { version: string; wQ: number[][]; wK: number[][]; wV: number[][]; wFf: number[][]; bFf: number[]; wOut: number[]; bOut: number; heads: number; dModel: number; threshold: number; }
let trCache: TrWeights | null = null;
function initTr(dModel = 9, heads = 3): TrWeights {
  const rnd = seed(60613);
  const s = Math.sqrt(1 / dModel);
  const mkm = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => (rnd() * 2 - 1) * s * 0.4));
  return {
    version: 'transformer-1L-3H',
    wQ: mkm(dModel, dModel), wK: mkm(dModel, dModel), wV: mkm(dModel, dModel),
    wFf: mkm(dModel, dModel), bFf: Array.from({ length: dModel }, () => (rnd() * 2 - 1) * 0.05),
    wOut: Array.from({ length: dModel }, () => (rnd() * 2 - 1) * 0.4), bOut: 0,
    heads, dModel, threshold: 0.1,
  };
}
function matmul(x: number[], W: number[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < W.length; i++) {
    let s = 0;
    for (let j = 0; j < x.length; j++) s += W[i][j] * x[j];
    out.push(s);
  }
  return out;
}
function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const es = xs.map((x) => Math.exp(x - m));
  const s = es.reduce((a, b) => a + b, 0) || 1;
  return es.map((e) => e / s);
}
export async function transformerSignal(symbol: string, candles: Candle[]): Promise<Signal & { prob: number; version: string; attn: number[] }> {
  if (!trCache) trCache = initTr();
  const w = trCache;
  const T = 8;
  const window = candles.length > T + 30 ? candles.slice(-(T + 30)) : candles;
  const tokens: number[][] = [];
  for (let t = 0; t < T; t++) {
    const cut = window.slice(0, window.length - (T - 1 - t));
    if (cut.length < 30) continue;
    tokens.push(featurize(cut).map((v) => Math.tanh(v / 10)));
  }
  if (!tokens.length) return { symbol, direction: 'HOLD', confidence: 0, source: 'transformer', reason: 'insufficient', prob: 0.5, version: w.version, attn: [] };
  const Q = tokens.map((tk) => matmul(tk, w.wQ));
  const K = tokens.map((tk) => matmul(tk, w.wK));
  const V = tokens.map((tk) => matmul(tk, w.wV));
  const context: number[][] = [];
  const attnRows: number[][] = [];
  const dK = w.dModel;
  for (let i = 0; i < Q.length; i++) {
    const scores: number[] = [];
    for (let j = 0; j < K.length; j++) {
      let s = 0;
      for (let k = 0; k < Q[i].length; k++) s += Q[i][k] * K[j][k];
      scores.push(s / Math.sqrt(dK));
    }
    const attn = softmax(scores);
    attnRows.push(attn);
    const ctx: number[] = Array(dK).fill(0);
    for (let j = 0; j < V.length; j++) for (let d = 0; d < dK; d++) ctx[d] += attn[j] * V[j][d];
    context.push(ctx);
  }
  const last = context[context.length - 1];
  const ff = w.bFf.map((b, i) => { let s = b; for (let j = 0; j < last.length; j++) s += w.wFf[i][j] * last[j]; return relu(s); });
  let out = w.bOut;
  for (let i = 0; i < ff.length && i < w.wOut.length; i++) out += w.wOut[i] * ff[i];
  const prob = sig(out);
  const score = prob - 0.5;
  let direction: Direction = 'HOLD';
  let confidence = Math.abs(score) * 2;
  if (score > w.threshold) direction = 'BUY';
  else if (score < -w.threshold) direction = 'SELL';
  else confidence = Math.min(confidence, 0.35);
  return { symbol, direction, confidence: Math.round(confidence * 1000) / 1000, source: 'transformer', reason: `${w.version} p=${prob.toFixed(3)}`, prob: Math.round(prob * 1000) / 1000, version: w.version, attn: attnRows[attnRows.length - 1] };
}

export async function runDeepEnsemble(symbol: string, candles: Candle[]) {
  const [lstm, gru, tcn, res, tr] = await Promise.all([
    lstmSignal(symbol, candles),
    gruSignal(symbol, candles),
    tcnSignal(symbol, candles),
    residualSignal(symbol, candles),
    transformerSignal(symbol, candles),
  ]);
  return [lstm, gru, tcn, res, tr];
}
