// Range / consolidation breakout detector.
//
// Step 1: identify a tight consolidation — a window where the high-low range
// is less than `maxRangeAtrMult` ATRs.
// Step 2: flag a breakout when the current bar closes outside the range with
// expansion (range >= `breakoutAtrMult` * ATR).

import type { Candle } from "../indicators";
import { atr } from "../indicators";

export interface ConsolidationWindow {
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
  bars: number;
  rangeAtrMult: number;
}

export interface RangeBreakEvent {
  index: number;
  epoch: number;
  direction: "up" | "down";
  breakoutPrice: number;
  range: ConsolidationWindow;
  expansionAtrMult: number;
}

export interface RangeBreakScan {
  consolidations: ConsolidationWindow[];
  events: RangeBreakEvent[];
  latest: RangeBreakEvent | null;
}

export function detectRangeBreaks(
  candles: Candle[],
  minBars = 8,
  maxRangeAtrMult = 1.5,
  breakoutAtrMult = 1.0,
  atrLen = 14,
): RangeBreakScan {
  if (candles.length < atrLen + minBars + 2) {
    return { consolidations: [], events: [], latest: null };
  }
  const atrVals = atr(candles, atrLen);
  const consolidations: ConsolidationWindow[] = [];
  const events: RangeBreakEvent[] = [];

  for (let i = atrLen + minBars; i < candles.length; i++) {
    const a = atrVals[i] ?? 0;
    if (a <= 0) continue;
    const window = candles.slice(i - minBars, i);
    let hi = -Infinity,
      lo = Infinity;
    for (const c of window) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    const rangeMult = (hi - lo) / a;
    if (rangeMult > maxRangeAtrMult) continue;

    const cw: ConsolidationWindow = {
      startIdx: i - minBars,
      endIdx: i - 1,
      high: hi,
      low: lo,
      bars: minBars,
      rangeAtrMult: rangeMult,
    };

    const cur = candles[i];
    const expansionMult = (cur.high - cur.low) / a;
    if (cur.close > hi && expansionMult >= breakoutAtrMult) {
      const ev: RangeBreakEvent = {
        index: i,
        epoch: cur.epoch,
        direction: "up",
        breakoutPrice: cur.close,
        range: cw,
        expansionAtrMult: expansionMult,
      };
      events.push(ev);
      consolidations.push(cw);
    } else if (cur.close < lo && expansionMult >= breakoutAtrMult) {
      const ev: RangeBreakEvent = {
        index: i,
        epoch: cur.epoch,
        direction: "down",
        breakoutPrice: cur.close,
        range: cw,
        expansionAtrMult: expansionMult,
      };
      events.push(ev);
      consolidations.push(cw);
    }
  }

  return { consolidations, events, latest: events.length ? events[events.length - 1] : null };
}
