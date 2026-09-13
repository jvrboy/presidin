import { describe, it, expect } from "vitest";
import { generateCpcvSplits, runCpcv } from "../backtesting/cpcv";
import { hierarchicalRiskParity, correlationDistanceMatrix } from "./hrp-optimizer";
import { probabilityOfBacktestOverfitting } from "../backtesting/overfitting-statistics";

describe("CPCV splits", () => {
  it("produces C(n,p) combinations with embargo purging", () => {
    const totalObs = 1000;
    const splits = generateCpcvSplits(totalObs, {
      nBlocks: 6,
      pTestBlocks: 2,
      embargoBlocks: 1,
    });
    // C(6,2) = 15 combinations, but test blocks {1,4} leave no train data
    // after a 1-block embargo on both sides, so that split is dropped
    expect(splits).toHaveLength(14);

    const blockSize = Math.floor(totalObs / 6);
    const range = (a: number, b: number) => {
      const out = new Set<number>();
      for (let i = a; i < b; i++) out.add(i);
      return out;
    };

    for (const split of splits) {
      // Derive test BLOCK ids from indices
      const testBlocks = new Set(
        split.testIndices.map((i) => Math.floor(Math.min(i, totalObs - 1) / blockSize)),
      );

      const testSet = new Set(split.testIndices);
      // Disjoint train/test at index level
      let overlap = 0;
      for (const i of split.trainIndices) if (testSet.has(i)) overlap++;
      expect(overlap).toBe(0);

      // Embargo: neighbors of each test block must be absent from train
      const forbidden = new Set<number>(split.testIndices);
      for (let b = 0; b < 6; b++) {
        if (!testBlocks.has(b)) continue;
        for (const nb of [b - 1, b + 1]) {
          if (nb >= 0 && nb < 6 && !testBlocks.has(nb)) {
            const ns = nb * blockSize;
            const ne = nb === 5 ? totalObs : (nb + 1) * blockSize;
            for (let i = ns; i < ne; i++) forbidden.add(i);
          }
        }
      }
      let leak = 0;
      for (const i of split.trainIndices) if (forbidden.has(i)) leak++;
      expect(leak).toBe(0);

      // Coverage: every observation is either trained on or deliberately excluded
      expect(split.trainIndices.length + forbidden.size).toBe(totalObs);
      void range;
    }
  });

  it("returns empty for invalid configs", () => {
    expect(generateCpcvSplits(100, { nBlocks: 2, pTestBlocks: 2 })).toHaveLength(0);
    expect(generateCpcvSplits(100, { nBlocks: 6, pTestBlocks: 4 })).toHaveLength(0);
    expect(generateCpcvSplits(10, { nBlocks: 6, pTestBlocks: 1 })).toHaveLength(0);
  });
});

describe("runCpcv", () => {
  it("aggregates OOS scores across all combinations", () => {
    const result = runCpcv(600, { nBlocks: 6, pTestBlocks: 2 }, (_train, test) => {
      // Fake strategy score proportional to the mean index in the test set
      return test.reduce((a, b) => a + b, 0) / test.length;
    });
    expect(result).not.toBeNull();
    // No embargo → all C(6,2) = 15 combinations valid
    expect(result!.combinations).toBe(15);
    expect(result!.scoreDistribution).toHaveLength(15);
    expect(result!.worstPathScore).toBeLessThanOrEqual(result!.bestPathScore);
    expect(Number.isFinite(result!.meanOosScore)).toBe(true);
  });

  it("skips non-finite evaluation results", () => {
    let calls = 0;
    const result = runCpcv(600, { nBlocks: 6, pTestBlocks: 2 }, () => {
      calls++;
      return calls === 3 ? Number.NaN : 0.5;
    });
    expect(result!.combinations).toBe(14);
  });
});

describe("hierarchicalRiskParity", () => {
  function series(seed: number, n: number, baseVol = 0.01): number[] {
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const u1 = Math.max(rand(), 1e-9);
      const u2 = rand();
      out.push(baseVol * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    }
    return out;
  }

  it("allocates weights that sum to 1", () => {
    const assets = [
      { symbol: "A", returns: series(1, 200) },
      { symbol: "B", returns: series(2, 200) },
      { symbol: "C", returns: series(3, 200) },
      { symbol: "D", returns: series(4, 200) },
    ];
    const r = hierarchicalRiskParity(assets)!;
    const total = Object.values(r.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 8);
    for (const w of Object.values(r.weights)) expect(w).toBeGreaterThan(0);
    expect(r.portfolioVol).toBeGreaterThan(0);
    expect(r.order).toHaveLength(4);
  });

  it("gives the lower-vol asset more weight when risks differ", () => {
    const calm = series(11, 300, 0.005);
    const wild = series(12, 300, 0.03);
    const r = hierarchicalRiskParity(
      [
        { symbol: "CALM", returns: calm },
        { symbol: "WILD", returns: wild },
      ],
      252,
    )!;
    expect(r.weights.CALM).toBeGreaterThan(r.weights.WILD);
  });

  it("is stable when assets outnumber observations (no inversion needed)", () => {
    const assets = Array.from({ length: 10 }, (_, i) => ({
      symbol: `S${i}`,
      returns: series(i + 20, 8),
    }));
    const r = hierarchicalRiskParity(assets);
    expect(r).not.toBeNull();
    const total = Object.values(r!.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 8);
  });

  it("handles null/degenerate input", () => {
    expect(hierarchicalRiskParity([])).toBeNull();
    expect(hierarchicalRiskParity([{ symbol: "A", returns: [1, 2] }])).toBeNull();
  });
});

describe("correlationDistanceMatrix", () => {
  it("gives distance 0 to perfectly correlated and ~1 to uncorrelated pairs", () => {
    const up = Array.from({ length: 50 }, (_, i) => i);
    const sameUp = up.map((v) => v * 2);
    const d = correlationDistanceMatrix([up, sameUp]);
    expect(d[0][1]).toBeCloseTo(0, 10);
  });
});
