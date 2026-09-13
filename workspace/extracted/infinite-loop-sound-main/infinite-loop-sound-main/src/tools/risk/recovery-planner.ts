/**
 * Recovery Planner — drawdown recovery mathematics and risk-calibrated plans.
 * Computes the return required to recover from a drawdown, the risk of ruin
 * while recovering, and a Kelly-calibrated sizing plan that balances recovery
 * speed against ruin probability.
 */

export interface RecoveryRequirement {
  drawdownPercent: number; // peak-to-trough loss, 0..100
  requiredGainPercent: number; // gain on trough equity to reach prior peak
  gainToLossRatio: number; // requiredGain / drawdown
}

export function recoveryRequirement(drawdownPercent: number): RecoveryRequirement {
  if (drawdownPercent <= 0) {
    return { drawdownPercent: 0, requiredGainPercent: 0, gainToLossRatio: 0 };
  }
  const dd = Math.min(drawdownPercent, 100);
  const required = (100 / (100 - dd) - 1) * 100;
  return {
    drawdownPercent: dd,
    requiredGainPercent: required,
    gainToLossRatio: dd === 100 ? Infinity : required / dd,
  };
}

export interface RecoveryPlan {
  drawdownPercent: number;
  riskPerTrade: number; // fraction of current equity
  rewardRiskRatio: number;
  expectedTradesToRecover: number;
  ruinProbability: number; // probability of hitting -50% more before recovering
  expectedTradesToRuin: number;
  verdict: "conservative" | "balanced" | "aggressive" | "dangerous";
  notes: string[];
}

/**
 * Build a recovery plan for a trader in a drawdown.
 * winRate and rewardRisk describe the strategy's edge; riskPerTrade is the
 * fraction of current equity risked per trade while recovering.
 */
export function buildRecoveryPlan(
  drawdownPercent: number,
  winRate: number,
  rewardRiskRatio: number,
  riskPerTrade: number,
): RecoveryPlan {
  const req = recoveryRequirement(drawdownPercent);
  const notes: string[] = [];

  const p = Math.min(Math.max(winRate, 0), 1);
  const b = Math.max(rewardRiskRatio, 0.01);
  const f = riskPerTrade;
  const expectancy = p * b - (1 - p); // in R multiples

  // Expected R needed to recover (log-space): trades ≈ ln(1/(1-dd)) / E[ln(1+f·R)]
  let expectedTradesToRecover = Infinity;
  if (req.drawdownPercent > 0 && f > 0) {
    // E[ln(1 + f·R)] where R = +b with prob p, -1 with prob (1-p)
    const eLog = p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f);
    if (eLog > 0) {
      expectedTradesToRecover = Math.log(1 / (1 - req.drawdownPercent / 100)) / eLog;
    }
  }

  // Gambler's ruin with fractional betting: approximate via drift/variance of log equity
  const eLogStep = f > 0 ? p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f) : -Infinity;
  const varLogStep =
    f > 0 ? p * Math.log(1 + f * b) ** 2 + (1 - p) * Math.log(1 - f) ** 2 - eLogStep ** 2 : 0;
  // Distance to a further -50% from current equity, in log units
  const logDist = Math.log(2);
  let ruinProbability = 1;
  if (eLogStep > 0) {
    // Brownian-approximation ruin probability over a long horizon
    ruinProbability = Math.exp((-2 * eLogStep * logDist) / (varLogStep || 1e-9));
    ruinProbability = Math.min(1, Math.max(0, ruinProbability));
  }

  // Expected trades until ruin at the same drift
  let expectedTradesToRuin = Infinity;
  if (eLogStep !== 0 && Number.isFinite(eLogStep)) {
    expectedTradesToRuin = logDist / Math.abs(eLogStep);
    if (eLogStep > 0) expectedTradesToRuin = Infinity; // drift up → ruin not certain
  }

  const verdict: RecoveryPlan["verdict"] = (() => {
    if (f > 0.25 || ruinProbability > 0.5) return "dangerous";
    if (f > 0.1 || ruinProbability > 0.25) return "aggressive";
    if (f > 0.03) return "balanced";
    return "conservative";
  })();

  if (expectancy <= 0) {
    notes.push(
      "Strategy has negative expectancy at this win rate / reward:risk — no sizing plan can recover; stop trading and re-evaluate the edge.",
    );
  }
  if (req.gainToLossRatio > 3 && req.drawdownPercent >= 50) {
    notes.push(
      `A ${req.drawdownPercent.toFixed(0)}% drawdown needs a ${req.requiredGainPercent.toFixed(0)}% gain to recover — consider halting and restarting with fresh capital.`,
    );
  }
  const kelly = expectancy > 0 ? expectancy / b : 0;
  if (f > kelly && kelly > 0) {
    notes.push(
      `Risk per trade (${(f * 100).toFixed(1)}%) exceeds the Kelly optimum (${(kelly * 100).toFixed(1)}%) — over-betting slows recovery.`,
    );
  }
  if (notes.length === 0) {
    notes.push("Plan is mathematically sound: positive expectancy, sizing below Kelly.");
  }

  return {
    drawdownPercent: req.drawdownPercent,
    riskPerTrade: f,
    rewardRiskRatio: b,
    expectedTradesToRecover,
    ruinProbability,
    expectedTradesToRuin,
    verdict,
    notes,
  };
}

/** Table of required gains for common drawdowns — useful for UI display. */
export function recoveryTable(): { drawdown: number; requiredGain: number }[] {
  return [5, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((dd) => ({
    drawdown: dd,
    requiredGain: recoveryRequirement(dd).requiredGainPercent,
  }));
}
