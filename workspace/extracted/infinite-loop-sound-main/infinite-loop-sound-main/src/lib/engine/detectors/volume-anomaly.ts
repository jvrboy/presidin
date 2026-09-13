// Volume anomaly detection.
// Flags bars whose volume is N× the rolling average and classifies them as
// climactic, churn, or stealth based on the volume-vs-range relationship.

import type { Candle } from "../indicators";

export type VolumeAnomalyKind =
  | "none"
  | "climactic" // huge volume + huge range → capitulation / breakout
  | "churn" // huge volume + tiny range → absorption / stalemate
  | "stealth"; // small volume + large range → vacuum move, low conviction

export interface VolumeEvent {
  index: number;
  epoch: number;
  kind: VolumeAnomalyKind;
  volumeRatio: number; // volume / avg(volume)
  rangeRatio: number; // range / avg(range)
  direction: "up" | "down";
}

export interface VolumeScan {
  events: VolumeEvent[];
  latest: VolumeEvent | null;
  hasVolume: boolean; // false for symbols without volume data
}

export function detectVolumeAnomalies(
  candles: Candle[],
  window = 30,
  volumeMultiplier = 2.0,
): VolumeScan {
  const hasVolume = candles.some((c) => (c.volume ?? 0) > 0);
  if (!hasVolume || candles.length < window + 1) {
    return { events: [], latest: null, hasVolume };
  }

  const events: VolumeEvent[] = [];
  for (let i = window; i < candles.length; i++) {
    const baseline = candles.slice(i - window, i);
    const avgVol = baseline.reduce((a, c) => a + (c.volume ?? 0), 0) / window;
    const avgRange = baseline.reduce((a, c) => a + (c.high - c.low), 0) / window;
    const vol = candles[i].volume ?? 0;
    const range = candles[i].high - candles[i].low;
    const volRatio = avgVol > 0 ? vol / avgVol : 0;
    const rangeRatio = avgRange > 0 ? range / avgRange : 0;

    let kind: VolumeAnomalyKind = "none";
    if (volRatio >= volumeMultiplier && rangeRatio >= 1.5) kind = "climactic";
    else if (volRatio >= volumeMultiplier && rangeRatio < 0.7) kind = "churn";
    else if (volRatio < 0.5 && rangeRatio >= 1.5) kind = "stealth";

    if (kind === "none") continue;

    events.push({
      index: i,
      epoch: candles[i].epoch,
      kind,
      volumeRatio: volRatio,
      rangeRatio,
      direction: candles[i].close >= candles[i].open ? "up" : "down",
    });
  }

  return { events, latest: events.length ? events[events.length - 1] : null, hasVolume };
}
