import { useCallback, useEffect, useRef, useState } from "react";

import { forexApi, type DashboardMetrics } from "@/lib/forex-api";
import { useTrading } from "@/lib/trading-context";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Polls GET /api/dashboard/metrics on the same cadence as the user's
 * advanced "refresh interval" preference. Kept separate from
 * TradingContext's own /api/status polling so a slow metrics
 * aggregation query never blocks the core status/positions feed.
 */
export function useDashboardMetrics() {
  const { apiBaseUrl, connected, hydrated } = useTrading();
  const { advanced } = useThemeContext();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setLoading(true);
      try {
        const next = await forexApi.getDashboardMetrics(apiBaseUrl);
        setMetrics(next);
        setError(null);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard metrics");
      } finally {
        if (!silent) setLoading(false);
        inFlight.current = false;
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    if (!hydrated || !connected) return;
    void load();
    const intervalMs = Math.max(10, advanced.refreshIntervalSeconds || 30) * 1000;
    const interval = setInterval(() => void load(true), intervalMs);
    return () => clearInterval(interval);
  }, [hydrated, connected, advanced.refreshIntervalSeconds, load]);

  return { metrics, loading, error, refresh: load };
}
