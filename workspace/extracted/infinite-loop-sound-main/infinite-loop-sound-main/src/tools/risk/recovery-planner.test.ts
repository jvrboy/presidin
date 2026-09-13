import { describe, it, expect } from "vitest";
import { RegimeDetector } from "../monitoring/regime-detector";
import { buildRecoveryPlan, recoveryRequirement, recoveryTable } from "./recovery-planner";

describe("RegimeDetector", () => {
  let seed = 99;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  it("classifies a strong uptrend as bull", () => {
    const detector = new RegimeDetector({ windowSize: 40, volLookback: 120, minObservations: 20 });
    let result = detector.update(100);
    for (let i = 1; i < 140; i++) {
      // steady climb with realistic noise
      result = detector.update(100 * Math.exp(i * 0.002 + (rand() - 0.5) * 0.001));
    }
    expect(result.state).toBe("bull");
    expect(result.probabilities.bull).toBeGreaterThan(0.4);
  });

  it("classifies a strong downtrend as bear", () => {
    seed = 31;
    const detector = new RegimeDetector({ windowSize: 40, volLookback: 120, minObservations: 20 });
    let result = detector.update(200);
    for (let i = 1; i < 140; i++) {
      result = detector.update(200 * Math.exp(-i * 0.002 + (rand() - 0.5) * 0.001));
    }
    expect(result.state).toBe("bear");
    expect(result.probabilities.bear).toBeGreaterThan(0.4);
  });

  it("classifies sideways noise as range", () => {
    seed = 7;
    const detector = new RegimeDetector({ windowSize: 40, volLookback: 160, minObservations: 20 });
    let result = detector.update(100);
    for (let i = 1; i < 180; i++) {
      result = detector.update(100 + Math.sin(i / 3) + (rand() - 0.5) * 0.6);
    }
    expect(result.state).toBe("range");
  });

  it("reports neutral classification before enough data", () => {
    const detector = new RegimeDetector({ minObservations: 30 });
    const result = detector.update(100);
    expect(result.confidence).toBe(0);
    expect(result.state).toBe("range");
  });

  it("rejects invalid prices and resets cleanly", () => {
    const detector = new RegimeDetector();
    expect(() => detector.update(-5)).toThrow();
    expect(() => detector.update(Number.NaN)).toThrow();
    detector.reset();
    const r = detector.update(50);
    expect(r.state).toBe("range");
  });

  it("transition matrix rows stay normalized", () => {
    const detector = new RegimeDetector({ minObservations: 10 });
    for (let i = 1; i < 60; i++) detector.update(100 + i);
    const m = detector.update(160).transitionMatrix;
    m.forEach((row) => {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });
  });
});

describe("recoveryRequirement", () => {
  it("computes the asymmetric gain needed after losses", () => {
    expect(recoveryRequirement(0).requiredGainPercent).toBe(0);
    expect(recoveryRequirement(10).requiredGainPercent).toBeCloseTo(11.11, 2);
    expect(recoveryRequirement(50).requiredGainPercent).toBeCloseTo(100, 5);
    expect(recoveryRequirement(90).requiredGainPercent).toBeCloseTo(900, 5);
    // >100% drawdown is clamped to total loss
    expect(recoveryRequirement(150).requiredGainPercent).toBe(Infinity);
  });

  it("caps at total loss", () => {
    const r = recoveryRequirement(100);
    expect(r.requiredGainPercent).toBe(Infinity);
    expect(r.gainToLossRatio).toBe(Infinity);
  });
});

describe("buildRecoveryPlan", () => {
  it("flags dangerous sizing", () => {
    const plan = buildRecoveryPlan(30, 0.45, 1.5, 0.5); // risking 50%/trade
    expect(plan.verdict).toBe("dangerous");
    expect(plan.ruinProbability).toBeGreaterThan(0.5);
  });

  it("warns on negative expectancy strategies", () => {
    const plan = buildRecoveryPlan(20, 0.3, 1.0, 0.02); // EV = 0.3*1 - 0.7 < 0
    expect(plan.notes.some((n) => n.includes("negative expectancy"))).toBe(true);
  });

  it("produces finite recovery estimates for sound plans", () => {
    const plan = buildRecoveryPlan(20, 0.55, 1.5, 0.03);
    expect(plan.expectedTradesToRecover).toBeLessThan(500);
    expect(plan.ruinProbability).toBeLessThan(0.25);
    expect(["conservative", "balanced"]).toContain(plan.verdict);
  });

  it("no drawdown → nothing to recover", () => {
    const plan = buildRecoveryPlan(0, 0.55, 1.5, 0.05);
    expect(plan.drawdownPercent).toBe(0);
    expect(plan.expectedTradesToRecover).toBe(Infinity);
  });
});

describe("recoveryTable", () => {
  it("monotonically increases", () => {
    const table = recoveryTable();
    for (let i = 1; i < table.length; i++) {
      expect(table[i].requiredGain).toBeGreaterThan(table[i - 1].requiredGain);
    }
  });
});
