import { useEffect, useState } from "react";

import { getNetworkHealth, type NetworkHealthSnapshot } from "@/lib/network-resilience";

/**
 * React hook that surfaces the resilient-network layer's rolling
 * health snapshot to UI components. Polls `getNetworkHealth()` on a
 * fixed interval and re-renders the calling component on every tick
 * so latency / success-rate indicators stay live.
 *
 * @param intervalMs How often to re-poll the health buffer. Default
 *                   2000ms — fast enough to be useful, slow enough to
 *                   avoid thrashing React.
 */
export function useNetworkHealth(intervalMs = 2000): NetworkHealthSnapshot {
  const [health, setHealth] = useState<NetworkHealthSnapshot>(() => getNetworkHealth());

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      setHealth(getNetworkHealth());
    };
    // Initial synchronously-updated snapshot, then a steady interval.
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return health;
}

/** Format a latency value (ms) for compact UI display. */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 10) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a success rate (0-1) as a percentage string. */
export function formatSuccessRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** Classify a health snapshot into a UI tone for status pills / dots. */
export function classifyHealth(health: NetworkHealthSnapshot): "good" | "degraded" | "bad" | "unknown" {
  const samples = health.samples.filter((s) => !s.cached);
  if (samples.length === 0) return "unknown";
  // Good: ≥95% success rate AND p95 latency < 1500ms.
  // Degraded: 70-95% success rate OR p95 1500-4000ms.
  // Bad: <70% success rate OR p95 ≥ 4000ms.
  if (health.successRate >= 0.95 && health.p95LatencyMs < 1500) return "good";
  if (health.successRate >= 0.7 && health.p95LatencyMs < 4000) return "degraded";
  return "bad";
}
