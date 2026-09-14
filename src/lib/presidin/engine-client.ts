/**
 * PRESIDIN — Signal Engine (client-safe wrapper)
 *
 * The heavy lifting runs server-side via API routes.
 * This client module calls those routes and tracks learning stats.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useEngineConfigStore, useAgentConfigStore, useAccountStore } from "@/stores/presidin";
import { marketData } from "./market-data";
import { runMasterAgent, type Signal } from "./agents";
import { DEFAULT_ACTIVE_SYMBOLS, SYMBOL_MAP, TIMEFRAMES } from "./symbols";

export interface LearningStats {
  totalSignals: number;
  evaluated: number;
  correct: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  byDirection: { BUY: { total: number; correct: number }; SELL: { total: number; correct: number } };
  lastSignalAt: string | null;
  lastRetrainedAt: string | null;
}

/**
 * Client-side hook that runs the signal engine.
 * Generates signals on a timer, evaluates them, and retrains ML.
 */
export function useSignalEngine() {
  const engineStore = useEngineConfigStore();
  // The engine store state IS the config (flat), so we treat the whole store as config
  const config = {
    enabled: engineStore.enabled,
    intervalMs: engineStore.intervalMs,
    symbols: engineStore.symbols,
    timeframes: engineStore.timeframes,
    minConfidence: engineStore.minConfidence,
    autoExecute: engineStore.autoExecute,
    autoExecuteThreshold: engineStore.autoExecuteThreshold,
    learningEnabled: engineStore.learningEnabled,
    retrainIntervalHours: engineStore.retrainIntervalHours,
  };
  const setConfig = engineStore.setConfig;
  const toggle = engineStore.toggle;
  const { getConfig } = useAgentConfigStore();
  const { equity } = useAccountStore();
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate signals for all configured symbols + timeframes (client-side)
  const runCycle = useCallback(async () => {
    if (!config.enabled) return;
    setIsRunning(true);
    setError(null);
    try {
      const agentConfig = getConfig(equity, 1.0);
      const newSignals: Signal[] = [];
      for (const symbol of config.symbols) {
        const def = SYMBOL_MAP[symbol];
        if (!def) continue;
        for (const tf of config.timeframes) {
          const tfDef = TIMEFRAMES.find((t) => t.value === tf);
          if (!tfDef) continue;
          try {
            const candles = await marketData.fetchHistory(symbol, tfDef.seconds, 200);
            const signal = runMasterAgent(def.display, tf, candles, agentConfig);
            if (signal.confidence >= config.minConfidence && signal.direction !== "NEUTRAL") {
              newSignals.push(signal);
            }
          } catch {}
        }
      }
      if (newSignals.length > 0) {
        setRecentSignals((prev) => [...newSignals, ...prev].slice(0, 50));
        setLastRun(Date.now());
        // Persist to backend (best-effort)
        try {
          await Promise.all(newSignals.slice(0, 10).map((s) =>
            fetch("/api/signals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: s.symbol,
                timeframe: s.timeframe,
                direction: s.direction,
                confidence: s.confidence,
                consensus: s.consensusScore,
                votes: s.votes,
                entryPrice: s.suggestedEntry,
                stopLoss: s.suggestedStopLoss,
                takeProfit: s.suggestedTakeProfit,
                rrRatio: s.riskRewardRatio,
                positionSize: s.positionSize,
              }),
            }).catch(() => {})
          ));
        } catch {}

        // Auto-push high-confidence signals to notifications
        const highConfidence = newSignals.filter((s) => s.confidence >= 75);
        if (highConfidence.length > 0) {
          try {
            await Promise.all(highConfidence.slice(0, 3).map((s) =>
              fetch("/api/signals/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signal: s }),
              }).catch(() => {})
            ));
          } catch {}
        }

        // Auto-execute on Deriv if enabled + very high confidence
        if (config.autoExecute) {
          const autoExecCandidates = newSignals.filter(
            (s) => s.confidence >= config.autoExecuteThreshold && s.direction !== "NEUTRAL"
          );
          if (autoExecCandidates.length > 0) {
            try {
              await Promise.all(autoExecCandidates.slice(0, 2).map((s) => {
                // Risk-adjusted position sizing:
                // Base amount = 1 USD, scaled by (confidence / threshold) * (1 + (confidence - threshold) / 100)
                // Higher confidence = larger stake, but capped at 5 USD
                const confRatio = s.confidence / config.autoExecuteThreshold;
                const stakeRaw = 1 * confRatio * (1 + (s.confidence - config.autoExecuteThreshold) / 100);
                const stake = Math.min(5, Math.max(0.5, stakeRaw));
                return fetch("/api/deriv/execute", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    symbol: Object.keys(SYMBOL_MAP).find((k) => SYMBOL_MAP[k].display === s.symbol) ?? "frxEURUSD",
                    direction: s.direction,
                    amount: parseFloat(stake.toFixed(2)),
                    duration: 15,
                    durationUnit: "m",
                  }),
                }).catch(() => {});
              }));
            } catch {}
          }
        }
      }
      // Refresh stats after generating
      await refreshStats();
    } catch (err: any) {
      setError(err?.message ?? "Engine cycle failed");
    } finally {
      setIsRunning(false);
    }
  }, [config, getConfig, equity]);

  // Fetch learning stats from API
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/learning/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  }, []);

  // Run engine on interval
  useEffect(() => {
    if (!config.enabled) return;
    // Initial run after 2s (let the page settle)
    const initTimer = setTimeout(() => { runCycle(); }, 2000);
    const interval = setInterval(runCycle, config.intervalMs);
    return () => { clearTimeout(initTimer); clearInterval(interval); };
  }, [config.enabled, config.intervalMs, runCycle]);

  // Evaluate past signals periodically
  useEffect(() => {
    if (!config.learningEnabled) return;
    const evalInterval = setInterval(async () => {
      try {
        await fetch("/api/learning/evaluate", { method: "POST" });
        await refreshStats();
      } catch {}
    }, 5 * 60 * 1000); // every 5min
    return () => clearInterval(evalInterval);
  }, [config.learningEnabled, refreshStats]);

  // Retrain ML on schedule
  useEffect(() => {
    if (!config.learningEnabled) return;
    const retrainMs = config.retrainIntervalHours * 60 * 60 * 1000;
    const retrainInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/learning/retrain", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.retrained && data.newWeights) {
            // Apply new agent weights
            for (const [agentId, weight] of Object.entries(data.newWeights)) {
              useAgentConfigStore.getState().setWeight(agentId, weight as number);
            }
            await refreshStats();
          }
        }
      } catch {}
    }, retrainMs);
    return () => clearInterval(retrainInterval);
  }, [config.learningEnabled, config.retrainIntervalHours, refreshStats]);

  // Evaluate closed trades every 15 minutes
  useEffect(() => {
    if (!config.learningEnabled) return;
    const evalInterval = setInterval(async () => {
      try {
        await fetch("/api/trades/evaluate", { method: "POST" });
        await refreshStats();
      } catch {}
    }, 15 * 60 * 1000); // every 15min
    return () => clearInterval(evalInterval);
  }, [config.learningEnabled, refreshStats]);

  // Daily learning report — fires once per day at a random offset
  useEffect(() => {
    if (!config.learningEnabled) return;
    // Check if we've already sent today's report
    const lastReport = localStorage.getItem("presidin:last-daily-report");
    const today = new Date().toISOString().slice(0, 10);
    if (lastReport === today) return; // already sent today

    // Send after 30s on mount (if not already sent today)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/learning/daily-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatch: true }),
        });
        if (res.ok) {
          localStorage.setItem("presidin:last-daily-report", today);
        }
      } catch {}
    }, 30_000);
    return () => clearTimeout(timer);
  }, [config.learningEnabled]);

  // Load stats on mount
  useEffect(() => { refreshStats(); }, [refreshStats]);

  return {
    config,
    setConfig,
    toggle,
    stats,
    isRunning,
    lastRun,
    recentSignals,
    error,
    refreshStats,
    runCycleNow: runCycle,
  };
}
