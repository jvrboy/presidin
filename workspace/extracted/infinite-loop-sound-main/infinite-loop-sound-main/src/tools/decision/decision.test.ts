import { describe, it, expect } from "vitest";
import { MultiCriteriaDecisionAnalyzer } from "./multi-criteria-analyzer";
import { FuzzyDecisionEngine } from "./fuzzy-decision-engine";

describe("MultiCriteriaDecisionAnalyzer", () => {
  it("gives consistencyRatio ≈ 0 for a perfectly consistent AHP matrix", () => {
    const analyzer = new MultiCriteriaDecisionAnalyzer();
    // Perfectly consistent pairwise matrix (A/C = A/B * B/C = 9)
    const matrix = [
      [1, 3, 9],
      [1 / 3, 1, 3],
      [1 / 9, 1 / 3, 1],
    ];
    const weights = (analyzer as unknown as { ahpWeights: (m: number[][]) => number[] }).ahpWeights(
      matrix,
    );
    const cr = (
      analyzer as unknown as { consistencyRatio: (m: number[][], w: number[]) => number }
    ).consistencyRatio(matrix, weights);
    expect(cr).toBeCloseTo(0, 6);
  });
});

describe("FuzzyDecisionEngine", () => {
  it("handles degenerate triangular membership without NaN", () => {
    const engine = new FuzzyDecisionEngine();
    const tri = engine.triangular(5, 5, 8); // a == b
    expect(tri(5)).toBe(1);
    expect(tri(6)).toBeGreaterThan(0);
    expect(Number.isNaN(tri(4))).toBe(false);
    const trap = engine.trapezoidal(2, 2, 6, 8); // a == b
    expect(trap(3)).toBe(1);
    expect(trap(7)).toBeCloseTo(0.5, 5);
    expect(Number.isFinite(trap(1.5))).toBe(true);
  });
});
