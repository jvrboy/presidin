/**
 * Micro-account protection for a $2 real target.
 * Demo trains under the same constraints so live transfer is safe.
 */

export const MICRO = {
  /** Target real bankroll */
  bankroll: 2,
  /** Stake: keep risk ~5–10% of bankroll max per trade */
  stake: 0.35,
  maxOpen: 1,
  maxDailyLoss: 0.7,
  maxTradesPerDay: 8,
  confidenceThreshold: 0.68,
  cooldownMs: 180000, // 3 min between trades same symbol
  /** Prefer quieter synthetics for micro size */
  symbols: ['JD10', 'JD25', 'R_25', 'R_50', 'R_10'] as string[],
};

/**
 * Drift Switch Index (DSI10/20/30) is CFD-only on Deriv — not available on Options API.
 * Closest options-tradeable regime products:
 * - Jump indices JD10/JD25/JD50 (jump frequency)
 * - Step indices stpRNG*
 * - Bull/Bear RDBULL/RDBEAR
 */
export const SYMBOL_NOTES = {
  DSI: 'CFD only — not options-tradeable via API',
  jump: ['JD10', 'JD25', 'JD50', 'JD75', 'JD100'],
  step: ['stpRNG', 'stpRNG2', 'stpRNG3'],
  regime: ['RDBULL', 'RDBEAR'],
};
