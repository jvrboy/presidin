// Heat-scanner — run runAllDetectors() across every symbol in a watchlist and
// rank by heat (number of detectors firing on the latest bar). Used by the
// `scan-heat` chat skill and the optional /scanner widget.

import { deriv, ALL_ASSETS, type TF } from "./deriv";
import { runAllDetectors, type DetectorReport } from "./detectors";

export interface HeatRow {
  symbol: string;
  tf: TF;
  heat: number; // 0..6  (number of detectors hot on latest bar)
  report: DetectorReport;
  lastPrice: number;
  changePct: number;
}

export interface HeatScanOpts {
  symbols?: readonly string[];
  tf?: TF;
  bars?: number;
  concurrency?: number;
}

async function inBatches<T, R>(items: T[], batch: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batch) {
    const slice = items.slice(i, i + batch);
    const res = await Promise.all(slice.map(fn));
    out.push(...res);
  }
  return out;
}

export async function scanHeat(opts: HeatScanOpts = {}): Promise<HeatRow[]> {
  const symbols = opts.symbols ?? ALL_ASSETS.map((a) => a.symbol);
  const tf = opts.tf ?? "M15";
  const bars = opts.bars ?? 300;
  const concurrency = opts.concurrency ?? 4;

  const rows = await inBatches([...symbols], concurrency, async (sym): Promise<HeatRow | null> => {
    try {
      const candles = await deriv.getCandles(sym, tf, bars);
      if (!candles.length) return null;
      const report = runAllDetectors(candles);
      const first = candles[0].close;
      const last = candles[candles.length - 1].close;
      return {
        symbol: sym,
        tf,
        heat: report.hotCount,
        report,
        lastPrice: last,
        changePct: first > 0 ? ((last - first) / first) * 100 : 0,
      };
    } catch {
      return null;
    }
  });

  return rows.filter((r): r is HeatRow => r !== null).sort((a, b) => b.heat - a.heat);
}
