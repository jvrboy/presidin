// Multi-Timeframe (MTF) Confluence Scanner Hook — DivergenceIQ
// Scans a single pair across ALL timeframes simultaneously and returns
// a unified confluence verdict. When 3+ timeframes agree on direction,
// the signal is considered high-probability.

import { useCallback, useEffect, useRef, useState } from "react";
import { deriv, TIMEFRAMES, type TF } from "@/lib/engine/deriv";
import { analyze, type AnalysisResult, type Direction, type Rating } from "@/lib/engine/signal";

export interface MTFTimeframeResult {
  tf: TF;
  direction: Direction | null;
  rating: Rating;
  scorePct: number;
  trendBias: Direction | "NEUTRAL";
  divergences: string[];
  loading: boolean;
  error?: string;
}

export interface MTFVerdict {
  overallDirection: Direction | null;
  agreementCount: number;
  totalTimeframes: number;
  agreementPct: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "CONFLICTING";
  strongestTF: TF | null;
  weakestTF: TF | null;
  avgScore: number;
  buyCount: number;
  sellCount: number;
  neutralCount: number;
}

export interface MTFScanState {
  pair: string;
  results: MTFTimeframeResult[];
  verdict: MTFVerdict | null;
  scanning: boolean;
  lastScanAt: number;
}

const SCAN_TFS: TF[] = ["M5", "M15", "M30", "H1", "H4", "D1"];

export function useMTFScanner() {
  const [state, setState] = useState<MTFScanState>({
    pair: "",
    results: [],
    verdict: null,
    scanning: false,
    lastScanAt: 0,
  });
  // Generation token: concurrent scans / unmount mid-scan must not let a
  // stale run clobber fresh state
  const generationRef = useRef(0);

  useEffect(() => {
    return () => {
      generationRef.current++;
    };
  }, []);

  const scan = useCallback(async (pair: string, timeframes?: TF[]) => {
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const isStale = () => generationRef.current !== myGeneration;

    const tfs = timeframes ?? SCAN_TFS;
    setState((s) => ({
      ...s,
      pair,
      scanning: true,
      results: tfs.map((tf) => ({
        tf,
        direction: null,
        rating: "WEAK" as Rating,
        scorePct: 0,
        trendBias: "NEUTRAL" as const,
        divergences: [],
        loading: true,
      })),
    }));

    const results: MTFTimeframeResult[] = [];

    for (const tf of tfs) {
      try {
        const candles = await deriv.getCandles(pair, tf, 200);
        if (candles.length < 50) {
          results.push({
            tf,
            direction: null,
            rating: "WEAK",
            scorePct: 0,
            trendBias: "NEUTRAL",
            divergences: [],
            loading: false,
            error: `Insufficient data (${candles.length} candles)`,
          });
          continue;
        }
        const a = analyze(pair, tf, candles, {});
        results.push({
          tf,
          direction: a.direction,
          rating: a.rating,
          scorePct: a.scorePct,
          trendBias: a.trendBias,
          divergences: a.divergences.map((d) => `${d.name}: ${d.result.type}`),
          loading: false,
        });
      } catch (e: any) {
        results.push({
          tf,
          direction: null,
          rating: "WEAK",
          scorePct: 0,
          trendBias: "NEUTRAL",
          divergences: [],
          loading: false,
          error: e?.message || "scan error",
        });
      }

      // Update state progressively (skip if superseded or unmounted)
      if (isStale()) return { results, verdict: null };
      setState((s) => ({
        ...s,
        results: [
          ...results,
          ...tfs.slice(results.length).map((tf2) => ({
            tf: tf2,
            direction: null,
            rating: "WEAK" as Rating,
            scorePct: 0,
            trendBias: "NEUTRAL" as const,
            divergences: [],
            loading: true,
          })),
        ],
      }));
    }

    // Compute verdict
    const validResults = results.filter((r) => r.direction !== null);
    const buyCount = validResults.filter((r) => r.direction === "BUY").length;
    const sellCount = validResults.filter((r) => r.direction === "SELL").length;
    const neutralCount = results.length - validResults.length;

    let overallDirection: Direction | null = null;
    if (buyCount > sellCount && buyCount >= 2) overallDirection = "BUY";
    else if (sellCount > buyCount && sellCount >= 2) overallDirection = "SELL";

    const agreementCount = Math.max(buyCount, sellCount);
    const agreementPct = results.length > 0 ? (agreementCount / results.length) * 100 : 0;

    let confidence: MTFVerdict["confidence"] = "CONFLICTING";
    if (agreementPct >= 80) confidence = "HIGH";
    else if (agreementPct >= 60) confidence = "MEDIUM";
    else if (agreementPct >= 40) confidence = "LOW";

    const scored = results.filter((r) => r.scorePct > 0);
    const avgScore =
      scored.length > 0 ? scored.reduce((s, r) => s + r.scorePct, 0) / scored.length : 0;

    const strongestTF =
      scored.length > 0
        ? scored.reduce((best, r) => (r.scorePct > best.scorePct ? r : best)).tf
        : null;
    const weakestTF =
      scored.length > 0
        ? scored.reduce((worst, r) => (r.scorePct < worst.scorePct ? r : worst)).tf
        : null;

    const verdict: MTFVerdict = {
      overallDirection,
      agreementCount,
      totalTimeframes: results.length,
      agreementPct,
      confidence,
      strongestTF,
      weakestTF,
      avgScore,
      buyCount,
      sellCount,
      neutralCount,
    };

    if (isStale()) return { results, verdict: null };

    setState({
      pair,
      results,
      verdict,
      scanning: false,
      lastScanAt: Date.now(),
    });

    return { results, verdict };
  }, []);

  return { ...state, scan };
}
