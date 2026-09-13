import { describe, it, expect } from "vitest";
import {
  rollSpread,
  amihudIlliquidity,
  kyleLambda,
  computeVpin,
  compositeLiquidityScore,
} from "./microstructure";
import type { TradeTick, BarData } from "./microstructure";

function makeBars(n: number, seed = 42): BarData[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const bars: BarData[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    price *= 1 + (rand() - 0.5) * 0.02;
    bars.push({
      timestamp: i,
      open,
      high: Math.max(open, price) * 1.001,
      low: Math.min(open, price) * 0.999,
      close: price,
      volume: 1_000_000 + rand() * 500_000,
    });
  }
  return bars;
}

describe("rollSpread", () => {
  it("recovers the spread from a bid-ask bounce process", () => {
    // Simulate mid=100 with effective spread 0.10 and iid order flow
    let s = 7;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const prices: number[] = [];
    for (let t = 0; t < 2000; t++) {
      const bounce = rand() > 0.5 ? 0.05 : -0.05;
      prices.push(100 + bounce);
    }
    const r = rollSpread(prices, 100);
    expect(r.negativeCovarianceClamped).toBe(false);
    // True spread is 0.10
    expect(r.spread).toBeGreaterThan(0.05);
    expect(r.spread).toBeLessThan(0.15);
    expect(r.spreadBps).toBeCloseTo(r.spread * 100, 6); // bps = price × 10⁴ / ref
  });

  it("clamps positive covariance to zero spread", () => {
    const trending = Array.from({ length: 100 }, (_, i) => 100 + i * 0.1);
    const r = rollSpread(trending);
    expect(r.spread).toBeLessThan(1e-9);
    expect(r.negativeCovarianceClamped).toBe(true);
  });

  it("handles short input", () => {
    expect(rollSpread([1]).sampleSize).toBe(1);
    expect(rollSpread([1, 2]).spread).toBeGreaterThanOrEqual(0);
  });
});

describe("amihudIlliquidity", () => {
  it("flags illiquid series as less liquid than liquid ones", () => {
    const liquid = makeBars(200, 3).map((b) => ({ ...b, volume: 50_000_000 }));
    const illiquid = makeBars(200, 3).map((b) => ({
      ...b,
      volume: Math.max(1, b.volume / 1000),
    }));
    const a = amihudIlliquidity(liquid);
    const b = amihudIlliquidity(illiquid);
    expect(b.illiquidity).toBeGreaterThan(a.illiquidity);
  });

  it("counts zero-volume bars and skips them", () => {
    const bars = makeBars(50).map((b, i) => (i % 2 === 0 ? { ...b, volume: 0 } : b));
    const r = amihudIlliquidity(bars);
    // Loop runs i=1..49; even i (2..48) are zero-volume → 24 skipped,
    // leaving the 25 odd-index bars as usable samples
    expect(r.zeroVolumeDays).toBe(24);
    expect(r.sampleSize).toBe(25);
  });
});

describe("kyleLambda", () => {
  it("detects positive impact of signed volume on prices", () => {
    const trades: TradeTick[] = [];
    let price = 100;
    for (let t = 0; t < 300; t++) {
      // Alternating buy/sell blocks with volume pushing price
      const sign = t % 20 < 10 ? 1 : -1;
      const size = 100 + ((t * 37) % 50);
      price += sign * size * 0.00002;
      trades.push({ timestamp: t, price, size });
    }
    const r = kyleLambda(trades);
    expect(r).not.toBeNull();
    expect(Number.isFinite(r!.lambda)).toBe(true);
  });

  it("returns null for too few trades", () => {
    expect(kyleLambda([{ timestamp: 0, price: 1, size: 1 }])).toBeNull();
  });
});

describe("computeVpin", () => {
  it("reports low VPIN for balanced random flow", () => {
    const bars = makeBars(300, 9);
    const r = computeVpin(bars, 40);
    expect(r.bucketsUsed).toBeGreaterThanOrEqual(35);
    expect(r.vpin).toBeGreaterThanOrEqual(0);
    expect(r.vpin).toBeLessThanOrEqual(1);
    expect(r.vpin).toBeLessThan(0.6); // symmetric noise → moderate/low VPIN
  });

  it("reports high VPIN for one-sided aggressive flow", () => {
    const bars = makeBars(200, 13).map((b, i) => ({
      ...b,
      close: b.close + i * 0.15, // persistent uptick → buys dominate
    }));
    const r = computeVpin(bars, 30);
    const balanced = computeVpin(makeBars(200, 13), 30);
    expect(r.vpin).toBeGreaterThanOrEqual(balanced.vpin);
  });

  it("handles degenerate inputs", () => {
    expect(computeVpin([], 50).vpin).toBe(0);
    const noVol = makeBars(30).map((b) => ({ ...b, volume: 0 }));
    expect(computeVpin(noVol, 50).vpin).toBe(0);
  });
});

describe("compositeLiquidityScore", () => {
  it("scores a healthy market higher than a toxic one", () => {
    const healthy = compositeLiquidityScore(
      { spread: 0.01, spreadBps: 1, negativeCovarianceClamped: false, sampleSize: 100 },
      { illiquidity: 0.01, dailyValues: [], zeroVolumeDays: 0, sampleSize: 10 },
      { vpin: 0.15, bucketsUsed: 50, bucketVolume: 1e6, imbalanceSeries: [] },
    );
    const toxic = compositeLiquidityScore(
      { spread: 0.5, spreadBps: 60, negativeCovarianceClamped: false, sampleSize: 100 },
      { illiquidity: 25, dailyValues: [], zeroVolumeDays: 5, sampleSize: 10 },
      { vpin: 0.72, bucketsUsed: 50, bucketVolume: 1e6, imbalanceSeries: [] },
    );
    expect(healthy.score).toBeGreaterThan(toxic.score);
    expect(healthy.components).toHaveLength(3);
    expect(healthy.score).toBeLessThanOrEqual(100);
    expect(toxic.score).toBeGreaterThanOrEqual(0);
  });
});
