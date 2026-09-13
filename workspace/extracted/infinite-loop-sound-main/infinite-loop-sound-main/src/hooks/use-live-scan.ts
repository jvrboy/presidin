// Shared live-scan hook — runs analyze() on a set of symbols at a configurable
// interval and returns the ranked results. Used by /scanner, /screener, etc.

import { useEffect, useState } from "react";
import { deriv, type TF } from "@/lib/engine/deriv";
import { analyze, type AnalysisResult } from "@/lib/engine/signal";

export interface ScanRow {
  symbol: string;
  display: string;
  tf: TF;
  rating: AnalysisResult["rating"];
  scorePct: number;
  direction: AnalysisResult["direction"];
  items: AnalysisResult["confluence"];
  lastClose: number;
  error?: string;
  updatedAt: number;
}

export interface LiveScanState {
  rows: ScanRow[];
  loading: boolean;
  scanning: boolean;
  lastFullScanAt: number;
  errors: number;
}

export function useLiveScan(
  symbols: Array<{ symbol: string; display: string }>,
  tf: TF = "M15",
  intervalMs = 45_000,
): LiveScanState {
  const [state, setState] = useState<LiveScanState>({
    rows: [],
    loading: true,
    scanning: false,
    lastFullScanAt: 0,
    errors: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let lastRowMap: Record<string, ScanRow> = {};

    const runScan = async () => {
      setState((s) => ({ ...s, scanning: true }));
      let errCount = 0;
      const updated: ScanRow[] = [];
      for (const w of symbols) {
        try {
          const candles = await deriv.getCandles(w.symbol, tf, 200);
          if (candles.length < 50) {
            updated.push({
              ...(lastRowMap[w.symbol] || ({} as ScanRow)),
              symbol: w.symbol,
              display: w.display,
              tf,
              rating: "WEAK",
              scorePct: 0,
              direction: null,
              items: [],
              lastClose: candles[candles.length - 1]?.close ?? 0,
              error: `only ${candles.length} candles`,
              updatedAt: Date.now(),
            });
            continue;
          }
          const a = analyze(w.symbol, tf, candles, {});
          updated.push({
            symbol: w.symbol,
            display: w.display,
            tf,
            rating: a.rating,
            scorePct: a.scorePct,
            direction: a.direction,
            items: a.confluence,
            lastClose: candles[candles.length - 1].close,
            updatedAt: Date.now(),
          });
        } catch (e: any) {
          errCount++;
          updated.push({
            ...(lastRowMap[w.symbol] || ({} as ScanRow)),
            symbol: w.symbol,
            display: w.display,
            tf,
            rating: "WEAK",
            scorePct: 0,
            direction: null,
            items: [],
            lastClose: 0,
            error: e?.message || "scan error",
            updatedAt: Date.now(),
          });
        }
      }
      lastRowMap = Object.fromEntries(updated.map((r) => [r.symbol, r]));
      if (cancelled) return;
      setState({
        rows: updated.sort((a, b) => b.scorePct - a.scorePct),
        loading: false,
        scanning: false,
        lastFullScanAt: Date.now(),
        errors: errCount,
      });
    };

    // Self-scheduling chain so a slow scan never overlaps the next one
    let timerId: number | null = null;
    let running = false;
    const tick = () => {
      if (cancelled || running) return;
      running = true;
      void Promise.resolve(runScan()).finally(() => {
        running = false;
        if (!cancelled) timerId = window.setTimeout(tick, intervalMs);
      });
    };

    runScan();
    tick();
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf, intervalMs, symbols.map((s) => s.symbol).join("|")]);

  return state;
}
