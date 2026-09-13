// Divergence detection: compares pivots in price vs an oscillator series.

export type DivType = "regular_bull" | "regular_bear" | "hidden_bull" | "hidden_bear" | null;

export interface Pivot {
  idx: number;
  value: number;
}

export const findPivots = (
  src: (number | null)[],
  left = 3,
  right = 3,
): { highs: Pivot[]; lows: Pivot[] } => {
  const highs: Pivot[] = [],
    lows: Pivot[] = [];
  for (let i = left; i < src.length - right; i++) {
    const v = src[i];
    if (v == null) continue;
    let isHigh = true,
      isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      const w = src[j];
      if (w == null) {
        isHigh = false;
        isLow = false;
        break;
      }
      if (w >= v) isHigh = false;
      if (w <= v) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, value: v });
    if (isLow) lows.push({ idx: i, value: v });
  }
  return { highs, lows };
};

export interface DivergenceResult {
  type: DivType;
  priceA: Pivot;
  priceB: Pivot;
  oscA: Pivot;
  oscB: Pivot;
}

// Detect divergence on the most recent two pivots
export const detectDivergence = (
  price: number[],
  osc: (number | null)[],
  lookbackBars = 60,
): DivergenceResult | null => {
  const start = Math.max(0, price.length - lookbackBars);
  const pricePiv = findPivots(price.slice(start).map((v) => v) as (number | null)[]);
  const oscPiv = findPivots(osc.slice(start));
  // shift indexes back
  const shift = (p: Pivot[]): Pivot[] => p.map((x) => ({ idx: x.idx + start, value: x.value }));
  const pH = shift(pricePiv.highs),
    pL = shift(pricePiv.lows);
  const oH = shift(oscPiv.highs),
    oL = shift(oscPiv.lows);

  const matchOsc = (priceA: Pivot, priceB: Pivot, oscPivots: Pivot[]): [Pivot, Pivot] | null => {
    const findNear = (idx: number) =>
      oscPivots.reduce<Pivot | null>((best, p) => {
        if (Math.abs(p.idx - idx) > 4) return best;
        if (!best || Math.abs(p.idx - idx) < Math.abs(best.idx - idx)) return p;
        return best;
      }, null);
    const a = findNear(priceA.idx);
    const b = findNear(priceB.idx);
    if (a && b && a.idx !== b.idx) return [a, b];
    return null;
  };

  // Bearish — compare last two highs
  if (pH.length >= 2) {
    const [a, b] = pH.slice(-2);
    const m = matchOsc(a, b, oH);
    if (m) {
      const [oA, oB] = m;
      if (b.value > a.value && oB.value < oA.value)
        return { type: "regular_bear", priceA: a, priceB: b, oscA: oA, oscB: oB };
      if (b.value < a.value && oB.value > oA.value)
        return { type: "hidden_bear", priceA: a, priceB: b, oscA: oA, oscB: oB };
    }
  }
  // Bullish — compare last two lows
  if (pL.length >= 2) {
    const [a, b] = pL.slice(-2);
    const m = matchOsc(a, b, oL);
    if (m) {
      const [oA, oB] = m;
      if (b.value < a.value && oB.value > oA.value)
        return { type: "regular_bull", priceA: a, priceB: b, oscA: oA, oscB: oB };
      if (b.value > a.value && oB.value < oA.value)
        return { type: "hidden_bull", priceA: a, priceB: b, oscA: oA, oscB: oB };
    }
  }
  return null;
};

export const divDirection = (t: DivType): "BUY" | "SELL" | null => {
  if (t === "regular_bull" || t === "hidden_bull") return "BUY";
  if (t === "regular_bear" || t === "hidden_bear") return "SELL";
  return null;
};

export const divLabel = (t: DivType): string => {
  switch (t) {
    case "regular_bull":
      return "Regular Bullish";
    case "regular_bear":
      return "Regular Bearish";
    case "hidden_bull":
      return "Hidden Bullish";
    case "hidden_bear":
      return "Hidden Bearish";
    default:
      return "—";
  }
};
