import { describe, it, expect } from "vitest";
import {
  deflatedSharpeRatio,
  expectedMaxSharpe,
  probabilisticSharpeRatio,
  probabilityOfBacktestOverfitting,
  computeReturnStats,
} from "./overfitting-statistics";

function normalReturns(n: number, mean: number, std: number): number[] {
  // Box–Muller with a fixed seed for determinism
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const mag = std * Math.sqrt(-2 * Math.log(u1));
    out.push(mean + mag * Math.cos(2 * Math.PI * u2));
    if (out.length < n) out.push(mean + mag * Math.sin(2 * Math.PI * u2));
  }
  return out;
}

describe("computeReturnStats", () => {
  it("matches closed-form moments for a simple series", () => {
    const stats = computeReturnStats([0.01, -0.01, 0.02, -0.02]);
    expect(stats.mean).toBeCloseTo(0, 10);
    expect(stats.std).toBeGreaterThan(0);
    expect(stats.n).toBe(4);
  });
});

describe("probabilisticSharpeRatio", () => {
  it("is high for a strong positive Sharpe and low for negative", () => {
    const good = normalReturns(500, 0.001, 0.01);
    const bad = good.map((r) => -r); // exact mirror image
    expect(probabilisticSharpeRatio(computeReturnStats(good), 0)).toBeGreaterThan(0.9);
    expect(probabilisticSharpeRatio(computeReturnStats(bad), 0)).toBeLessThan(0.1);
  });

  it("returns 0.5 for degenerate input", () => {
    expect(probabilisticSharpeRatio({ mean: 0, std: 0, skewness: 0, kurtosis: 3, n: 5 }, 0)).toBe(
      0.5,
    );
  });
});

describe("expectedMaxSharpe", () => {
  it("increases with the number of trials (selection bias)", () => {
    const few = expectedMaxSharpe(5, 1);
    const many = expectedMaxSharpe(1000, 1);
    expect(many).toBeGreaterThan(few);
    expect(expectedMaxSharpe(1, 1)).toBe(0);
  });
});

describe("deflatedSharpeRatio", () => {
  it("deflates more when many trials were run", () => {
    const returns = normalReturns(400, 0.0008, 0.01);
    const single = deflatedSharpeRatio(returns, { trials: 1 });
    const hunted = deflatedSharpeRatio(returns, { trials: 10000 });
    expect(hunted.deflatedSharpeProbability).toBeLessThanOrEqual(single.deflatedSharpeProbability);
    expect(["robust", "marginal", "likely_overfit"]).toContain(single.verdict);
  });
});

describe("probabilityOfBacktestOverfitting", () => {
  it("reports low PBO when IS-best generalizes OOS", () => {
    // config 0 is best everywhere → no overfitting
    const matrix = Array.from({ length: 6 }, (_, s) => [0.05 + s * 0.001, 0.01, 0.02, 0.03]);
    const result = probabilityOfBacktestOverfitting(matrix);
    expect(result.pbo).toBeLessThan(0.2);
    expect(result.combinationsTested).toBeGreaterThan(0);
  });

  it("reports high PBO when IS performance inverts OOS", () => {
    // config A alternates huge wins/losses across blocks; config B is flat.
    // Whatever half the IS picks, its best config underperforms on OOS.
    const matrix = [
      [10, 1],
      [-10, 1],
      [10, 1],
      [-10, 1],
      [10, 1],
      [-10, 1],
    ];
    const result = probabilityOfBacktestOverfitting(matrix);
    expect(result.pbo).toBeGreaterThan(0.3);
    expect(result.combinationsTested).toBe(20); // C(6,3)
  });

  it("handles degenerate inputs", () => {
    expect(probabilityOfBacktestOverfitting([[1], [2], [3]]).combinationsTested).toBe(0);
    expect(probabilityOfBacktestOverfitting([[1, 2]]).combinationsTested).toBe(0);
  });
});
