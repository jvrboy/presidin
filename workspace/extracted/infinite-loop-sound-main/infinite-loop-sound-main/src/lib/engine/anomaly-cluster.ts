// Anomaly clusterer — groups recent detector events (spikes, sweeps, gaps,
// range breaks) into clusters by bar proximity. Useful for identifying
// "market storms" — periods of unusual activity vs isolated one-off events.

import type { Candle } from "./indicators";
import type { DetectorReport } from "./detectors";

export interface AnomalyCluster {
  startIdx: number;
  endIdx: number;
  size: number; // number of events in the cluster
  intensity: number; // events per bar
  kinds: string[]; // unique event types
  startEpoch: number;
  endEpoch: number;
}

interface RawEvent {
  index: number;
  kind: string;
}

function collectEvents(report: DetectorReport): RawEvent[] {
  const out: RawEvent[] = [];
  for (const e of report.spike.events) out.push({ index: e.index, kind: `spike-${e.kind}` });
  for (const e of report.volume.events) out.push({ index: e.index, kind: `vol-${e.kind}` });
  for (const e of report.liquiditySweeps.events)
    out.push({ index: e.index, kind: `sweep-${e.side}` });
  for (const e of report.gaps.events) out.push({ index: e.index, kind: `gap-${e.kind}` });
  for (const e of report.rangeBreaks.events)
    out.push({ index: e.index, kind: `break-${e.direction}` });
  out.sort((a, b) => a.index - b.index);
  return out;
}

export function clusterAnomalies(
  report: DetectorReport,
  candles: Candle[],
  maxGap = 5,
): AnomalyCluster[] {
  const events = collectEvents(report);
  if (!events.length) return [];
  const clusters: AnomalyCluster[] = [];
  let current: RawEvent[] = [events[0]];

  const flush = () => {
    if (!current.length) return;
    const startIdx = current[0].index;
    const endIdx = current[current.length - 1].index;
    const span = Math.max(1, endIdx - startIdx + 1);
    clusters.push({
      startIdx,
      endIdx,
      size: current.length,
      intensity: current.length / span,
      kinds: Array.from(new Set(current.map((e) => e.kind))),
      startEpoch: candles[startIdx]?.epoch ?? 0,
      endEpoch: candles[endIdx]?.epoch ?? 0,
    });
  };

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const cur = events[i];
    if (cur.index - prev.index <= maxGap) {
      current.push(cur);
    } else {
      flush();
      current = [cur];
    }
  }
  flush();

  return clusters.sort((a, b) => b.intensity - a.intensity);
}
