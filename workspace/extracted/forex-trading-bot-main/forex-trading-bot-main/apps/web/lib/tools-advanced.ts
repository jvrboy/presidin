/** Advanced decision tools: VP-advanced, market structure BOS/CHoCH, imbalance FVG, session profile, Wyckoff phase, correlation drift, MTF alignment. */
import type { Candle } from './indicators';
import { atr, ema, sma, rsi, lastFinite, macd } from './indicators';
import { linearRegSlope } from './indicators-more';
import type { ToolVote } from './tools';
import { volumeProfileVotes, volumeProfileSnapshot } from './volume-profile-advanced';

type Direction = 'BUY' | 'SELL' | 'HOLD';

function v(name: string, direction: Direction, confidence: number, weight: number, reason: string, meta?: Record<string, number | string | boolean>): ToolVote {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason, meta };
}

export function volumeProfileAdvancedTool(candles: Candle[]): ToolVote[] {
  return volumeProfileVotes(candles).map((x) => v(`adv:${x.name}`, x.direction, x.confidence, x.weight, x.reason));
}

/** Break of Structure / Change of Character detection using swing highs/lows. */
export function marketStructureTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return v('adv:market_structure', 'HOLD', 0.2, 0.3, 'short');
  const lookback = candles.slice(-30);
  const highs: number[] = [], lows: number[] = [];
  for (let i = 3; i < lookback.length - 3; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i) continue;
      if (lookback[j].high > lookback[i].high) isHigh = false;
      if (lookback[j].low < lookback[i].low) isLow = false;
    }
    if (isHigh) highs.push(lookback[i].high);
    if (isLow) lows.push(lookback[i].low);
  }
  if (highs.length < 2 || lows.length < 2) return v('adv:market_structure', 'HOLD', 0.25, 0.4, 'not enough swings');
  const [h1, h2] = highs.slice(-2);
  const [l1, l2] = lows.slice(-2);
  const price = candles[candles.length - 1].close;
  if (h2 > h1 && l2 > l1) {
    if (price > h2) return v('adv:market_structure', 'BUY', 0.7, 1.05, 'BOS: HH+HL confirmed break');
    return v('adv:market_structure', 'BUY', 0.55, 0.85, 'HH+HL uptrend structure');
  }
  if (h2 < h1 && l2 < l1) {
    if (price < l2) return v('adv:market_structure', 'SELL', 0.7, 1.05, 'BOS: LH+LL confirmed break');
    return v('adv:market_structure', 'SELL', 0.55, 0.85, 'LH+LL downtrend structure');
  }
  if (h2 < h1 && l2 > l1) return v('adv:market_structure', 'HOLD', 0.65, 0.9, 'CHoCH: compression, awaiting break');
  return v('adv:market_structure', 'HOLD', 0.3, 0.5, 'mixed structure');
}

/** Fair-value gap / imbalance detection (3-candle inefficiency). */
export function fvgImbalanceTool(candles: Candle[]): ToolVote {
  if (candles.length < 8) return v('adv:fvg', 'HOLD', 0.2, 0.3, 'short');
  const recent = candles.slice(-6);
  let bullFvg = 0, bearFvg = 0;
  for (let i = 1; i < recent.length - 1; i++) {
    const a = recent[i - 1], c = recent[i + 1];
    if (a.high < c.low) bullFvg++;
    if (a.low > c.high) bearFvg++;
  }
  if (bullFvg >= 1 && bearFvg === 0) return v('adv:fvg', 'BUY', 0.62, 0.9, `bull FVG open x${bullFvg}`);
  if (bearFvg >= 1 && bullFvg === 0) return v('adv:fvg', 'SELL', 0.62, 0.9, `bear FVG open x${bearFvg}`);
  return v('adv:fvg', 'HOLD', 0.2, 0.35, `no clean FVG (b=${bullFvg} s=${bearFvg})`);
}

/** Session profile — dominant session by high-low range in the last ~24 bars. */
export function sessionProfileTool(candles: Candle[]): ToolVote {
  if (candles.length < 16) return v('adv:session', 'HOLD', 0.2, 0.3, 'short');
  const last = candles[candles.length - 1];
  if (!last.epoch) return v('adv:session', 'HOLD', 0.2, 0.3, 'no epoch');
  const buckets: Record<string, number> = { asia: 0, london: 0, ny: 0 };
  for (const c of candles.slice(-24)) {
    const h = new Date(c.epoch * 1000).getUTCHours();
    const rng = c.high - c.low;
    if (h >= 1 && h < 9) buckets.asia += rng;
    else if (h >= 9 && h < 14) buckets.london += rng;
    else if (h >= 14 && h < 21) buckets.ny += rng;
  }
  const dominant = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  const currentHour = new Date(last.epoch * 1000).getUTCHours();
  const inKillzone = (currentHour >= 12 && currentHour < 15) || (currentHour >= 7 && currentHour < 10);
  const price = last.close;
  const e21 = lastFinite(ema(candles.map((x) => x.close), 21));
  if (inKillzone) return v('adv:session', price > e21 ? 'BUY' : 'SELL', 0.55, 0.85, `${dominant[0]} killzone (dominant)`, { dominant: dominant[0], inKillzone });
  return v('adv:session', 'HOLD', 0.3, 0.4, `${dominant[0]} dominant, off killzone`);
}

