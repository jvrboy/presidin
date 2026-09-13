// Lightweight analytics engine for the Heatmap tab.
// Pure functions — no DOM, no network. Fed by tick + candle streams from Deriv.

import type { Candle } from "./indicators";

export interface Tick {
  epoch: number;
  quote: number;
}

// ---------- Volume profile ----------
export interface VPNode {
  price: number;
  volume: number;
}
export interface VolumeProfile {
  nodes: VPNode[];
  poc: number; // point of control (highest-volume price)
  vah: number; // value-area high (70%)
  val: number; // value-area low
  binSize: number;
  min: number;
  max: number;
}

export function buildVolumeProfile(candles: Candle[], bins = 48): VolumeProfile | null {
  if (!candles.length) return null;
  let min = Infinity,
    max = -Infinity;
  for (const c of candles) {
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
  }
  if (!isFinite(min) || !isFinite(max) || max === min) return null;
  const binSize = (max - min) / bins;
  const buckets = new Array(bins).fill(0);
  for (const c of candles) {
    const lo = Math.floor((c.low - min) / binSize);
    const hi = Math.min(bins - 1, Math.floor((c.high - min) / binSize));
    const span = Math.max(1, hi - lo + 1);
    const per = (c.volume || 1) / span;
    for (let i = lo; i <= hi; i++) buckets[i] += per;
  }
  const nodes: VPNode[] = buckets.map((v, i) => ({ price: min + (i + 0.5) * binSize, volume: v }));
  const pocIdx = buckets.indexOf(Math.max(...buckets));
  // Value area: expand from POC until 70% volume covered
  const total = buckets.reduce((a, b) => a + b, 0);
  let lo = pocIdx,
    hi = pocIdx,
    acc = buckets[pocIdx];
  while (acc < total * 0.7 && (lo > 0 || hi < bins - 1)) {
    const left = lo > 0 ? buckets[lo - 1] : -1;
    const right = hi < bins - 1 ? buckets[hi + 1] : -1;
    if (right >= left) {
      hi++;
      acc += buckets[hi];
    } else {
      lo--;
      acc += buckets[lo];
    }
  }
  return {
    nodes,
    poc: min + (pocIdx + 0.5) * binSize,
    vah: min + (hi + 1) * binSize,
    val: min + lo * binSize,
    binSize,
    min,
    max,
  };
}

// ---------- Swing detection + Fibonacci ----------
export interface Swing {
  highIdx: number;
  highPrice: number;
  lowIdx: number;
  lowPrice: number;
  dir: "up" | "down";
}
export interface FibLevels {
  dir: "up" | "down";
  high: number;
  low: number;
  levels: { ratio: number; price: number }[];
}

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function detectSwing(candles: Candle[], lookback = 60): Swing | null {
  if (candles.length < 5) return null;
  const slice = candles.slice(-lookback);
  let hi = 0,
    lo = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high > slice[hi].high) hi = i;
    if (slice[i].low < slice[lo].low) lo = i;
  }
  const start = candles.length - slice.length;
  return {
    highIdx: start + hi,
    highPrice: slice[hi].high,
    lowIdx: start + lo,
    lowPrice: slice[lo].low,
    dir: hi > lo ? "up" : "down",
  };
}

export function fibLevels(s: Swing): FibLevels {
  const range = s.highPrice - s.lowPrice;
  return {
    dir: s.dir,
    high: s.highPrice,
    low: s.lowPrice,
    levels: FIB_RATIOS.map((r) => ({
      ratio: r,
      price: s.dir === "up" ? s.highPrice - range * r : s.lowPrice + range * r,
    })),
  };
}

// ---------- Support / Resistance + Supply / Demand zones ----------
export interface SRLevel {
  price: number;
  touches: number;
  strength: number;
}
export interface SDZone {
  top: number;
  bottom: number;
  kind: "supply" | "demand";
  strength: number;
}

export function findSRLevels(vp: VolumeProfile, topN = 5): SRLevel[] {
  const sorted = [...vp.nodes].sort((a, b) => b.volume - a.volume).slice(0, topN);
  const maxVol = sorted[0]?.volume || 1;
  return sorted.map((n) => ({
    price: n.price,
    touches: Math.round((n.volume / maxVol) * 10),
    strength: n.volume / maxVol,
  }));
}

