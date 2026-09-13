import { useCallback, useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { forexApi, type Signal } from "@/lib/forex-api";
import type { SignalAlertMode } from "@/lib/theme-provider";

/**
 * Multi-timeframe scanner — fetches chart data for a symbol across
 * N timeframes in parallel and returns a compact confluence summary:
 * how many of the scanned timeframes agree on direction (buy / sell /
 * neutral), and the average strength across them.
 *
 * This is the "advanced capability" complement to the existing
 * per-signal view: rather than waiting for the backend's own signal
 * loop, the user can trigger a manual multi-timeframe scan from the
 * Signals tab to see at a glance whether higher / lower timeframes
 * confirm or contradict the headline signal.
 */
export type TimeframeVote = { timeframe: string; direction: Signal["direction"]; strength: number; ok: boolean };
export type MultiTimeframeScan = {
  symbol: string;
  votes: TimeframeVote[];
  buyCount: number;
  sellCount: number;
  neutralCount: number;
  averageStrength: number;
  /** A simple 0-100 confluence score: |buy - sell| / total, scaled. */
  confluenceScore: number;
  /** "buy" | "sell" | "neutral" — the dominant direction. */
  dominantDirection: Signal["direction"];
  error?: string;
};

const DEFAULT_TIMEFRAMES = ["5M", "15M", "1H", "4H", "1D"];

/** Run a multi-timeframe scan for a symbol. `timeframes` defaults to
 *  the standard set; pass a custom list to override. Returns a single
 *  `MultiTimeframeScan` summary. */
export async function scanMultiTimeframe(
  baseUrl: string,
  symbol: string,
  timeframes: string[] = DEFAULT_TIMEFRAMES,
): Promise<MultiTimeframeScan> {
  const results = await Promise.all(
    timeframes.map(async (tf): Promise<TimeframeVote> => {
      try {
        const chart = await forexApi.getChartData(baseUrl, symbol, { timeframe: tf, bars: 100 });
        // Crude local direction read off the last 5 bars: compare last
        // close to the median of the prior 4 closes. Real signal
        // generation stays on the backend; this is a UI-side
        // convenience for cross-timeframe confirmation.
        const bars = (chart as { bars?: Array<{ close: number; high: number; low: number }> }).bars ?? [];
        if (bars.length < 5) return { timeframe: tf, direction: "neutral", strength: 0, ok: false };
        const last = bars[bars.length - 1].close;
        const prior = bars.slice(-6, -1).map((b) => b.close);
        const median = [...prior].sort((a, b) => a - b)[Math.floor(prior.length / 2)];
        const delta = (last - median) / median;
        // Direction: buy if delta > +0.05%, sell if < -0.05%, else
        // neutral. Strength scales the magnitude of delta up to 100.
        const direction: TimeframeVote["direction"] = delta > 0.0005 ? "buy" : delta < -0.0005 ? "sell" : "neutral";
        const strength = Math.min(100, Math.abs(delta) * 50000);
        return { timeframe: tf, direction, strength, ok: true };
      } catch {
        return { timeframe: tf, direction: "neutral", strength: 0, ok: false };
      }
    }),
  );
  const okVotes = results.filter((v) => v.ok);
  const buyCount = okVotes.filter((v) => v.direction === "buy").length;
  const sellCount = okVotes.filter((v) => v.direction === "sell").length;
  const neutralCount = okVotes.filter((v) => v.direction === "neutral").length;
  const averageStrength = okVotes.length > 0 ? okVotes.reduce((s, v) => s + v.strength, 0) / okVotes.length : 0;
  const total = okVotes.length || 1;
  const confluenceScore = Math.round((Math.abs(buyCount - sellCount) / total) * 100);
  const dominantDirection: Signal["direction"] = buyCount > sellCount && buyCount > neutralCount ? "buy" : sellCount > buyCount && sellCount > neutralCount ? "sell" : "neutral";
  return {
    symbol,
    votes: results,
    buyCount,
    sellCount,
    neutralCount,
    averageStrength,
    confluenceScore,
    dominantDirection,
  };
}

/**
 * React hook that watches the live signal feed and fires a local push
 * notification when a new signal arrives whose strength meets the
 * configured alert threshold.
 *
 * Behavior:
 *  - When `mode === "off"`, the hook is a no-op (no notifications fire).
 *  - When `mode === "all"`, every new signal triggers a notification.
 *  - When `mode === "high"`, only signals with `strength >= threshold`
 *    trigger.
 *
 * The hook tracks the set of seen signal IDs in a ref so a signal is
 * only announced once, even if the polling loop fetches the same feed
 * repeatedly. Notifications are scheduled via expo-notifications'
 * `scheduleNotificationAsync` API with `trigger: null` (immediate).
 */
export function useSignalAlerts(signals: Signal[], mode: SignalAlertMode, threshold: number, enabled: boolean) {
  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!enabled || mode === "off" || Platform.OS === "web") return;
    // On first run, seed the seen-set with the current feed so we
    // don't retroactively fire alerts for signals that arrived while
    // the screen was closed.
    if (!primed.current) {
      signals.forEach((s) => seenIds.current.add(s.id));
      primed.current = true;
      return;
    }
    const fresh = signals.filter((s) => !seenIds.current.has(s.id));
    fresh.forEach((s) => seenIds.current.add(s.id));
    if (fresh.length === 0) return;
    const eligible =
      mode === "all"
        ? fresh
        : fresh.filter((s) => Number(s.strength) >= threshold);
    if (eligible.length === 0) return;
    void (async () => {
      // Fire one notification per eligible signal (capped at 3 per
      // tick to avoid notification spam on a large rescan).
      for (const s of eligible.slice(0, 3)) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${s.symbol} ${s.direction.toUpperCase()} · ${Math.round(Number(s.strength))}%`,
              body: s.reason?.slice(0, 140) ?? "New trading signal",
              data: { signalId: s.id, symbol: s.symbol },
            },
            trigger: null,
          });
        } catch {
          /* Notifications permission may not be granted — silently
             skip; the Settings tab has its own permission prompt. */
        }
      }
    })();
  }, [signals, mode, threshold, enabled]);
}

/** Convenience hook that combines the multi-timeframe scanner with
 *  React state, for direct use in a component. */
export function useMultiTimeframeScanner(baseUrl: string, symbol: string | null, timeframes?: string[]) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<MultiTimeframeScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!symbol) return;
    setScanning(true);
    setError(null);
    try {
      const r = await scanMultiTimeframe(baseUrl, symbol, timeframes);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [baseUrl, symbol, timeframes]);

  // Auto-clear error after 4s.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  return { scanning, result, error, scan };
}
