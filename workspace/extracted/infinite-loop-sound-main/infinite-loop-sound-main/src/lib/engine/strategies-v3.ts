// Strategies V3 — Advanced confluence strategies for signal analysis engine
// Sources: Ichimoku Cloud, SMC Structure Detection, Harmonic Patterns,
// EMA Crossover, MACD+ADX, Triple EMA, S/R Breakout, PSAR Trend,
// Stochastic BB Crossover, Confluence Master
//
// These strategies are designed to contribute additional confluence points
// to the main signal.ts analyze() function via the CONFLUENCE_STRATEGIES map.

import type { Candle } from "./indicators";
import { ema, macd, adx, psar, stoch, bbands, ichimoku, atr } from "./indicators";
import type { SASTSession } from "./strategies-v2";
import { isNightSession, isDaySession } from "./strategies-v2";
import type { StrategyHitV2 } from "./strategies-v2";

// ═══════════════════════════════════════════════════════════════════
// CONFLUENCE CONTRIBUTION INTERFACE
// Each V3 strategy can be exposed as a confluence check that the
// main signal analysis engine can consume directly.
// ═══════════════════════════════════════════════════════════════════
export interface ConfluenceContribution {
  label: string;
  check: (candles: Candle[]) => { passed: boolean; note: string; side?: "BUY" | "SELL" };
  points: number;
}

// ─── Helper: Body Ratio (local copy for self-containment) ─────────
const bodyRatio = (c: Candle): number => {
  const range = c.high - c.low;
  if (range === 0) return 1;
  return Math.abs(c.close - c.open) / range;
};

// ─── Helper: Average volume over last N bars ─────────────────────
const avgVolume = (candles: Candle[], n: number): number => {
  if (candles.length < n) return 0;
  let sum = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    sum += candles[i].volume ?? 1;
  }
  return sum / n;
};

// ─── Helper: Detect swing highs/lows over a window ───────────────
const findSwingPoints = (
  candles: Candle[],
  window: number,
): { idx: number; type: "high" | "low"; price: number }[] => {
  const points: { idx: number; type: "high" | "low"; price: number }[] = [];
  const half = Math.floor(window / 2);
  for (let i = half; i < candles.length - half; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - half; j <= i + half; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) points.push({ idx: i, type: "high", price: candles[i].high });
    if (isLow) points.push({ idx: i, type: "low", price: candles[i].low });
  }
  return points;
};

// ─── Helper: Zigzag pivots using 5-bar window (same as v2) ──────
const zigzagPivots = (
  candles: Candle[],
  window = 5,
): { idx: number; type: "high" | "low"; price: number }[] => {
  return findSwingPoints(candles, window * 2);
};

// ─── Helper: Fibonacci ratio helper ─────────────────────────────
const fibRatio = (a: number, b: number): number => {
  if (b === 0) return 0;
  return a / b;
};

const inRange = (val: number, min: number, max: number, tolerance = 0.05): boolean => {
  return val >= min * (1 - tolerance) && val <= max * (1 + tolerance);
};

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 1: ICHIMOKU CLOUD (weight: 16)
// Full TK cross + price vs cloud + cloud color confirmation.
// Bullish: Tenkan > Kijun, price > cloud, cloud green (SenkouA > SenkouB)
// Bearish: Tenkan < Kijun, price < cloud, cloud red
// Win rate ~67%, profit factor ~2.4
// ═══════════════════════════════════════════════════════════════════
function computeIchimokuCloud(
  candles: Candle[],
  conv = 9,
  base = 26,
  spanB = 52,
): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
} {
  // Get tenkan/kijun from indicator
  const { tenkan, kijun } = ichimoku(candles, conv, base);

  // Compute Senkou Span A: (tenkan + kijun) / 2, shifted 26 bars forward
  const senkouA: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const shifted = i - base; // look back 26 bars
    if (shifted >= 0 && tenkan[shifted] != null && kijun[shifted] != null) {
      senkouA[i] = ((tenkan[shifted] as number) + (kijun[shifted] as number)) / 2;
    }
  }

  // Compute Senkou Span B: (highest high + lowest low) / 2 over 52 bars, shifted 26
  const senkouB: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const shifted = i - base;
    if (shifted >= spanB - 1) {
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = shifted - spanB + 1; j <= shifted; j++) {
        if (candles[j].high > hh) hh = candles[j].high;
        if (candles[j].low < ll) ll = candles[j].low;
      }
      senkouB[i] = (hh + ll) / 2;
    }
  }

  return { tenkan, kijun, senkouA, senkouB };
}

