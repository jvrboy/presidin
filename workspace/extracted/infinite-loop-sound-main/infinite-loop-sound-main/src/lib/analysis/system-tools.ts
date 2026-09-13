// New SYSTEM-level technical analysis tools (not indicators).
// These analyze market STRUCTURE / MICROSTRUCTURE rather than plotting lines.
// Pure functions, no external deps. Used by the new routes.

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

// ---------- Market Regime Engine ----------
export type Regime = "trending-up" | "trending-down" | "ranging" | "volatile" | "quiet";

export function atr(candles: { h: number; l: number; c: number }[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].h,
      l = candles[i].l,
      pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-Math.min(period, trs.length));
  return slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
}

export function pseudoAdx(candles: { h: number; l: number; c: number }[], period = 14): number {
  if (candles.length < period + 1) return 0;
  let plusDM = 0,
    minusDM = 0,
    tr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    if (up > down && up > 0) plusDM += up;
    if (down > up && down > 0) minusDM += down;
    tr += Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c),
    );
  }
  if (tr === 0) return 0;
  return Math.min(100, (Math.abs(plusDM - minusDM) / tr) * 100 * 1.6);
}

export function detectRegime(candles: Candle[]): {
  regime: Regime;
  adx: number;
  volPct: number;
  drift: number;
  confidence: number;
  approach: string;
} {
  if (candles.length < 20) {
    return {
      regime: "quiet",
      adx: 0,
      volPct: 0,
      drift: 0,
      confidence: 0,
      approach: "Insufficient data.",
    };
  }
  const closes = candles.map((c) => c.c);
  const a = atr(candles);
  const adx = pseudoAdx(candles);
  const mean = closes.reduce((x, y) => x + y, 0) / closes.length;
  const volPct = mean ? (a / mean) * 100 : 0;
  const ret = closes
    .slice(-20)
    .map((v, i, arr) => (i === 0 ? 0 : (v - arr[i - 1]) / (arr[i - 1] || 1)));
  const drift = ret.reduce((x, y) => x + y, 0);
  const noise = Math.sqrt(ret.reduce((s, r) => s + r * r, 0) / ret.length) || 0.0001;

  let regime: Regime = "ranging";
  let approach = "Range-trade: fade extremes, tight targets.";
  if (adx > 25 && Math.abs(drift) > noise * 0.6) {
    regime = drift > 0 ? "trending-up" : "trending-down";
    approach =
      regime === "trending-up"
        ? "Trend-follow longs on pullbacks to EMA."
        : "Trend-follow shorts on rallies to EMA.";
  } else if (volPct > 0.8) {
    regime = "volatile";
    approach = "Reduce size, widen stops, avoid new entries until expansion resolves.";
  } else if (volPct < 0.2 && adx < 18) {
    regime = "quiet";
    approach = "Stand aside or scalp only; breakout pending.";
  }
  const confidence = Math.min(0.95, 0.45 + adx / 200 + (Math.abs(drift) / (noise + 0.001)) * 0.1);
  return { regime, adx, volPct, drift, confidence, approach };
}

// ---------- Liquidity Flow Engine ----------
export interface LiquidityCluster {
  price: number;
  side: "buy-stop" | "sell-stop" | "buy-limit" | "sell-limit";
  strength: number;
  barsAgo: number;
}

export function liquidityMap(candles: Candle[]): {
  clusters: LiquidityCluster[];
  dominant: "buy" | "sell" | "balanced";
  imbalance: number;
  sweepRisk: "low" | "medium" | "high";
  nearest: number;
} {
  const clusters: LiquidityCluster[] = [];
  const avgVol = candles.reduce((s, c) => s + c.v, 0) / Math.max(1, candles.length) || 1;
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isSwingHigh =
      c.h > candles[i - 1].h &&
      c.h > candles[i - 2].h &&
      c.h > candles[i + 1].h &&
      c.h > candles[i + 2].h;
    const isSwingLow =
      c.l < candles[i - 1].l &&
      c.l < candles[i - 2].l &&
      c.l < candles[i + 1].l &&
      c.l < candles[i + 2].l;
    if (isSwingHigh) {
      clusters.push({
        price: c.h,
        side: "sell-stop",
        strength: Math.min(1, c.v / avgVol),
        barsAgo: candles.length - 1 - i,
      });
    }
    if (isSwingLow) {
      clusters.push({
        price: c.l,
        side: "buy-stop",
        strength: Math.min(1, c.v / avgVol),
        barsAgo: candles.length - 1 - i,
      });
    }
  }
  const buyStr = clusters
    .filter((x) => x.side.startsWith("buy"))
    .reduce((s, x) => s + x.strength, 0);
  const sellStr = clusters
    .filter((x) => x.side.startsWith("sell"))
    .reduce((s, x) => s + x.strength, 0);
  const dominant = buyStr > sellStr * 1.2 ? "buy" : sellStr > buyStr * 1.2 ? "sell" : "balanced";
  const last = candles[candles.length - 1]?.c ?? 0;
  const near = clusters.filter((x) => Math.abs(x.price - last) / (last || 1) < 0.01);
  const sweepRisk = near.length > 3 ? "high" : near.length > 1 ? "medium" : "low";
  const nearest = near.length ? Math.min(...near.map((n) => Math.abs(n.price - last))) : Infinity;
  return {
    clusters: clusters.slice(-30),
    dominant,
    imbalance: Math.abs(buyStr - sellStr),
    sweepRisk,
    nearest,
  };
}