/** Wyckoff phase inference — accumulation / distribution / markup / markdown. */
export function wyckoffPhaseTool(candles: Candle[]): ToolVote {
  if (candles.length < 40) return v('adv:wyckoff', 'HOLD', 0.2, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const slope = lastFinite(linearRegSlope(c, 30));
  const ranges = candles.slice(-30).map((x) => x.high - x.low);
  const rMean = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const rRecent = ranges.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const rangeCompression = rRecent / (rMean || 1);
  const a = lastFinite(atr(candles, 14)) || 1;
  const normSlope = slope / a;

  if (rangeCompression < 0.75 && Math.abs(normSlope) < 0.05) return v('adv:wyckoff', 'HOLD', 0.68, 1.0, `compression / spring watch (rc=${rangeCompression.toFixed(2)})`);
  if (normSlope > 0.08 && rangeCompression > 1.0) return v('adv:wyckoff', 'BUY', 0.7, 1.1, `markup phase (slope=${normSlope.toFixed(3)})`);
  if (normSlope < -0.08 && rangeCompression > 1.0) return v('adv:wyckoff', 'SELL', 0.7, 1.1, `markdown phase (slope=${normSlope.toFixed(3)})`);
  if (rangeCompression > 1.5) return v('adv:wyckoff', normSlope > 0 ? 'BUY' : 'SELL', 0.55, 0.85, 'distribution / climactic expansion');
  return v('adv:wyckoff', 'HOLD', 0.3, 0.45, `phase unclear`);
}

/** Momentum-price correlation drift — decays before divergence prints. */
export function correlationDriftTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return v('adv:corr_drift', 'HOLD', 0.2, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const window = 20;
  const cs = c.slice(-window);
  const rs = r.slice(-window);
  const cm = cs.reduce((a, b) => a + b, 0) / cs.length;
  const rm = rs.reduce((a, b) => a + b, 0) / rs.length;
  let num = 0, dc = 0, dr = 0;
  for (let i = 0; i < cs.length; i++) {
    num += (cs[i] - cm) * (rs[i] - rm);
    dc += (cs[i] - cm) ** 2;
    dr += (rs[i] - rm) ** 2;
  }
  const corr = num / (Math.sqrt(Math.max(1e-12, dc * dr)));
  if (corr < 0.25 && corr > -0.2) return v('adv:corr_drift', 'HOLD', 0.6, 0.85, `momentum decoupling corr=${corr.toFixed(2)} → divergence risk`);
  if (corr > 0.7) return v('adv:corr_drift', 'HOLD', 0.35, 0.55, `tight coupling corr=${corr.toFixed(2)}`);
  return v('adv:corr_drift', 'HOLD', 0.25, 0.4, `corr=${corr.toFixed(2)}`);
}

/** Multi-TF bias via down-sampled EMAs. */
export function mtfAlignmentTool(candles: Candle[]): ToolVote {
  if (candles.length < 60) return v('adv:mtf', 'HOLD', 0.2, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const c5m = c.filter((_, i) => i % 5 === 0);
  const c15m = c.filter((_, i) => i % 15 === 0);
  const price = c[c.length - 1];
  const e5 = lastFinite(ema(c5m, 21));
  const e15 = c15m.length > 21 ? lastFinite(ema(c15m, 21)) : e21;
  const align = (price > e21 ? 1 : -1) + (price > e5 ? 1 : -1) + (price > e15 ? 1 : -1);
  if (align === 3) return v('adv:mtf', 'BUY', 0.72, 1.1, 'all TFs bull');
  if (align === -3) return v('adv:mtf', 'SELL', 0.72, 1.1, 'all TFs bear');
  if (align === 1) return v('adv:mtf', 'BUY', 0.45, 0.65, '2/3 TFs bull');
  if (align === -1) return v('adv:mtf', 'SELL', 0.45, 0.65, '2/3 TFs bear');
  return v('adv:mtf', 'HOLD', 0.25, 0.4, 'TFs mixed');
}

export function runAdvancedTools(candles: Candle[]): ToolVote[] {
  return [
    ...volumeProfileAdvancedTool(candles),
    marketStructureTool(candles),
    fvgImbalanceTool(candles),
    sessionProfileTool(candles),
    wyckoffPhaseTool(candles),
    correlationDriftTool(candles),
    mtfAlignmentTool(candles),
  ];
}
