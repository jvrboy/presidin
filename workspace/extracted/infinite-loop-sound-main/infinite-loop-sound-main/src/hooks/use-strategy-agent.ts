import { useState, useCallback, useRef } from "react";
import {
  runFullAnalysis,
  getOrchestratorState,
  type FullAnalysisInput,
  type OrchestratorState,
} from "../lib/agents/orchestrator";
import type { Candle } from "../lib/engine/indicators";

export function useStrategyAgent() {
  const [state, setState] = useState<OrchestratorState>(getOrchestratorState());
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyze = useCallback(
    async (
      input: Omit<FullAnalysisInput, "candles" | "ticks"> & {
        candles: Candle[];
        ticks: { quote: number; epoch: number }[];
      },
    ) => {
      setIsRunning(true);
      try {
        const result = await runFullAnalysis({
          ...input,
          ticks: input.ticks.map((t) => ({ quote: t.quote, epoch: t.epoch })),
        });
        setState(result);
        return result;
      } catch (err) {
        console.error("Strategy agent error:", err);
        return getOrchestratorState();
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  const startAutoScan = useCallback(
    (
      input: Omit<FullAnalysisInput, "candles" | "ticks"> & {
        getCandles: () => Candle[];
        getTicks: () => { quote: number; epoch: number }[];
      },
      intervalSec = 30,
    ) => {
      if (intervalRef.current) clearInterval(intervalRef.current);

      const run = () => {
        const candles = input.getCandles();
        const ticks = input.getTicks();
        if (candles.length > 50 && ticks.length > 10) {
          analyze({ ...input, candles, ticks });
        }
      };

      run(); // immediate first run
      intervalRef.current = setInterval(run, intervalSec * 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    },
    [analyze],
  );

  const stopAutoScan = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { state, isRunning, analyze, startAutoScan, stopAutoScan };
}
