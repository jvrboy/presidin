import { useState, useEffect, useCallback, useRef } from "react";
import { runNewsAgent, setNewsEvents, NEWS_PERFORMANCE } from "../lib/agents/news-agent";
import type { AgentResult, NewsAssessment, NewsEventAssessment } from "../lib/agents/types";
import type { NewsEvent } from "../lib/engine/strategies-v2";

export function useNewsMonitor(pollIntervalSec = 60) {
  const [assessment, setAssessment] = useState<NewsAssessment | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<NewsEventAssessment[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      // Try to fetch from existing economic events endpoint
      const res = await fetch("/api/economic-events");
      if (res.ok) {
        const data = await res.json();
        const mapped: NewsEventAssessment[] = (data.events ?? []).map(
          (e: Record<string, unknown>) => ({
            title: String(e.title ?? ""),
            impact: (["high", "medium", "low"].includes(String(e.impact))
              ? String(e.impact)
              : "low") as "high" | "medium" | "low",
            currency: String(e.currency ?? "USD"),
            epoch: Number(e.epoch ?? 0),
            forecast: e.forecast ? String(e.forecast) : undefined,
            previous: e.previous ? String(e.previous) : undefined,
          }),
        );
        setEvents(mapped);
        setNewsEvents(mapped);
      }
    } catch {
      // Silently fail — news agent will use cached events
    }
  }, []);

  const analyze = useCallback((currentEpoch?: number, pair?: string) => {
    const result = runNewsAgent(currentEpoch ?? Date.now() / 1000, pair);
    setAssessment((result.output?.assessment as NewsAssessment) ?? null);
    return result;
  }, []);

  const startMonitoring = useCallback(() => {
    // Clear any pre-existing poll loop so repeated calls don't leak intervals
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    fetchEvents();
    analyze();

    intervalRef.current = setInterval(() => {
      fetchEvents();
      analyze();
    }, pollIntervalSec * 1000);
  }, [fetchEvents, analyze, pollIntervalSec]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  // Get news-specific strategy recommendations
  const getNewsRecommendations = useCallback(
    (currency?: string) => {
      const relevant = currency
        ? events.filter((e) => e.currency === currency || currency.includes(e.currency))
        : events.filter((e) => e.impact === "high" || e.impact === "medium");

      return relevant.slice(0, 5).map((e) => {
        const perf = NEWS_PERFORMANCE[`${e.currency}USD`];
        return {
          event: e,
          shouldTrade: perf ? perf.wr > 55 : false,
          winRate: perf?.wr ?? 0,
          profitFactor: perf?.pf ?? 0,
          topPairs: perf ? [`${e.currency}USD`] : [],
        };
      });
    },
    [events],
  );

  return {
    assessment,
    events,
    isRunning,
    analyze,
    startMonitoring,
    stopMonitoring,
    fetchEvents,
    getNewsRecommendations,
  };
}