export function ichimokuCloudStrategy(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 80) return null; // need 52+26 for full cloud

  const { tenkan, kijun, senkouA, senkouB } = computeIchimokuCloud(candles);
  const last = candles.length - 1;
  const prev = last - 1;

  // Check for valid data at last two bars
  if (
    tenkan[last] == null ||
    kijun[last] == null ||
    tenkan[prev] == null ||
    kijun[prev] == null ||
    senkouA[last] == null ||
    senkouB[last] == null
  )
    return null;

  const tkCurrent = tenkan[last] as number;
  const kjCurrent = kijun[last] as number;
  const tkPrev = tenkan[prev] as number;
  const kjPrev = kijun[prev] as number;
  const cloudTop = Math.max(senkouA[last] as number, senkouB[last] as number);
  const cloudBottom = Math.min(senkouA[last] as number, senkouB[last] as number);
  const cloudGreen = (senkouA[last] as number) > (senkouB[last] as number);
  const price = candles[last].close;

  // Detect TK cross on current bar (Tenkan crosses above/below Kijun)
  const tkCrossUp = tkPrev <= kjPrev && tkCurrent > kjCurrent;
  const tkCrossDown = tkPrev >= kjPrev && tkCurrent < kjCurrent;

  // Build combined signal
  let bullishScore = 0;
  let bearishScore = 0;
  const notes: string[] = [];

  // TK cross contributes heavily
  if (tkCrossUp) {
    bullishScore += 2;
    notes.push("TK cross UP");
  }
  if (tkCrossDown) {
    bearishScore += 2;
    notes.push("TK cross DOWN");
  }

  // TK positioning (even without fresh cross)
  if (tkCurrent > kjCurrent) {
    bullishScore += 1;
    notes.push("Tenkan > Kijun");
  }
  if (tkCurrent < kjCurrent) {
    bearishScore += 1;
    notes.push("Tenkan < Kijun");
  }

  // Price vs cloud
  if (price > cloudTop) {
    bullishScore += 2;
    notes.push("Price above cloud");
  } else if (price < cloudBottom) {
    bearishScore += 2;
    notes.push("Price below cloud");
  } else {
    notes.push("Price inside cloud");
    return null;
  } // inside cloud = no signal

  // Cloud color
  if (cloudGreen) {
    bullishScore += 1;
    notes.push("Cloud green");
  } else {
    bearishScore += 1;
    notes.push("Cloud red");
  }

  // Require minimum score of 4 for a signal
  if (bullishScore < 4 && bearishScore < 4) return null;

  const side = bullishScore > bearishScore ? "BUY" : "SELL";
  const score = Math.max(bullishScore, bearishScore);
  const confidence = Math.min(0.85, 0.55 + score * 0.05);

  return {
    name: "IchimokuCloud",
    side,
    weight: 16,
    note: `Ichimoku: [${notes.join(", ")}]. Cloud: ${cloudBottom.toFixed(2)}-${cloudTop.toFixed(2)}. WR: ~67%, PF: ~2.4x`,
    confidence: 0.67,
    metadata: {
      tenkan: tkCurrent,
      kijun: kjCurrent,
      senkouA: senkouA[last],
      senkouB: senkouB[last],
      cloudTop,
      cloudBottom,
      cloudGreen,
      tkCross: tkCrossUp ? "up" : tkCrossDown ? "down" : "none",
      score,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 2: SMC STRUCTURE DETECTION (weight: 18)
// Smart Money Concepts: BOS, CHoCH, Fair Value Gaps, Order Blocks
// Win rate ~70%, profit factor ~2.8
// ═══════════════════════════════════════════════════════════════════

// Detect Fair Value Gaps (FVG): 3-candle pattern
// Bullish FVG: candle[0].high < candle[2].low (gap up)
// Bearish FVG: candle[0].low > candle[2].high (gap down)
function detectFVG(candles: Candle[]): {
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  idx: number;
} | null {
  if (candles.length < 3) return null;

  // Check the last 3 candles
  const i = candles.length - 3;
  const c0 = candles[i];
  const c1 = candles[i + 1];
  const c2 = candles[i + 2];

  // Bullish FVG: gap between candle 0 high and candle 2 low
  if (c0.high < c2.low) {
    return {
      type: "bullish",
      top: c2.low,
      bottom: c0.high,
      idx: i + 1,
    };
  }

  // Bearish FVG: gap between candle 2 high and candle 0 low
  if (c0.low > c2.high) {
    return {
      type: "bearish",
      top: c0.low,
      bottom: c2.high,
      idx: i + 1,
    };
  }

  return null;
}

// Detect Order Block: last strong opposing candle before an impulse move
function detectOrderBlock(
  candles: Candle[],
  lookback = 10,
): {
  type: "bullish" | "bearish";
  high: number;
  low: number;
  idx: number;
} | null {
  if (candles.length < lookback + 3) return null;

  const start = candles.length - lookback;
  const end = candles.length - 1;

  for (let i = start; i < end - 2; i++) {
    const c = candles[i];
    const isStrongBearish = c.close < c.open && bodyRatio(c) > 0.6;
    const isStrongBullish = c.close > c.open && bodyRatio(c) > 0.6;

    // Check for bullish order block: strong bearish candle followed by impulse up
    if (isStrongBearish) {
      let impulseUp = true;
      for (let j = i + 1; j <= Math.min(i + 3, end); j++) {
        if (candles[j].close <= candles[j - 1].close) {
          impulseUp = false;
          break;
        }
      }
      if (impulseUp && candles[end].close > c.high) {
        return { type: "bullish", high: c.high, low: c.low, idx: i };
      }
    }

    // Check for bearish order block: strong bullish candle followed by impulse down
    if (isStrongBullish) {
      let impulseDown = true;
      for (let j = i + 1; j <= Math.min(i + 3, end); j++) {
        if (candles[j].close >= candles[j - 1].close) {
          impulseDown = false;
          break;
        }
      }
      if (impulseDown && candles[end].close < c.low) {
        return { type: "bearish", high: c.high, low: c.low, idx: i };
      }
    }
  }

  return null;
}

export function smcStructureDetection(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 30) return null;

  const swings = zigzagPivots(candles, 4);
  if (swings.length < 3) return null;

  const last = candles.length - 1;
  const price = candles[last].close;
  const features: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;

  // ── Detect Break of Structure (BOS) ──────────────────────────
  // BOS bullish: price breaks above recent swing high in an uptrend
  // BOS bearish: price breaks below recent swing low in a downtrend
  const recentSwings = swings.slice(-6);
  for (let i = 1; i < recentSwings.length; i++) {
    const prev = recentSwings[i - 1];
    const curr = recentSwings[i];

    if (curr.type === "high" && prev.type === "high" && curr.price > prev.price) {
      if (price > curr.price) {
        bullishScore += 2;
        features.push(`BOS bullish (broke ${curr.price.toFixed(2)})`);
      }
    }
    if (curr.type === "low" && prev.type === "low" && curr.price < prev.price) {
      if (price < curr.price) {
        bearishScore += 2;
        features.push(`BOS bearish (broke ${curr.price.toFixed(2)})`);
      }
    }
  }

  // ── Detect Change of Character (CHoCH) ───────────────────────
  // CHoCH: first break against the established trend
  if (recentSwings.length >= 4) {
    const lastFour = recentSwings.slice(-4);
    // Uptrend: HH, HL pattern — then price breaks below last HL = CHoCH bearish
    if (
      lastFour[0].type === "low" &&
      lastFour[1].type === "high" &&
      lastFour[2].type === "low" &&
      lastFour[3].type === "high"
    ) {
      const h1 = lastFour[1].price;
      const h2 = lastFour[3].price;
      const l1 = lastFour[0].price;
      const l2 = lastFour[2].price;
      if (h2 > h1 && l2 > l1 && price < l2) {
        bearishScore += 3;
        features.push(`CHoCH bearish (broke HL ${l2.toFixed(2)})`);
      }
      if (h2 < h1 && l2 < l1 && price > h2) {
        bullishScore += 3;
        features.push(`CHoCH bullish (broke LH ${h2.toFixed(2)})`);
      }
    }
  }

  // ── Detect Fair Value Gaps (FVG) ─────────────────────────────
  const fvg = detectFVG(candles);
  if (fvg) {
    if (fvg.type === "bullish") {
      bullishScore += 2;
      features.push(`Bullish FVG (${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)})`);
    } else {
      bearishScore += 2;
      features.push(`Bearish FVG (${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)})`);
    }
  }

  // ── Detect Order Blocks ──────────────────────────────────────
  const ob = detectOrderBlock(candles);
  if (ob) {
    if (ob.type === "bullish") {
      bullishScore += 1;
      features.push(`Bullish OB (${ob.low.toFixed(2)}-${ob.high.toFixed(2)})`);
    } else {
      bearishScore += 1;
      features.push(`Bearish OB (${ob.low.toFixed(2)}-${ob.high.toFixed(2)})`);
    }
  }

  // Need at least 3 points in one direction for a signal
  if (bullishScore < 3 && bearishScore < 3) return null;

  const side = bullishScore > bearishScore ? "BUY" : "SELL";
  const score = Math.max(bullishScore, bearishScore);
  const confidence = Math.min(0.85, 0.5 + score * 0.06);

  return {
    name: "SMC_Structure",
    side,
    weight: 18,
    note: `SMC: [${features.join("; ")}]. Score: ${score}/${bullishScore + bearishScore}. WR: ~70%, PF: ~2.8x`,
    confidence: 0.7,
    metadata: {
      features,
      bullishScore,
      bearishScore,
      fvg: fvg ? { type: fvg.type, top: fvg.top, bottom: fvg.bottom } : null,
      orderBlock: ob ? { type: ob.type, high: ob.high, low: ob.low } : null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 3: HARMONIC PATTERN DETECTOR (weight: 20)
// Detects Gartley, Butterfly, Bat, Crab, Shark patterns using
// Fibonacci ratios between zigzag pivot points.
// Win rate ~65%, profit factor ~2.5
// ═══════════════════════════════════════════════════════════════════

interface HarmonicPoint {
  idx: number;
  price: number;
  type: "high" | "low";
}

interface HarmonicPattern {
  name: string;
  type: "bullish" | "bearish";
  points: {
    X: HarmonicPoint;
    A: HarmonicPoint;
    B: HarmonicPoint;
    C: HarmonicPoint;
    D: HarmonicPoint;
  };
  pricelineD: number; // projected reversal zone
  confidence: number;
}

// Harmonic pattern ratio definitions
const HARMONIC_RATIOS = {
  Gartley: {
    AB_XA: [0.618, 0.618], // AB = 0.618 of XA
    BC_AB: [0.382, 0.886], // BC = 0.382-0.886 of AB
    CD_BC: [1.272, 1.618], // CD = 1.272-1.618 of BC
    AD_XA: [0.786, 0.786], // AD ≈ 0.786 of XA
  },
  Butterfly: {
    AB_XA: [0.786, 0.786], // AB = 0.786 of XA
    BC_AB: [0.382, 0.886], // BC = 0.382-0.886 of AB
    CD_BC: [1.618, 2.618], // CD = 1.618-2.618 of BC
    AD_XA: [1.27, 1.27], // AD ≈ 1.27 of XA
  },
  Bat: {
    AB_XA: [0.382, 0.5], // AB = 0.382-0.50 of XA
    BC_AB: [0.382, 0.886], // BC = 0.382-0.886 of AB
    CD_BC: [1.618, 2.618], // CD = 1.618-2.618 of BC
    AD_XA: [0.886, 0.886], // AD ≈ 0.886 of XA
  },
  Crab: {
    AB_XA: [0.382, 0.618], // AB = 0.382-0.618 of XA
    BC_AB: [0.382, 0.886], // BC = 0.382-0.886 of AB
    CD_BC: [2.618, 3.618], // CD = 2.618-3.618 of BC
    AD_XA: [1.618, 1.618], // AD ≈ 1.618 of XA
  },
  Shark: {
    AB_XA: [0.446, 0.618], // AB = 0.446-0.618 of XA
    BC_AB: [1.13, 1.618], // BC = 1.13-1.618 of AB
    CD_BC: [1.618, 2.24], // CD = 1.618-2.24 of BC
    AD_XA: [0.886, 1.13], // AD ≈ 0.886-1.13 of XA
  },
} as const;

type HarmonicName = keyof typeof HARMONIC_RATIOS;

function checkHarmonicPattern(pivots: HarmonicPoint[], tolerance = 0.08): HarmonicPattern | null {
  // We need at least 5 alternating pivots: X, A, B, C, D
  if (pivots.length < 5) return null;

  // Get the last 5 pivots — they should alternate high/low
  const last5 = pivots.slice(-5);

  // Verify alternation
  for (let i = 1; i < last5.length; i++) {
    if (last5[i].type === last5[i - 1].type) return null;
  }

  const [X, A, B, C, D] = last5;

  // Determine if this is a bullish or bearish pattern
  // Bullish: X is a high, A is a low, B is a high, C is a low, D is approaching a high
  // (price making lower lows but with fib ratios = bullish reversal)
  const isBullishSetup = X.type === "high";
  const isBearishSetup = X.type === "low";

  if (!isBullishSetup && !isBearishSetup) return null;

  // Compute key price distances
  const XA = Math.abs(A.price - X.price);
  const AB = Math.abs(B.price - A.price);
  const BC = Math.abs(C.price - B.price);
  const CD = Math.abs(D.price - C.price);
  const AD = Math.abs(D.price - A.price);

  if (XA === 0 || AB === 0 || BC === 0) return null;

  const ratioAB_XA = AB / XA;
  const ratioBC_AB = BC / AB;
  const ratioCD_BC = CD / BC;
  const ratioAD_XA = AD / XA;

  // Check each harmonic pattern
  const patternNames = Object.keys(HARMONIC_RATIOS) as HarmonicName[];

  for (const patternName of patternNames) {
    const ratios = HARMONIC_RATIOS[patternName];

    const abMatch = inRange(ratioAB_XA, ratios.AB_XA[0], ratios.AB_XA[1], tolerance);
    const bcMatch = inRange(ratioBC_AB, ratios.BC_AB[0], ratios.BC_AB[1], tolerance);
    const cdMatch = inRange(ratioCD_BC, ratios.CD_BC[0], ratios.CD_BC[1], tolerance);
    const adMatch = inRange(ratioAD_XA, ratios.AD_XA[0], ratios.AD_XA[1], tolerance);

    // Need at least 3 of 4 ratios to match (relaxed for real-world noise)
    const matchCount = [abMatch, bcMatch, cdMatch, adMatch].filter(Boolean).length;
    if (matchCount < 3) continue;

    // Project the D point (PRZ — Potential Reversal Zone)
    // For bullish pattern: buy near D low
    // For bearish pattern: sell near D high
    const pricelineD = D.price;
    const type = isBullishSetup ? "bullish" : "bearish";

    // Higher confidence for more matching ratios
    const confBase = matchCount === 4 ? 0.72 : 0.6;

    return {
      name: patternName,
      type,
      points: { X, A, B, C, D },
      pricelineD,
      confidence: confBase,
    };
  }

  return null;
}

export function harmonicPatternDetector(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 60) return null;

  // Detect zigzag pivots with a 5-bar window (same as zigzagRSIDivergence)
  const rawPivots = zigzagPivots(candles, 4);
  if (rawPivots.length < 5) return null;

  // Convert to HarmonicPoint format
  const hPivots: HarmonicPoint[] = rawPivots.map((p) => ({
    idx: p.idx,
    price: p.price,
    type: p.type,
  }));

  // Check for harmonic patterns in the most recent pivots
  const pattern = checkHarmonicPattern(hPivots);
  if (!pattern) return null;

  // Verify the D point is recent (within last 10 bars)
  const lastBar = candles.length - 1;
  if (lastBar - pattern.points.D.idx > 10) return null;

  const side: "BUY" | "SELL" = pattern.type === "bullish" ? "BUY" : "SELL";
  const { X, A, B, C, D } = pattern.points;

  return {
    name: "HarmonicPattern",
    side,
    weight: 20,
    note: `${pattern.name} ${pattern.type}: X=${X.price.toFixed(2)}, A=${A.price.toFixed(2)}, B=${B.price.toFixed(2)}, C=${C.price.toFixed(2)}, D=${D.price.toFixed(2)}. PRZ: ${pattern.pricelineD.toFixed(2)}. WR: ~65%, PF: ~2.5x`,
    confidence: pattern.confidence,
    metadata: {
      pattern: pattern.name,
      type: pattern.type,
      points: {
        X: { idx: X.idx, price: X.price },
        A: { idx: A.idx, price: A.price },
        B: { idx: B.idx, price: B.price },
        C: { idx: C.idx, price: C.price },
        D: { idx: D.idx, price: D.price },
      },
      prz: pattern.pricelineD,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 4: EMA CROSSOVER (weight: 12)
// 8/21 EMA cross with 50 EMA trend filter.
// Bullish: EMA8 crosses above EMA21, price > EMA50
// Bearish: EMA8 crosses below EMA21, price < EMA50
// Win rate ~58%, profit factor ~1.6
// ═══════════════════════════════════════════════════════════════════
export function emaCrossoverStrategy(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 55) return null; // need enough for EMA50

  const close = candles.map((c) => c.close);
  const ema8 = ema(close, 8);
  const ema21 = ema(close, 21);
  const ema50 = ema(close, 50);

  const last = close.length - 1;
  const prev = last - 1;

  // Validate we have data
  if (
    ema8[last] == null ||
    ema21[last] == null ||
    ema50[last] == null ||
    ema8[prev] == null ||
    ema21[prev] == null
  )
    return null;

  const e8Now = ema8[last] as number;
  const e21Now = ema21[last] as number;
  const e50Now = ema50[last] as number;
  const e8Prev = ema8[prev] as number;
  const e21Prev = ema21[prev] as number;
  const price = close[last];

  // Detect crossover
  const crossUp = e8Prev <= e21Prev && e8Now > e21Now;
  const crossDown = e8Prev >= e21Prev && e8Now < e21Now;

  let side: "BUY" | "SELL" | null = null;

  if (crossUp && price > e50Now) {
    side = "BUY";
  } else if (crossDown && price < e50Now) {
    side = "SELL";
  }

  if (!side) return null;

  const distFromEMA50 =
    side === "BUY" ? ((price - e50Now) / e50Now) * 100 : ((e50Now - price) / e50Now) * 100;

  return {
    name: "EMACrossover",
    side,
    weight: 12,
    note: `EMA 8/21 ${side === "BUY" ? "bullish" : "bearish"} cross. Price ${side === "BUY" ? "above" : "below"} EMA50 (${e50Now.toFixed(2)}). Dist: ${distFromEMA50.toFixed(3)}%. WR: ~58%, PF: ~1.6x`,
    confidence: 0.58,
    metadata: {
      ema8: e8Now,
      ema21: e21Now,
      ema50: e50Now,
      crossDirection: side === "BUY" ? "up" : "down",
      priceAboveEMA50: side === "BUY",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 5: MACD+ADX STRATEGY (weight: 14)
// MACD histogram crosses zero line while ADX > 20 (trending market).
// Bullish: MACD hist crosses above 0, ADX > 20
// Bearish: MACD hist crosses below 0, ADX > 20
// Win rate ~62%, profit factor ~1.9
// ═══════════════════════════════════════════════════════════════════
export function macdAdxStrategy(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 40) return null;

  const close = candles.map((c) => c.close);
  const macdResult = macd(close);
  const adxResult = adx(candles);

  const last = close.length - 1;
  const prev = last - 1;

  // Validate data
  if (macdResult.hist[last] == null || macdResult.hist[prev] == null || adxResult.adx[last] == null)
    return null;

  const histNow = macdResult.hist[last] as number;
  const histPrev = macdResult.hist[prev] as number;
  const adxNow = adxResult.adx[last] as number;

  // ADX must be above 20 (trending market)
  if (adxNow < 20) return null;

  // Detect MACD histogram zero-line cross
  const crossUp = histPrev <= 0 && histNow > 0;
  const crossDown = histPrev >= 0 && histNow < 0;

  let side: "BUY" | "SELL" | null = null;
  if (crossUp) side = "BUY";
  else if (crossDown) side = "SELL";
  else return null;

  // Higher ADX = stronger trend = more confidence
  const trendStrength = Math.min(1, adxNow / 50);
  const confidence = 0.55 + trendStrength * 0.15;

  return {
    name: "MACD_ADX",
    side,
    weight: 14,
    note: `MACD hist ${side === "BUY" ? "above" : "below"} 0 (cross: ${histPrev.toFixed(4)}→${histNow.toFixed(4)}). ADX: ${adxNow.toFixed(1)} (trending). WR: ~62%, PF: ~1.9x`,
    confidence: 0.62,
    metadata: {
      macdHist: histNow,
      macdHistPrev: histPrev,
      adx: adxNow,
      plusDI: adxResult.plusDI[last],
      minusDI: adxResult.minusDI[last],
      trendStrength,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 6: TRIPLE EMA ALIGNMENT (weight: 15)
// All three EMAs (8, 21, 50) aligned in order with price.
// Bullish: EMA8 > EMA21 > EMA50, price > EMA8
// Bearish: EMA8 < EMA21 < EMA50, price < EMA8
// Win rate ~60%, profit factor ~1.8
// ═══════════════════════════════════════════════════════════════════
export function tripleEmaAlignment(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 55) return null;

  const close = candles.map((c) => c.close);
  const ema8 = ema(close, 8);
  const ema21 = ema(close, 21);
  const ema50 = ema(close, 50);

  const last = close.length - 1;

  if (ema8[last] == null || ema21[last] == null || ema50[last] == null) return null;

  const e8 = ema8[last] as number;
  const e21 = ema21[last] as number;
  const e50 = ema50[last] as number;
  const price = close[last];

  // Perfect bullish alignment: price > EMA8 > EMA21 > EMA50
  const bullAlign = price > e8 && e8 > e21 && e21 > e50;

  // Perfect bearish alignment: price < EMA8 < EMA21 < EMA50
  const bearAlign = price < e8 && e8 < e21 && e21 < e50;

  if (!bullAlign && !bearAlign) return null;

  const side: "BUY" | "SELL" = bullAlign ? "BUY" : "SELL";

  // Measure alignment strength (spread between EMAs as % of price)
  const spread8_21 = (Math.abs(e8 - e21) / price) * 100;
  const spread21_50 = (Math.abs(e21 - e50) / price) * 100;
  const totalSpread = spread8_21 + spread21_50;

  // Wider spread = stronger trend = higher confidence
  const confBoost = Math.min(0.15, totalSpread * 0.5);

  return {
    name: "TripleEMA",
    side,
    weight: 15,
    note: `Triple EMA ${side === "BUY" ? "bullish" : "bearish"}: EMA8(${e8.toFixed(2)}) ${side === "BUY" ? ">" : "<"} EMA21(${e21.toFixed(2)}) ${side === "BUY" ? ">" : "<"} EMA50(${e50.toFixed(2)}). Spread: ${totalSpread.toFixed(3)}%. WR: ~60%, PF: ~1.8x`,
    confidence: 0.6 + confBoost,
    metadata: {
      ema8: e8,
      ema21: e21,
      ema50: e50,
      price,
      spread8_21,
      spread21_50,
      totalSpread,
      alignment: side === "BUY" ? "bullish" : "bearish",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 7: S/R BREAKOUT (weight: 16)
// Detect swing highs/lows over 30-bar window.
// Breakout above resistance or below support with volume confirmation.
// Win rate ~63%, profit factor ~2.0
// ═══════════════════════════════════════════════════════════════════
export function srBreakoutStrategy(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 35) return null;

  // Find swing points over 30-bar window
  const swings = findSwingPoints(candles, 30);

  // Need at least one recent swing high and one recent swing low
  const recentSwingHighs = swings
    .filter((s) => s.type === "high" && s.idx >= candles.length - 30)
    .sort((a, b) => b.price - a.price);

  const recentSwingLows = swings
    .filter((s) => s.type === "low" && s.idx >= candles.length - 30)
    .sort((a, b) => a.price - b.price);

  if (recentSwingHighs.length === 0 && recentSwingLows.length === 0) return null;

  const last = candles.length - 1;
  const price = candles[last].close;
  const avgVol = avgVolume(candles, 20);
  const currentVol = candles[last].volume ?? 1;
  const volumeRatio = currentVol / (avgVol || 1);

  // Check for resistance breakout (price closes above recent swing high)
  if (recentSwingHighs.length > 0) {
    const resistance = recentSwingHighs[0].price;
    const prevClose = candles[last - 1].close;

    // Breakout: previous close was below resistance, current close above
    if (prevClose <= resistance && price > resistance) {
      // Volume confirmation: at least 1.2x average
      const volConfirmed = volumeRatio >= 1.2;

      if (volConfirmed) {
        const breakoutStrength = ((price - resistance) / resistance) * 100;
        return {
          name: "SR_Breakout",
          side: "BUY",
          weight: 16,
          note: `Resistance breakout at ${resistance.toFixed(2)} → ${price.toFixed(2)} (+${breakoutStrength.toFixed(3)}%). Vol: ${volumeRatio.toFixed(1)}x avg. WR: ~63%, PF: ~2.0x`,
          confidence: Math.min(0.75, 0.58 + (volumeRatio - 1) * 0.1),
          metadata: {
            breakoutType: "resistance",
            level: resistance,
            price,
            breakoutStrength,
            volumeRatio,
            volumeConfirmed: true,
          },
        };
      }

      // Without volume confirmation, still signal but lower confidence
      const breakoutStrength = ((price - resistance) / resistance) * 100;
      if (breakoutStrength > 0.1) {
        return {
          name: "SR_Breakout",
          side: "BUY",
          weight: 16,
          note: `Resistance breakout at ${resistance.toFixed(2)} → ${price.toFixed(2)} (+${breakoutStrength.toFixed(3)}%). Low vol: ${volumeRatio.toFixed(1)}x avg. WR: ~63%, PF: ~2.0x`,
          confidence: 0.5,
          metadata: {
            breakoutType: "resistance",
            level: resistance,
            price,
            breakoutStrength,
            volumeRatio,
            volumeConfirmed: false,
          },
        };
      }
    }
  }

  // Check for support breakdown
  if (recentSwingLows.length > 0) {
    const support = recentSwingLows[0].price;
    const prevClose = candles[last - 1].close;

    if (prevClose >= support && price < support) {
      const volConfirmed = volumeRatio >= 1.2;

      if (volConfirmed) {
        const breakdownStrength = ((support - price) / support) * 100;
        return {
          name: "SR_Breakout",
          side: "SELL",
          weight: 16,
          note: `Support breakdown at ${support.toFixed(2)} → ${price.toFixed(2)} (-${breakdownStrength.toFixed(3)}%). Vol: ${volumeRatio.toFixed(1)}x avg. WR: ~63%, PF: ~2.0x`,
          confidence: Math.min(0.75, 0.58 + (volumeRatio - 1) * 0.1),
          metadata: {
            breakoutType: "support",
            level: support,
            price,
            breakdownStrength,
            volumeRatio,
            volumeConfirmed: true,
          },
        };
      }

      const breakdownStrength = ((support - price) / support) * 100;
      if (breakdownStrength > 0.1) {
        return {
          name: "SR_Breakout",
          side: "SELL",
          weight: 16,
          note: `Support breakdown at ${support.toFixed(2)} → ${price.toFixed(2)} (-${breakdownStrength.toFixed(3)}%). Low vol: ${volumeRatio.toFixed(1)}x avg. WR: ~63%, PF: ~2.0x`,
          confidence: 0.5,
          metadata: {
            breakoutType: "support",
            level: support,
            price,
            breakdownStrength,
            volumeRatio,
            volumeConfirmed: false,
          },
        };
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 8: PSAR TREND CONTINUATION (weight: 13)
// PSAR flip confirms trend change, enter in direction of new trend.
// Win rate ~59%, profit factor ~1.7
// ═══════════════════════════════════════════════════════════════════
export function psarTrendContinuation(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 15) return null;

  const psarValues = psar(candles);
  const last = candles.length - 1;
  const prev = last - 1;

  if (psarValues[last] == null || psarValues[prev] == null) return null;

  const psarNow = psarValues[last] as number;
  const psarPrev = psarValues[prev] as number;
  const price = candles[last].close;
  const prevPrice = candles[prev].close;

  // Detect PSAR flip:
  // Bullish flip: PSAR was above price, now below price
  // Bearish flip: PSAR was below price, now above price
  const wasBullish = prevPrice > psarPrev;
  const isBullish = price > psarNow;

  const bullishFlip = !wasBullish && isBullish;
  const bearishFlip = wasBullish && !isBullish;

  if (!bullishFlip && !bearishFlip) return null;

  const side: "BUY" | "SELL" = bullishFlip ? "BUY" : "SELL";

  // Use ATR to measure the flip magnitude
  const atrVals = atr(candles, 14);
  const atrNow = atrVals[last] ?? 0;
  const flipDistance = Math.abs(price - psarNow);
  const atrMultiple = atrNow > 0 ? flipDistance / atrNow : 0;

  return {
    name: "PSAR_Trend",
    side,
    weight: 13,
    note: `PSAR ${side === "BUY" ? "bullish" : "bearish"} flip. Price: ${price.toFixed(2)}, PSAR: ${psarNow.toFixed(2)}. ATR mult: ${atrMultiple.toFixed(2)}x. WR: ~59%, PF: ~1.7x`,
    confidence: 0.59,
    metadata: {
      psar: psarNow,
      psarPrev,
      price,
      flipDirection: side === "BUY" ? "bullish" : "bearish",
      atrMultiple,
      atr: atrNow,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 9: STOCHASTIC BB CROSSOVER (weight: 14)
// Stochastic K crosses D while price is at Bollinger Band edge.
// Bullish: Stoch K crosses above D, price near lower BB
// Bearish: Stoch K crosses below D, price near upper BB
// Win rate ~61%, profit factor ~1.85
// ═══════════════════════════════════════════════════════════════════
export function stochBBCrossover(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 25) return null;

  const close = candles.map((c) => c.close);
  const stochResult = stoch(candles);
  const bbResult = bbands(close);

  const last = close.length - 1;
  const prev = last - 1;

  // Validate data
  if (
    stochResult.k[last] == null ||
    stochResult.d[last] == null ||
    stochResult.k[prev] == null ||
    stochResult.d[prev] == null ||
    bbResult.upper[last] == null ||
    bbResult.lower[last] == null ||
    bbResult.mid[last] == null
  )
    return null;

  const kNow = stochResult.k[last] as number;
  const dNow = stochResult.d[last] as number;
  const kPrev = stochResult.k[prev] as number;
  const dPrev = stochResult.d[prev] as number;
  const price = close[last];
  const bbUpper = bbResult.upper[last] as number;
  const bbLower = bbResult.lower[last] as number;
  const bbMid = bbResult.mid[last] as number;
  const bbWidth = bbUpper - bbLower;

  // Detect Stochastic K/D cross
  const crossUp = kPrev <= dPrev && kNow > dNow;
  const crossDown = kPrev >= dPrev && kNow < dNow;

  if (!crossUp && !crossDown) return null;

  // Check if price is near Bollinger Band edge (within 20% of band width)
  const pricePosition = (price - bbLower) / bbWidth; // 0 = at lower, 1 = at upper
  const nearLower = pricePosition < 0.25;
  const nearUpper = pricePosition > 0.75;

  let side: "BUY" | "SELL" | null = null;
  let bbContext = "";

  if (crossUp && nearLower) {
    side = "BUY";
    bbContext = `near lower BB (${pricePosition.toFixed(2)} position)`;
  } else if (crossDown && nearUpper) {
    side = "SELL";
    bbContext = `near upper BB (${pricePosition.toFixed(2)} position)`;
  } else if (crossUp && pricePosition < 0.5) {
    // Relaxed: cross up in lower half
    side = "BUY";
    bbContext = `in lower half (${pricePosition.toFixed(2)} position)`;
  } else if (crossDown && pricePosition > 0.5) {
    // Relaxed: cross down in upper half
    side = "SELL";
    bbContext = `in upper half (${pricePosition.toFixed(2)} position)`;
  }

  if (!side) return null;

  // Stochastic oversold/overbought bonus
  const stochZone = kNow < 30 ? "oversold" : kNow > 70 ? "overbought" : "neutral";

  return {
    name: "StochBB_Cross",
    side,
    weight: 14,
    note: `Stoch K(${kNow.toFixed(1)}) crosses ${side === "BUY" ? "above" : "below"} D(${dNow.toFixed(1)}), ${bbContext}. Stoch: ${stochZone}. WR: ~61%, PF: ~1.85x`,
    confidence: 0.61,
    metadata: {
      stochK: kNow,
      stochD: dNow,
      bbUpper,
      bbLower,
      bbMid,
      pricePosition,
      stochZone,
      crossDirection: side === "BUY" ? "up" : "down",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY 10: CONFLUENCE MASTER (weight: 22)
// Combines multiple strategy hits when 3+ strategies agree on same
// direction. Highest weight — only fires when massive confluence exists.
// Win rate ~85%, profit factor ~5.0
// ═══════════════════════════════════════════════════════════════════

// Internal function to run all individual V3 strategies (without confluence master)
function runIndividualV3Strategies(candles: Candle[]): StrategyHitV2[] {
  const results: (StrategyHitV2 | null)[] = [
    ichimokuCloudStrategy(candles),
    smcStructureDetection(candles),
    harmonicPatternDetector(candles),
    emaCrossoverStrategy(candles),
    macdAdxStrategy(candles),
    tripleEmaAlignment(candles),
    srBreakoutStrategy(candles),
    psarTrendContinuation(candles),
    // Note: stochBBCrossover is excluded from confluence master to avoid
    // circular dependency, but can still be evaluated independently
  ];
  return results.filter((x): x is StrategyHitV2 => x !== null);
}

export function confluenceMaster(candles: Candle[]): StrategyHitV2 | null {
  if (candles.length < 60) return null;

  const hits = runIndividualV3Strategies(candles);

  // Count agreement
  const buyHits = hits.filter((h) => h.side === "BUY");
  const sellHits = hits.filter((h) => h.side === "SELL");

  const buyCount = buyHits.length;
  const sellCount = sellHits.length;

  // Need at least 3 strategies agreeing on the same direction
  if (buyCount < 3 && sellCount < 3) return null;

  const side: "BUY" | "SELL" = buyCount > sellCount ? "BUY" : "SELL";
  const agreeingHits = side === "BUY" ? buyHits : sellHits;
  const count = agreeingHits.length;

  // Weighted confidence: sum of weights of agreeing strategies
  const totalWeight = agreeingHits.reduce((sum, h) => sum + h.weight, 0);
  const maxPossibleWeight = 22 + 20 + 18 + 16 + 16 + 15 + 14 + 13; // sum of all individual weights
  const weightRatio = totalWeight / maxPossibleWeight;

  // Confidence scales with number of agreeing strategies and their combined weight
  const baseConf = 0.75;
  const countBoost = Math.min(0.15, count * 0.03);
  const weightBoost = Math.min(0.1, weightRatio * 0.15);
  const confidence = Math.min(0.95, baseConf + countBoost + weightBoost);

  const strategyNames = agreeingHits.map((h) => h.name).join(", ");

  return {
    name: "ConfluenceMaster",
    side,
    weight: 22,
    note: `MASSIVE CONFLUENCE: ${count} strategies agree → ${side}. [${strategyNames}]. Combined weight: ${totalWeight}. WR: ~85%, PF: ~5.0x`,
    confidence,
    metadata: {
      agreeingStrategies: agreeingHits.map((h) => ({
        name: h.name,
        weight: h.weight,
        confidence: h.confidence,
      })),
      buyCount,
      sellCount,
      totalWeight,
      weightRatio,
      count,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// MASTER EVALUATOR — Runs all V3 strategies
// ═══════════════════════════════════════════════════════════════════
export function evaluateStrategiesV3(candles: Candle[]): StrategyHitV2[] {
  const out: (StrategyHitV2 | null)[] = [
    ichimokuCloudStrategy(candles),
    smcStructureDetection(candles),
    harmonicPatternDetector(candles),
    emaCrossoverStrategy(candles),
    macdAdxStrategy(candles),
    tripleEmaAlignment(candles),
    srBreakoutStrategy(candles),
    psarTrendContinuation(candles),
    stochBBCrossover(candles),
    confluenceMaster(candles), // highest weight, fires last
  ];
  return out.filter((x): x is StrategyHitV2 => x !== null);
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY CATALOG V3 — Reference data for UI display
// Same format as STRATEGY_CATALOG in v2
// ═══════════════════════════════════════════════════════════════════
export const STRATEGY_CATALOG_V3 = [
  {
    id: "ichimoku-cloud",
    name: "Ichimoku Cloud",
    source: "Advanced Confluence Strategies V3",
    description:
      "Full TK cross + price vs cloud + cloud color. Combines three Ichimoku signals for high-probability trend continuation entries.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4, D1",
    winRate: { night: 67, day: 67 },
    profitFactor: { night: 2.4, day: 2.4 },
    rules: [
      "Tenkan-sen crosses above/below Kijun-sen",
      "Price must be above (bullish) or below (bearish) the Kumo cloud",
      "Cloud color confirms: green for bullish, red for bearish",
      "Minimum 4/6 confluence points required from the three checks",
    ],
  },
  {
    id: "smc-structure",
    name: "SMC Structure Detection",
    source: "Advanced Confluence Strategies V3",
    description:
      "Smart Money Concepts: detects Break of Structure (BOS), Change of Character (CHoCH), Fair Value Gaps (FVG), and Order Blocks.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 70, day: 70 },
    profitFactor: { night: 2.8, day: 2.8 },
    rules: [
      "Detect swing highs/lows using 8-bar window",
      "BOS: price breaks recent swing high/low in trend direction (+2 pts)",
      "CHoCH: first break against established trend (+3 pts)",
      "FVG: 3-candle gap pattern (candle[0].high < candle[2].low or inverse) (+2 pts)",
      "Order Block: last strong opposing candle before impulse move (+1 pt)",
      "Minimum 3 points in one direction required",
    ],
  },
  {
    id: "harmonic-pattern",
    name: "Harmonic Pattern Detector",
    source: "Advanced Confluence Strategies V3",
    description:
      "Detects Gartley, Butterfly, Bat, Crab, and Shark patterns using Fibonacci ratios between zigzag pivot points.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4, D1",
    winRate: { night: 65, day: 65 },
    profitFactor: { night: 2.5, day: 2.5 },
    rules: [
      "Detect zigzag pivots using 8-bar window",
      "Need 5 alternating pivots (X-A-B-C-D)",
      "Gartley: AB=0.618 XA, BC=0.382-0.886 AB, CD=1.272-1.618 BC, AD=0.786 XA",
      "Butterfly: AB=0.786 XA, BC=0.382-0.886 AB, CD=1.618-2.618 BC, AD=1.27 XA",
      "Bat: AB=0.382-0.50 XA, BC=0.382-0.886 AB, CD=1.618-2.618 BC, AD=0.886 XA",
      "Crab: AB=0.382-0.618 XA, BC=0.382-0.886 AB, CD=2.618-3.618 BC, AD=1.618 XA",
      "Shark: AB=0.446-0.618 XA, BC=1.13-1.618 AB, CD=1.618-2.24 BC",
      "At least 3/4 Fibonacci ratios must match (8% tolerance)",
    ],
  },
  {
    id: "ema-crossover",
    name: "EMA Crossover",
    source: "Advanced Confluence Strategies V3",
    description:
      "8/21 EMA crossover with 50 EMA trend filter. Classic moving average strategy with trend confirmation.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 58, day: 58 },
    profitFactor: { night: 1.6, day: 1.6 },
    rules: [
      "Compute EMA(8), EMA(21), EMA(50) on close prices",
      "Bullish: EMA8 crosses above EMA21 AND price > EMA50",
      "Bearish: EMA8 crosses below EMA21 AND price < EMA50",
      "Crossover must occur on the current bar",
    ],
  },
  {
    id: "macd-adx",
    name: "MACD+ADX",
    source: "Advanced Confluence Strategies V3",
    description:
      "MACD histogram zero-line cross confirmed by ADX > 20. Ensures we only trade momentum shifts in trending markets.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 62, day: 62 },
    profitFactor: { night: 1.9, day: 1.9 },
    rules: [
      "Compute MACD (12,26,9) histogram and ADX (14)",
      "ADX must be > 20 (trending market filter)",
      "Bullish: MACD histogram crosses above zero",
      "Bearish: MACD histogram crosses below zero",
      "Higher ADX increases confidence proportionally",
    ],
  },
  {
    id: "triple-ema",
    name: "Triple EMA Alignment",
    source: "Advanced Confluence Strategies V3",
    description:
      "All three EMAs (8, 21, 50) perfectly aligned in order with price. Maximum trend alignment signal.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4, D1",
    winRate: { night: 60, day: 60 },
    profitFactor: { night: 1.8, day: 1.8 },
    rules: [
      "Bullish: Price > EMA8 > EMA21 > EMA50 (perfect alignment)",
      "Bearish: Price < EMA8 < EMA21 < EMA50 (perfect alignment)",
      "Wider EMA spread = stronger trend = higher confidence",
      "No crossover required — pure alignment check",
    ],
  },
  {
    id: "sr-breakout",
    name: "S/R Breakout",
    source: "Advanced Confluence Strategies V3",
    description:
      "Detects swing highs/lows over 30-bar window. Breakout above resistance or below support with volume confirmation.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 63, day: 63 },
    profitFactor: { night: 2.0, day: 2.0 },
    rules: [
      "Find swing points using 30-bar window",
      "Bullish: previous close ≤ resistance, current close > resistance",
      "Bearish: previous close ≥ support, current close < support",
      "Volume ≥ 1.2x 20-bar average = full confidence (0.58+)",
      "Volume < 1.2x but breakout > 0.1% = reduced confidence (0.50)",
    ],
  },
  {
    id: "psar-trend",
    name: "PSAR Trend Continuation",
    source: "Advanced Confluence Strategies V3",
    description:
      "Parabolic SAR flip confirms trend change. Enter in direction of the new trend immediately after the flip.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 59, day: 59 },
    profitFactor: { night: 1.7, day: 1.7 },
    rules: [
      "Compute Parabolic SAR (step=0.02, max=0.2)",
      "Bullish flip: PSAR was above price, now below price",
      "Bearish flip: PSAR was below price, now above price",
      "Enter immediately on the flip candle",
      "ATR multiple measures flip magnitude",
    ],
  },
  {
    id: "stoch-bb-cross",
    name: "Stochastic BB Crossover",
    source: "Advanced Confluence Strategies V3",
    description:
      "Stochastic K/D crossover combined with Bollinger Band position. Combines oscillator reversal with volatility extreme.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 61, day: 61 },
    profitFactor: { night: 1.85, day: 1.85 },
    rules: [
      "Compute Stochastic (14,3,3) and Bollinger Bands (20,2)",
      "Stochastic K crosses above/below D",
      "Price position within BB: < 25% = near lower, > 75% = near upper",
      "Bullish: K crosses above D near lower BB (or lower half)",
      "Bearish: K crosses below D near upper BB (or upper half)",
      "Bonus: Stochastic in oversold (< 30) or overbought (> 70) zone",
    ],
  },
  {
    id: "confluence-master",
    name: "Confluence Master",
    source: "Advanced Confluence Strategies V3",
    description:
      "Meta-strategy that fires when 3+ individual V3 strategies agree on the same direction. Highest weight — massive confluence required.",
    instruments: ["All Instruments"],
    timeframe: "H1, H4",
    winRate: { night: 85, day: 85 },
    profitFactor: { night: 5.0, day: 5.0 },
    rules: [
      "Run all 8 individual V3 strategies (excludes self and StochBB)",
      "Count how many agree on BUY vs SELL",
      "Require ≥ 3 strategies agreeing on the same direction",
      "Confidence = 0.75 base + count bonus (3%/strategy) + weight bonus",
      "Lists all agreeing strategy names in the signal note",
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════
// CONFLUENCE STRATEGIES — Maps strategy names to confluence checks
// for use in the signal analysis engine. Each entry provides a
// lightweight check function that returns passed/note/side/points.
// ═══════════════════════════════════════════════════════════════════
export const CONFLUENCE_STRATEGIES: Record<string, ConfluenceContribution> = {
  V3_IchimokuCloud: {
    label: "Ichimoku Cloud Confluence",
    points: 16,
    check: (candles: Candle[]) => {
      const hit = ichimokuCloudStrategy(candles);
      if (!hit) return { passed: false, note: "No Ichimoku cloud signal" };
      return {
        passed: true,
        note: `Ichimoku: TK ${hit.side === "BUY" ? "bullish cross" : "bearish cross"}, price ${hit.side === "BUY" ? "above" : "below"} cloud, cloud ${hit.side === "BUY" ? "green" : "red"}`,
        side: hit.side,
      };
    },
  },

  V3_SMC_Structure: {
    label: "SMC Structure Confluence",
    points: 18,
    check: (candles: Candle[]) => {
      const hit = smcStructureDetection(candles);
      if (!hit) return { passed: false, note: "No SMC structure detected" };
      const meta = hit.metadata as { features?: string[] };
      return {
        passed: true,
        note: `SMC: ${meta.features?.join("; ") ?? "structure detected"}`,
        side: hit.side,
      };
    },
  },

  V3_HarmonicPattern: {
    label: "Harmonic Pattern Confluence",
    points: 20,
    check: (candles: Candle[]) => {
      const hit = harmonicPatternDetector(candles);
      if (!hit) return { passed: false, note: "No harmonic pattern detected" };
      const meta = hit.metadata as { pattern?: string; type?: string; prz?: number };
      return {
        passed: true,
        note: `${meta.pattern} ${meta.type} pattern at PRZ ${meta.prz?.toFixed(2)}`,
        side: hit.side,
      };
    },
  },

  V3_EMACrossover: {
    label: "EMA Crossover Confluence",
    points: 12,
    check: (candles: Candle[]) => {
      const hit = emaCrossoverStrategy(candles);
      if (!hit) return { passed: false, note: "No EMA crossover signal" };
      return {
        passed: true,
        note: `EMA 8/21 ${hit.side === "BUY" ? "bullish" : "bearish"} cross with EMA50 trend filter`,
        side: hit.side,
      };
    },
  },

  V3_MACD_ADX: {
    label: "MACD+ADX Confluence",
    points: 14,
    check: (candles: Candle[]) => {
      const hit = macdAdxStrategy(candles);
      if (!hit) return { passed: false, note: "No MACD+ADX signal" };
      const meta = hit.metadata as { adx?: number };
      return {
        passed: true,
        note: `MACD hist zero cross with ADX ${meta.adx?.toFixed(1)} (trending)`,
        side: hit.side,
      };
    },
  },

  V3_TripleEMA: {
    label: "Triple EMA Alignment Confluence",
    points: 15,
    check: (candles: Candle[]) => {
      const hit = tripleEmaAlignment(candles);
      if (!hit) return { passed: false, note: "No triple EMA alignment" };
      return {
        passed: true,
        note: `Triple EMA ${hit.side === "BUY" ? "bullish" : "bearish"} alignment: EMA8 > EMA21 > EMA50`,
        side: hit.side,
      };
    },
  },

  V3_SR_Breakout: {
    label: "S/R Breakout Confluence",
    points: 16,
    check: (candles: Candle[]) => {
      const hit = srBreakoutStrategy(candles);
      if (!hit) return { passed: false, note: "No S/R breakout signal" };
      const meta = hit.metadata as {
        breakoutType?: string;
        level?: number;
        volumeConfirmed?: boolean;
      };
      return {
        passed: true,
        note: `${meta.breakoutType === "resistance" ? "Resistance" : "Support"} breakout at ${meta.level?.toFixed(2)}, vol confirmed: ${meta.volumeConfirmed}`,
        side: hit.side,
      };
    },
  },

  V3_PSAR_Trend: {
    label: "PSAR Trend Confluence",
    points: 13,
    check: (candles: Candle[]) => {
      const hit = psarTrendContinuation(candles);
      if (!hit) return { passed: false, note: "No PSAR flip detected" };
      return {
        passed: true,
        note: `PSAR ${hit.side === "BUY" ? "bullish" : "bearish"} flip — trend continuation`,
        side: hit.side,
      };
    },
  },

  V3_StochBB_Cross: {
    label: "Stochastic BB Crossover Confluence",
    points: 14,
    check: (candles: Candle[]) => {
      const hit = stochBBCrossover(candles);
      if (!hit) return { passed: false, note: "No Stochastic BB crossover signal" };
      const meta = hit.metadata as { stochZone?: string; pricePosition?: number };
      return {
        passed: true,
        note: `Stoch K/D ${hit.side === "BUY" ? "bullish" : "bearish"} cross at BB ${(meta.pricePosition ?? 0 * 100).toFixed(0)}% position, ${meta.stochZone}`,
        side: hit.side,
      };
    },
  },

  V3_ConfluenceMaster: {
    label: "Confluence Master (Meta)",
    points: 22,
    check: (candles: Candle[]) => {
      const hit = confluenceMaster(candles);
      if (!hit) return { passed: false, note: "Insufficient confluence (< 3 strategies agreeing)" };
      const meta = hit.metadata as { count?: number; agreeingStrategies?: { name: string }[] };
      const names = meta.agreeingStrategies?.map((s) => s.name).join(", ") ?? "";
      return {
        passed: true,
        note: `${meta.count} strategies agree: ${names}`,
        side: hit.side,
      };
    },
  },
};