// Detect "rapid departure" zones: candle bodies where price moved >= 2× ATR.
export function findSupplyDemand(candles: Candle[], lookback = 80): SDZone[] {
  if (candles.length < 20) return [];
  const slice = candles.slice(-lookback);
  const trs = slice.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(
          c.high - c.low,
          Math.abs(c.high - slice[i - 1].close),
          Math.abs(c.low - slice[i - 1].close),
        ),
  );
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  const zones: SDZone[] = [];
  for (let i = 1; i < slice.length - 1; i++) {
    const c = slice[i];
    const body = Math.abs(c.close - c.open);
    if (body < 1.6 * atr) continue;
    const bullish = c.close > c.open;
    const base = slice[i - 1];
    zones.push({
      top: Math.max(base.high, base.open, base.close),
      bottom: Math.min(base.low, base.open, base.close),
      kind: bullish ? "demand" : "supply",
      strength: Math.min(1, body / (atr * 3)),
    });
  }
  // Merge overlapping zones of same kind
  const merged: SDZone[] = [];
  for (const z of zones.sort((a, b) => b.top - a.top)) {
    const last = merged[merged.length - 1];
    if (last && last.kind === z.kind && z.top >= last.bottom && z.bottom <= last.top) {
      last.top = Math.max(last.top, z.top);
      last.bottom = Math.min(last.bottom, z.bottom);
      last.strength = Math.max(last.strength, z.strength);
    } else merged.push({ ...z });
  }
  return merged.slice(0, 8);
}

// ---------- Synthetic order flow from ticks ----------
export interface OrderFlow {
  buyVol: number;
  sellVol: number;
  delta: number; // buyVol - sellVol over window
  imbalance: number; // -1..1
  cvd: number[]; // rolling cumulative delta
  lastQuote: number | null;
}

export function computeOrderFlow(ticks: Tick[]): OrderFlow {
  let buy = 0,
    sell = 0;
  const cvd: number[] = [];
  let acc = 0;
  for (let i = 1; i < ticks.length; i++) {
    const d = ticks[i].quote - ticks[i - 1].quote;
    if (d > 0) {
      buy += 1;
      acc += 1;
    } else if (d < 0) {
      sell += 1;
      acc -= 1;
    }
    cvd.push(acc);
  }
  const total = buy + sell || 1;
  return {
    buyVol: buy,
    sellVol: sell,
    delta: buy - sell,
    imbalance: (buy - sell) / total,
    cvd,
    lastQuote: ticks.length ? ticks[ticks.length - 1].quote : null,
  };
}

// ---------- Heatmap matrix (Time × Price → intensity) ----------
export interface HeatCell {
  x: number;
  y: number;
  v: number;
}

export function buildHeatmap(
  candles: Candle[],
  priceBins = 48,
  timeBins?: number,
): {
  cells: HeatCell[];
  max: number;
  min: number;
  priceMin: number;
  priceMax: number;
  cols: number;
  rows: number;
} {
  const cols = timeBins ?? Math.min(120, candles.length);
  const rows = priceBins;
  const start = candles.length - cols;
  const slice = candles.slice(Math.max(0, start));
  let pmin = Infinity,
    pmax = -Infinity;
  for (const c of slice) {
    if (c.low < pmin) pmin = c.low;
    if (c.high > pmax) pmax = c.high;
  }
  if (!isFinite(pmin) || pmax === pmin)
    return { cells: [], max: 0, min: 0, priceMin: 0, priceMax: 0, cols, rows };
  const binSize = (pmax - pmin) / rows;
  const grid: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let x = 0; x < slice.length; x++) {
    const c = slice[x];
    const lo = Math.floor((c.low - pmin) / binSize);
    const hi = Math.min(rows - 1, Math.floor((c.high - pmin) / binSize));
    const per = (c.volume || 1) / Math.max(1, hi - lo + 1);
    // Boost intensity at body
    const bodyLo = Math.floor((Math.min(c.open, c.close) - pmin) / binSize);
    const bodyHi = Math.min(rows - 1, Math.floor((Math.max(c.open, c.close) - pmin) / binSize));
    for (let y = lo; y <= hi; y++) grid[x][y] += per * 0.6;
    for (let y = bodyLo; y <= bodyHi; y++) grid[x][y] += per * 1.4;
  }
  const cells: HeatCell[] = [];
  let max = 0,
    min = Infinity;
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      const v = grid[x]?.[y] ?? 0;
      if (v > max) max = v;
      if (v && v < min) min = v;
      cells.push({ x, y, v });
    }
  return { cells, max, min: isFinite(min) ? min : 0, priceMin: pmin, priceMax: pmax, cols, rows };
}

