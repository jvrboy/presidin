// Pip value & spread cost calculator. Forex-aware: JPY pairs use 0.01 pip,
// metals (XAU/XAG) use 0.1, indices use 1.0. Crypto pairs treat tickSize as pip.

export interface PipInfo {
  pipSize: number; // price unit of 1 pip
  pipValuePerLot: number; // USD value of 1 pip per 1.0 standard lot (100k)
  spreadCostUsd: number; // cost of the spread at given lot size
}

export function pipSizeFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.startsWith("XAU") || s.includes("GOLD")) return 0.1;
  if (s.startsWith("XAG") || s.includes("SILVER")) return 0.01;
  if (s.startsWith("BTC") || s.startsWith("ETH")) return 1.0;
  if (s.includes("R_") || s.includes("BOOM") || s.includes("CRASH")) return 0.01;
  return 0.0001; // standard fx
}

/**
 * Compute pip value per standard lot. For pairs quoted in USD this is a
 * direct calculation; for others we accept a quote rate to USD.
 */
export function pipValue(symbol: string, lotSize: number, quoteToUsdRate = 1): PipInfo {
  const pipSize = pipSizeFor(symbol);
  // 1 std lot = 100,000 units of base currency
  const valuePerLot = (pipSize / 1) * 100_000 * quoteToUsdRate;
  return {
    pipSize,
    pipValuePerLot: valuePerLot,
    spreadCostUsd: valuePerLot * lotSize,
  };
}

/** Convert a price distance into pips for a symbol. */
export function distanceToPips(symbol: string, distance: number): number {
  return distance / pipSizeFor(symbol);
}
