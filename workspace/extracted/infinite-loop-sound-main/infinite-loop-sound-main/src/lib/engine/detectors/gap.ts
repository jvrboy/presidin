// Price gap detection — useful for indices, crypto, and weekend FX opens.
//
// A gap is when the current bar's open is materially distant from the
// previous bar's close. Classified by direction and size relative to ATR.

import type { Candle } from "../indicators";
import { atr } from "../indicators";

export type GapKind =
  | "none"
  | "breakaway-up"
  | "breakaway-down"
  | "exhaustion-up"
  | "exhaustion-down";

export interface GapEvent {
  index: number;
  epoch: number;
  gapSize: number; // signed price distance
  gapAtrMult: number; // gap size / ATR(14)
  kind: GapKind;
  filled: boolean; // did a later bar trade back through the gap?
  filledAtIndex?: number;
}

export interface GapScan {
  events: GapEvent[];
  latest: GapEvent | null;
  unfilledGaps: GapEvent[];
}

export function detectGaps(candles: Candle[], minAtrMult = 0.5, atrLen = 14): GapScan {
  if (candles.length < atrLen + 2) return { events: [], latest: null, unfilledGaps: [] };
  const atrVals = atr(candles, atrLen);
  const events: GapEvent[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const a = atrVals[i] ?? atrVals[i - 1];
    if (a == null || a <= 0) continue;
    const gap = cur.open - prev.close;
    const mult = Math.abs(gap) / a;
    if (mult < minAtrMult) continue;

    // Exhaustion = gap in same direction as a strong prior run
    const lookback = candles.slice(Math.max(0, i - 5), i);
    const trendUp = lookback.every((c) => c.close >= c.open);
    const trendDown = lookback.every((c) => c.close <= c.open);
    let kind: GapKind;
    if (gap > 0) kind = trendUp ? "exhaustion-up" : "breakaway-up";
    else kind = trendDown ? "exhaustion-down" : "breakaway-down";

    events.push({
      index: i,
      epoch: cur.epoch,
      gapSize: gap,
      gapAtrMult: mult,
      kind,
      filled: false,
    });
  }

  // Compute fills
  for (const ev of events) {
    const refPrice = candles[ev.index - 1].close;
    for (let j = ev.index + 1; j < candles.length; j++) {
      const traded = ev.gapSize > 0 ? candles[j].low <= refPrice : candles[j].high >= refPrice;
      if (traded) {
        ev.filled = true;
        ev.filledAtIndex = j;
        break;
      }
    }
  }

  return {
    events,
    latest: events.length ? events[events.length - 1] : null,
    unfilledGaps: events.filter((e) => !e.filled),
  };
}