// ---------- Confluence / Accuracy probability ----------
export interface AccuracyInput {
  price: number;
  vp: VolumeProfile | null;
  fib: FibLevels | null;
  sr: SRLevel[];
  zones: SDZone[];
  flow: OrderFlow;
  strategies?: { name: string; side: "BUY" | "SELL"; weight: number; note: string }[];
}
export interface AccuracyResult {
  score: number; // 0..100
  bias: "BUY" | "SELL" | "NEUTRAL";
  reasons: string[];
}

export interface AccuracyWeights {
  fib: number;
  sd: number;
  orderFlow: number;
  volumeProfile: number;
}
const DEFAULT_WEIGHTS: AccuracyWeights = { fib: 1, sd: 1, orderFlow: 1, volumeProfile: 1 };

export function scoreAccuracy(
  i: AccuracyInput,
  w: AccuracyWeights = DEFAULT_WEIGHTS,
): AccuracyResult {
  const reasons: string[] = [];
  let bull = 0,
    bear = 0;
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Volume Profile POC / VA
  if (i.vp) {
    const tol = i.vp.binSize * 1.5;
    if (near(i.price, i.vp.poc, tol)) {
      reasons.push("At POC (high-volume node)");
      bull += 8 * w.volumeProfile;
      bear += 8 * w.volumeProfile;
    }
    if (i.price <= i.vp.val) {
      reasons.push("Below Value Area Low — discount");
      bull += 12 * w.volumeProfile;
    }
    if (i.price >= i.vp.vah) {
      reasons.push("Above Value Area High — premium");
      bear += 12 * w.volumeProfile;
    }
  }

  // Fibonacci confluence
  if (i.fib) {
    const range = Math.abs(i.fib.high - i.fib.low);
    const tol = range * 0.012;
    for (const lvl of i.fib.levels) {
      if (near(i.price, lvl.price, tol)) {
        const golden = lvl.ratio === 0.618 || lvl.ratio === 0.5;
        const wt = (golden ? 18 : 10) * w.fib;
        reasons.push(`At Fib ${lvl.ratio} (${i.fib.dir})`);
        if (i.fib.dir === "up") bull += wt;
        else bear += wt;
        break;
      }
    }
  }

  // S/R proximity
  for (const r of i.sr) {
    if (near(i.price, r.price, (i.vp?.binSize ?? 0) * 1.5)) {
      reasons.push(`At S/R ${r.price.toFixed(5)} (${r.touches} touches)`);
      bull += 8 * r.strength * w.volumeProfile;
      bear += 8 * r.strength * w.volumeProfile;
      break;
    }
  }

  // Supply / Demand zones
  for (const z of i.zones) {
    if (i.price >= z.bottom && i.price <= z.top) {
      const wt = 18 * z.strength * w.sd;
      reasons.push(`Inside ${z.kind === "demand" ? "Demand" : "Supply"} zone`);
      if (z.kind === "demand") bull += wt;
      else bear += wt;
      break;
    }
  }

  // Order flow imbalance
  if (Math.abs(i.flow.imbalance) > 0.15) {
    const wt = Math.min(20, Math.abs(i.flow.imbalance) * 40) * w.orderFlow;
    if (i.flow.imbalance > 0) {
      reasons.push(`Bullish order-flow imbalance ${(i.flow.imbalance * 100).toFixed(0)}%`);
      bull += wt;
    } else {
      reasons.push(
        `Bearish order-flow imbalance ${(Math.abs(i.flow.imbalance) * 100).toFixed(0)}%`,
      );
      bear += wt;
    }
  }

  // Discretionary strategy confluence (BTMM / MSNR / Alchemist / CRT / VSA / Order-Flow)
  if (i.strategies && i.strategies.length) {
    for (const s of i.strategies) {
      reasons.push(`${s.name}: ${s.note}`);
      if (s.side === "BUY") bull += s.weight;
      else bear += s.weight;
    }
  }

  const score = Math.min(100, Math.max(bull, bear));
  const bias: "BUY" | "SELL" | "NEUTRAL" =
    Math.abs(bull - bear) < 6 ? "NEUTRAL" : bull > bear ? "BUY" : "SELL";
  return { score: Math.round(score), bias, reasons: reasons.slice(0, 10) };
}