// ---------- Tick Replay Engine ----------
export interface Tick {
  price: number;
  volume: number;
  t: number;
  side?: "buy" | "sell";
}

export function replayTicks(
  ticks: Tick[],
  speed = 1,
): {
  vwap: number;
  buyPressure: number;
  sellPressure: number;
  deltaCum: number;
  pace: number;
  bursts: { t: number; intensity: number }[];
} {
  if (ticks.length === 0) {
    return { vwap: 0, buyPressure: 0, sellPressure: 0, deltaCum: 0, pace: 0, bursts: [] };
  }
  let pv = 0,
    vol = 0,
    buy = 0,
    sell = 0,
    delta = 0;
  const bursts: { t: number; intensity: number }[] = [];
  const avgVol = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length || 1;
  for (let i = 0; i < ticks.length; i++) {
    const tk = ticks[i];
    const side = tk.side ?? (i > 0 ? (tk.price >= ticks[i - 1].price ? "buy" : "sell") : "buy");
    pv += tk.price * tk.volume;
    vol += tk.volume;
    if (side === "buy") {
      buy += tk.volume;
      delta += tk.volume;
    } else {
      sell += tk.volume;
      delta -= tk.volume;
    }
    if (tk.volume > avgVol * 3) {
      bursts.push({ t: tk.t, intensity: tk.volume / avgVol });
    }
  }
  const span = ticks[ticks.length - 1].t - ticks[0].t || 1;
  return {
    vwap: pv / vol,
    buyPressure: buy / (buy + sell || 1),
    sellPressure: sell / (buy + sell || 1),
    deltaCum: delta,
    pace: (ticks.length / span) * 1000 * speed,
    bursts,
  };
}

// ---------- Volatility Surface Engine ----------
export interface VolPoint {
  timeframe: string;
  volPct: number;
  annualized: number;
  rank: number; // 0..1 vs recent history
}

export function volatilitySurface(candlesByTf: { tf: string; candles: Candle[] }[]): {
  points: VolPoint[];
  regime: "low" | "normal" | "high" | "extreme";
  termStructure: "contango" | "backwardation" | "flat";
} {
  const points: VolPoint[] = candlesByTf.map(({ tf, candles }) => {
    const ret = candles
      .slice(-30)
      .map((c, i, arr) => (i === 0 ? 0 : Math.log(c.c / (arr[i - 1].c || c.c))));
    const sd = Math.sqrt(ret.reduce((s, r) => s + r * r, 0) / Math.max(1, ret.length));
    const periodsPerYear: Record<string, number> = {
      M1: 525600,
      M5: 105120,
      M15: 35040,
      M30: 17520,
      H1: 8760,
      H4: 2190,
      D1: 365,
      W1: 52,
    };
    const ppy = periodsPerYear[tf] ?? 365;
    const ann = sd * Math.sqrt(ppy) * 100;
    const mean = ret.reduce((a, b) => a + Math.abs(b), 0) / ret.length;
    const rank = mean ? Math.min(1, sd / (mean * 4)) : 0.5;
    return { timeframe: tf, volPct: sd * 100, annualized: ann, rank };
  });
  const avg = points.reduce((s, p) => s + p.annualized, 0) / Math.max(1, points.length);
  const regime: "low" | "normal" | "high" | "extreme" =
    avg < 5 ? "low" : avg < 12 ? "normal" : avg < 25 ? "high" : "extreme";
  const first = points[0]?.annualized ?? 0;
  const last = points[points.length - 1]?.annualized ?? 0;
  const termStructure =
    first > last * 1.1 ? "backwardation" : last > first * 1.1 ? "contango" : "flat";
  return { points, regime, termStructure };
}

// ---------- Order Flow Imbalance ----------
export function orderFlowImbalance(candles: Candle[]): {
  cdi: number;
  absorption: boolean;
  exhaustion: boolean;
  blocks: { price: number; vol: number; dir: "up" | "down" }[];
} {
  let delta = 0;
  const blocks: { price: number; vol: number; dir: "up" | "down" }[] = [];
  const avgVol = candles.reduce((s, c) => s + c.v, 0) / Math.max(1, candles.length) || 1;
  const deltas: number[] = [];
  for (const c of candles) {
    const range = c.h - c.l || 1;
    const upPart = ((c.c - c.l) / range) * c.v;
    const downPart = ((c.h - c.c) / range) * c.v;
    const d = upPart - downPart;
    delta += d;
    deltas.push(d);
    if (c.v > avgVol * 2.5) {
      blocks.push({ price: c.c, vol: c.v, dir: c.c >= c.o ? "up" : "down" });
    }
  }
  const maxAbs = Math.max(...deltas.map((d) => Math.abs(d)), 1);
  const cdi = Math.max(-1, Math.min(1, delta / (maxAbs * candles.length)));
  const last = candles[candles.length - 1];
  const absorption =
    !!last && last.v > avgVol * 1.8 && Math.abs(last.c - last.o) < (last.h - last.l) * 0.3;
  const last5 = candles.slice(-5);
  const priceUp = last5[last5.length - 1]?.c > last5[0]?.c;
  const deltaUp = deltas.slice(-5).reduce((a, b) => a + b, 0) > 0;
  const exhaustion = priceUp !== deltaUp;
  return { cdi, absorption, exhaustion, blocks: blocks.slice(-10) };
}
