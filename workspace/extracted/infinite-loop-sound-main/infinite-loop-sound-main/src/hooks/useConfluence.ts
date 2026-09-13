import { useState, useCallback } from "react";
import { deriv, type TF } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";

export interface ConfluenceResult {
  pair: string;
  timeframe: string;
  signalResult: any;
  v1Hits: any[];
  v2Hits: any[];
  v3Hits: any[];
  totalHits: number;
  buyCount: number;
  sellCount: number;
  agreementScore: number;
  loading: boolean;
  error: string | null;
}

export function useConfluence() {
  const [result, setResult] = useState<ConfluenceResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = useCallback(async (pair: string, tf: TF) => {
    setLoading(true);
    try {
      const candles = await deriv.getCandles(pair, tf, 200);
      const signalResult = analyze(pair, tf, candles, {});

      const v1 = await import("@/lib/engine/strategies");
      const v2 = await import("@/lib/engine/strategies-v2");
      let v3Hits: any[] = [];
      try {
        const v3 = await import("@/lib/engine/strategies-v3");
        v3Hits = v3.evaluateStrategiesV3(candles);
      } catch {
        /* V3 not available */
      }

      const v1Hits = v1.evaluateStrategies(candles, []);
      const v2Hits = v2.evaluateStrategiesV2(candles, [], [], Date.now() / 1000);
      const allHits = [...v1Hits, ...v2Hits, ...v3Hits];
      const buyCount = allHits.filter((h: any) => h.side === "BUY").length;
      const sellCount = allHits.length - buyCount;
      const agreementScore =
        allHits.length > 0 ? (Math.max(buyCount, sellCount) / allHits.length) * 100 : 0;

      setResult({
        pair,
        timeframe: tf,
        signalResult,
        v1Hits,
        v2Hits,
        v3Hits,
        totalHits: allHits.length,
        buyCount,
        sellCount,
        agreementScore,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setResult((prev) =>
        prev
          ? { ...prev, loading: false, error: e.message }
          : {
              pair,
              timeframe: tf,
              signalResult: null,
              v1Hits: [],
              v2Hits: [],
              v3Hits: [],
              totalHits: 0,
              buyCount: 0,
              sellCount: 0,
              agreementScore: 0,
              loading: false,
              error: e.message,
            },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, runAnalysis };
}
