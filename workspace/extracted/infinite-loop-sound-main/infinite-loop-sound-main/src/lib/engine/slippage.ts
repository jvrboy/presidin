// Slippage simulator — estimates expected slippage cost for a market order
// based on current volatility (ATR), spread, and order size relative to
// typical bar range. Returns expected pips lost + USD cost.

import { atr, type Candle } from "./indicators";
import { pipValue, distanceToPips } from "./pip-calc";

export interface SlippageResult {
  expectedPips: number;
  expectedCostUsd: number;
  regime: "calm" | "normal" | "volatile" | "chaotic";
  breakdown: {
    spreadPips: number;
    volatilityPips: number;
    sizePips: number;
  };
}

/**
 * Heuristic slippage model:
 *   total = spread + (atr_pct_of_typical_bar * sensitivity) + (size_penalty)
 * No order-book peek (Deriv public feed doesn't expose depth) so the size
 * penalty is a logarithmic function of lotSize.
 */
export function simulateSlippage(
  symbol: string,
  candles: Candle[],
  lotSize: number,
  spreadPips: number,
): SlippageResult {
  if (!candles.length) {
    return {
      expectedPips: spreadPips,
      expectedCostUsd: 0,
      regime: "calm",
      breakdown: { spreadPips, volatilityPips: 0, sizePips: 0 },
    };
  }
  const atrSeries = atr(candles, 14);
  const lastAtr = atrSeries[atrSeries.length - 1] ?? 0;
  const volatilityPips = lastAtr > 0 ? distanceToPips(symbol, lastAtr) * 0.1 : 0;
  const sizePips = Math.log10(Math.max(1, lotSize * 10)) * 0.5;

  let regime: SlippageResult["regime"] = "normal";
  if (volatilityPips < 2) regime = "calm";
  else if (volatilityPips < 8) regime = "normal";
  else if (volatilityPips < 20) regime = "volatile";
  else regime = "chaotic";

  const expectedPips = spreadPips + volatilityPips + sizePips;
  const info = pipValue(symbol, lotSize);
  const expectedCostUsd = expectedPips * info.pipValuePerLot * lotSize;

  return {
    expectedPips,
    expectedCostUsd,
    regime,
    breakdown: { spreadPips, volatilityPips, sizePips },
  };
}
