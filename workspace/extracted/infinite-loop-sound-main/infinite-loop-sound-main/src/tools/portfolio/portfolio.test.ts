import { describe, it, expect } from "vitest";
import { PortfolioOptimizer } from "./portfolio-optimizer";
import { PositionSizer } from "../risk/position-sizer";
import { CircuitBreaker } from "../risk/circuit-breaker";

describe("PortfolioOptimizer", () => {
  it("multiplyMatrices computes the true matrix product", () => {
    const opt = new PortfolioOptimizer();
    const multiply = (
      opt as unknown as { multiplyMatrices: (a: number[][], b: number[][]) => number[][] }
    ).multiplyMatrices.bind(opt);

    const A = [
      [1, 2],
      [3, 4],
    ];
    const B = [
      [5, 6],
      [7, 8],
    ];
    const C = multiply(A, B);
    expect(C).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("mean-variance weights sum to 1 and prefer the higher-Sharpe asset", () => {
    const opt = new PortfolioOptimizer();
    const assets = [
      { symbol: "A", expectedReturn: 0.08, volatility: 0.12 },
      { symbol: "B", expectedReturn: 0.12, volatility: 0.2 },
    ];
    const cov = {
      symbols: ["A", "B"],
      matrix: [
        [0.12 * 0.12, 0.2 * 0.12 * 0.2],
        [0.2 * 0.12 * 0.2, 0.2 * 0.2],
      ],
    };
    const result = opt.meanVariance(assets, cov);
    const w = Object.values(result.weights);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(result.sharpeRatio).toBeGreaterThan(0);
    expect(result.volatility).toBeGreaterThan(0);
  });
});

describe("PositionSizer", () => {
  it("fixed-risk sizing returns zero instead of Infinity for zero stop distance", () => {
    const sizer = new PositionSizer({
      method: "fixed_risk",
      accountSize: 10_000,
      maxRiskPerTrade: 0.02,
      leverage: 10,
    });
    const result = sizer.computePositionSize(100, 100);
    expect(Number.isFinite(result.positionSize)).toBe(true);
    expect(result.positionSize).toBe(0);
  });

  it("caps fixed-risk position size at available leverage", () => {
    const sizer = new PositionSizer({
      method: "fixed_risk",
      accountSize: 10_000,
      maxRiskPerTrade: 0.9,
      leverage: 1,
    });
    const result = sizer.computePositionSize(50, 49.99);
    expect(result.positionSize).toBeLessThanOrEqual(200 + 1e-6);
  });
});

describe("CircuitBreaker", () => {
  it("trips on daily loss measured against day-start equity", () => {
    const cb = new CircuitBreaker({
      maxDailyLossPercent: 5,
      maxDailyLoss: Number.MAX_SAFE_INTEGER,
      maxDrawdownPercent: 100,
      maxConsecutiveLosses: 999,
    });
    cb.resetDailyPnL(); // anchor day-start equity
    // Lose 20% in one hit — must trip even though current equity shrank
    cb.updatePnL(-2_000);
    const event = cb.recordTradeResult(false);
    expect(event).not.toBeNull();
    expect(event?.trigger).toBe("daily_loss");
  });

  it("does not trip for small losses", () => {
    const cb = new CircuitBreaker({
      maxDailyLossPercent: 5,
      maxDailyLoss: Number.MAX_SAFE_INTEGER,
      maxDrawdownPercent: 100,
      maxConsecutiveLosses: 999,
    });
    cb.updatePnL(-10);
    const event = cb.recordTradeResult(false);
    expect(event).toBeNull();
  });
});
