// Live ForexFactory weekly calendar hook.
// Polls the Supabase Edge Function `forex-calendar` (which proxies the public
// ForexFactory XML feed) every 60s. All times are converted to SAST upstream.

import { useEffect, useState } from "react";

export interface FFEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: "High" | "Medium" | "Low" | "Holiday";
  date: string; // ISO UTC (or raw fallback)
  sast: string; // formatted in Africa/Johannesburg
  forecast: string;
  previous: string;
  actual: string;
  url: string;
}

interface State {
  events: FFEvent[];
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL) || "";

function endpoint(): string | null {
  return SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/forex-calendar` : null;
}

export function useForexCalendar(pollMs = 60_000) {
  const [state, setState] = useState<State>({
    events: [],
    loading: true,
    error: null,
    fetchedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    const url = endpoint();

    const tick = async () => {
      if (!url) {
        setState((s) => ({
          ...s,
          loading: false,
          error:
            "VITE_SUPABASE_URL not set — deploy the forex-calendar edge function and set the env var.",
        }));
        return;
      }
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || body.error) {
          setState((s) => ({
            ...s,
            loading: false,
            error: body.error || `HTTP ${res.status}`,
            // keep previously-loaded events on transient failure
            events: body.events?.length ? body.events : s.events,
            fetchedAt: body.fetchedAt ?? s.fetchedAt,
          }));
          return;
        }
        setState({
          events: body.events || [],
          loading: false,
          error: null,
          fetchedAt: body.fetchedAt || Date.now(),
        });
      } catch (e: any) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e?.message || "fetch failed",
        }));
      }
    };

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return state;
}
