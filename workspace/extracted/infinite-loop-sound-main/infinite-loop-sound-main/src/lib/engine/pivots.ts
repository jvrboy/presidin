// Classic / Fibonacci / Camarilla daily pivot points.
// Pure functions. Inputs are the previous session's H/L/C.

export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  kind: "classic" | "fibonacci" | "camarilla";
}

export function classicPivots(prevHigh: number, prevLow: number, prevClose: number): PivotLevels {
  const pp = (prevHigh + prevLow + prevClose) / 3;
  const range = prevHigh - prevLow;
  return {
    kind: "classic",
    pp,
    r1: 2 * pp - prevLow,
    s1: 2 * pp - prevHigh,
    r2: pp + range,
    s2: pp - range,
    r3: prevHigh + 2 * (pp - prevLow),
    s3: prevLow - 2 * (prevHigh - pp),
  };
}

export function fibonacciPivots(prevHigh: number, prevLow: number, prevClose: number): PivotLevels {
  const pp = (prevHigh + prevLow + prevClose) / 3;
  const range = prevHigh - prevLow;
  return {
    kind: "fibonacci",
    pp,
    r1: pp + 0.382 * range,
    s1: pp - 0.382 * range,
    r2: pp + 0.618 * range,
    s2: pp - 0.618 * range,
    r3: pp + 1.0 * range,
    s3: pp - 1.0 * range,
  };
}

export function camarillaPivots(prevHigh: number, prevLow: number, prevClose: number): PivotLevels {
  const range = prevHigh - prevLow;
  return {
    kind: "camarilla",
    pp: prevClose,
    r1: prevClose + (range * 1.1) / 12,
    s1: prevClose - (range * 1.1) / 12,
    r2: prevClose + (range * 1.1) / 6,
    s2: prevClose - (range * 1.1) / 6,
    r3: prevClose + (range * 1.1) / 4,
    s3: prevClose - (range * 1.1) / 4,
  };
}
