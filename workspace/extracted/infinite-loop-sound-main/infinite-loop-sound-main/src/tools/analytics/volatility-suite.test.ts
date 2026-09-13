import { describe, it, expect } from "vitest";
import {
  closeToClose,
  parkinson,
  garmanKlass,
  rogersSatchell,
  yangZhang,
  estimateAll,
  ewmaForecast,
  fitGarch11,
  consensusForecast,
} from "./volatility-suite";
import type { OHLCBar } from "./volatility-suite";

// Deterministic GBM path generator
function gbmBars(n: number, dailyVol: number, startPrice = 100, seed = 42): OHLCBar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const bars: OHLCBar[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const open = price;
    price *= Math.exp(-0.5 * dailyVol ** 2 + dailyVol * z);
    // Intraday range proportional to vol
    const wickUp = Math.abs(z) * dailyVol * 0.6;
    const wickDown = Math.abs(Math.sin(i)) * dailyVol * 0.5 + dailyVol * 0.3;
    bars.push({
      timestamp: Date.UTC(2026, 0, 1) + i * 86_400_000,
      open,
      high: Math.max(open, price) * (1 + wickUp),
      low: Math.min(open, price) * (1 - wickDown),
      close: price,
    });
  }
  return bars;
}

describe("volatility estimators", () => {
  const targetDailyVol = 0.01; // ~15.9% annualized
  const bars = gbmBars(400, targetDailyVol);

  it("close-to-close recovers the input vol within tolerance", () => {
    const est = closeToClose(bars);
    expect(est.annualizedVol).toBeGreaterThan(0.1);
    expect(est.annualizedVol).toBeLessThan(0.22);
    expect(est.sampleSize).toBe(399);
  });

  it("all estimators agree on the same data within a reasonable band", () => {
    const all = estimateAll(bars);
    for (const est of all) {
      expect(est.annualizedVol).toBeGreaterThan(0.05);
      expect(est.annualizedVol).toBeLessThan(0.35);
    }
    // Parkinson/GK/RS/YZ should be same order of magnitude as close-close
    const cc = all[0].annualizedVol;
    for (const est of all.slice(1)) {
      expect(est.annualizedVol).toBeLessThan(cc * 4 + 0.02);
      expect(est.annualizedVol).toBeGreaterThan(cc / 4 - 0.005);
    }
  });

  it("handles degenerate inputs without NaN", () => {
    const single: OHLCBar[] = [{ timestamp: 0, open: 1, high: 1, low: 1, close: 1 }];
    for (const fn of [closeToClose, parkinson, garmanKlass, rogersSatchell, yangZhang]) {
      const r = fn(single);
      expect(Number.isFinite(r.annualizedVol)).toBe(true);
      expect(r.annualizedVol).toBe(0);
    }
  });

  it("flat prices give zero volatility", () => {
    const flat: OHLCBar[] = Array.from({ length: 50 }, (_, i) => ({
      timestamp: i,
      open: 100,
      high: 100.0001,
      low: 99.9999,
      close: 100,
    }));
    expect(closeToClose(flat).annualizedVol).toBeCloseTo(0, 8);
    expect(yangZhang(flat).annualizedVol).toBeLessThan(0.001);
  });
});

describe("EWMA forecast", () => {
  it("reacts to a volatility spike", () => {
    const calm = gbmBars(200, 0.005, 100, 11);
    const spiked = calm.map((b, i) =>
      i >= 195
        ? {
            ...b,
            high: b.high * 1.04,
            low: b.low * 0.96,
            close: i === 199 ? b.close * 1.03 : b.close,
          }
        : b,
    );
    const before = ewmaForecast(calm).nextPeriodVol;
    const after = ewmaForecast(spiked).nextPeriodVol;
    expect(after).toBeGreaterThan(before);
  });

  it("returns an empty forecast for empty input", () => {
    const r = ewmaForecast([]);
    expect(r.nextPeriodVol).toBe(0);
    expect(r.path).toHaveLength(0);
  });
});

describe("GARCH(1,1)", () => {
  it("fits stationary parameters and forecasts finite vols", () => {
    const bars = gbmBars(500, 0.012, 100, 77);
    const fit = fitGarch11(bars);
    expect(fit).not.toBeNull();
    expect(fit!.params.persistence).toBeLessThan(1);
    expect(fit!.params.alpha).toBeGreaterThanOrEqual(0.02);
    expect(Number.isFinite(fit!.nextPeriodVol)).toBe(true);
    expect(fit!.multiStepForecast).toHaveLength(10);
    // Multi-step converges toward long-run vol (monotone-ish, bounded)
    const last = fit!.multiStepForecast[9];
    expect(Number.isFinite(last)).toBe(true);
  });

  it("returns null for short series", () => {
    const bars = gbmBars(20, 0.01);
    expect(fitGarch11(bars)).toBeNull();
  });
});

describe("consensusForecast", () => {
  it("blends estimators into one number", () => {
    const bars = gbmBars(300, 0.01, 100, 5);
    const c = consensusForecast(bars);
    expect(c.consensusAnnualizedVol).toBeGreaterThan(0.05);
    expect(c.estimates).toHaveLength(5);
    expect(c.garch).not.toBeNull();
  });
});
