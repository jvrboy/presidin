// Unified barrel + runAllDetectors() helper for the chat agent and the
// DetectorDashboard UI component.

import type { Candle } from "../indicators";
import { detectSpikes, type SpikeScan } from "./spike";
import { detectVolumeAnomalies, type VolumeScan } from "./volume-anomaly";
import { detectLiquiditySweeps, type SweepScan } from "./liquidity-sweep";
import { detectGaps, type GapScan } from "./gap";
import { detectRangeBreaks, type RangeBreakScan } from "./range-break";
import { detectRegimeShift, type RegimeShiftEvent } from "./regime-shift";

export * from "./spike";
export * from "./volume-anomaly";
export * from "./liquidity-sweep";
export * from "./gap";
export * from "./range-break";
export * from "./regime-shift";
export * from "./news-spike";

export interface DetectorReport {
  spike: SpikeScan;
  volume: VolumeScan;
  liquiditySweeps: SweepScan;
  gaps: GapScan;
  rangeBreaks: RangeBreakScan;
  regimeShift: RegimeShiftEvent;
  /** Total number of "hot" events on the most recent bar across all detectors. */
  hotCount: number;
}

export function runAllDetectors(candles: Candle[]): DetectorReport {
  const spike = detectSpikes(candles);
  const volume = detectVolumeAnomalies(candles);
  const liquiditySweeps = detectLiquiditySweeps(candles);
  const gaps = detectGaps(candles);
  const rangeBreaks = detectRangeBreaks(candles);
  const regimeShift = detectRegimeShift(candles);
  const lastIdx = candles.length - 1;

  let hotCount = 0;
  if (spike.latest?.index === lastIdx) hotCount++;
  if (volume.latest?.index === lastIdx) hotCount++;
  if (liquiditySweeps.latest?.index === lastIdx) hotCount++;
  if (gaps.latest?.index === lastIdx) hotCount++;
  if (rangeBreaks.latest?.index === lastIdx) hotCount++;
  if (regimeShift.shift !== "none") hotCount++;

  return { spike, volume, liquiditySweeps, gaps, rangeBreaks, regimeShift, hotCount };
}
