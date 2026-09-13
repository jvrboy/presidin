// News-event spike detector.
//
// A "news spike" is a price spike that coincides with a high-impact economic
// release. This module composes detectSpikes() with a list of known event
// timestamps (sourced from the calendar/forex-calendar Supabase function in
// the UI layer) and tags spikes whose epoch falls inside +/- toleranceSec of
// an event.

import type { Candle } from "../indicators";
import { detectSpikes, type SpikeEvent } from "./spike";

export interface NewsEvent {
  epoch: number; // event time in seconds
  title: string;
  impact: "low" | "medium" | "high";
  currency?: string;
}

export interface NewsSpikeMatch {
  spike: SpikeEvent;
  event: NewsEvent;
  deltaSec: number; // signed: positive = spike after event
}

export interface NewsSpikeScan {
  matches: NewsSpikeMatch[];
  latest: NewsSpikeMatch | null;
}

export function detectNewsSpikes(
  candles: Candle[],
  events: NewsEvent[],
  toleranceSec = 300,
  zThreshold = 2.5,
): NewsSpikeScan {
  const scan = detectSpikes(candles, 50, zThreshold);
  if (!scan.events.length || !events.length) return { matches: [], latest: null };

  const matches: NewsSpikeMatch[] = [];
  for (const sp of scan.events) {
    let best: NewsEvent | null = null;
    let bestDelta = Infinity;
    for (const ev of events) {
      const d = sp.epoch - ev.epoch;
      if (Math.abs(d) <= toleranceSec && Math.abs(d) < Math.abs(bestDelta)) {
        best = ev;
        bestDelta = d;
      }
    }
    if (best) matches.push({ spike: sp, event: best, deltaSec: bestDelta });
  }

  return { matches, latest: matches.length ? matches[matches.length - 1] : null };
}
