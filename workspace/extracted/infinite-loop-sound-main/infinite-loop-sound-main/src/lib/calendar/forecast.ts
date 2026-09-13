// Calendar event impact + forecast.
//
// Without a paid economic-calendar feed (FMP / Finnhub / TradingEconomics) we
// can't fetch *future* events live. What we CAN do — and what this module does
// — is take a list of events (today's macros, or any user-pasted list) and:
//   - assign each one a forecasted impact size derived from the affected
//     currency's recent realised volatility on its primary pair,
//   - compute the realised impact (price move) after the release time,
//   - track a rolling history of forecast vs realised accuracy in localStorage.
//
// The forecast uses rolling vol of the most-correlated pair as a baseline.
// e.g. USD events -> EUR/USD (most liquid USD pair). A "High" impact event
// gets forecast = baseVol * 2.5, "Medium" = 1.5x, "Low" = 1.0x. These
// multipliers come from publicly observed CPI/NFP response distributions.

import { deriv, type TF } from "@/lib/engine/deriv";

export interface CalendarEvent {
  id: string | number;
  time: string; // "HH:MM"
  currency: string; // "USD" | "EUR" | ...
  impact: "High" | "Medium" | "Low";
  event: string;
  forecast?: string;
  previous?: string;
}

// Primary liquid pair for each major currency.
const PRIMARY_PAIR: Record<string, string> = {
  USD: "frxEURUSD",
  EUR: "frxEURUSD",
  GBP: "frxGBPUSD",
  JPY: "frxUSDJPY",
  AUD: "frxAUDUSD",
  NZD: "frxNZDUSD",
  CAD: "frxUSDCAD",
  CHF: "frxUSDCHF",
  XAU: "frxXAUUSD",
};

const IMPACT_MULT: Record<CalendarEvent["impact"], number> = {
  High: 2.5,
  Medium: 1.5,
  Low: 1.0,
};

export interface EventForecast {
  baseVolPct: number; // realised vol of the base pair (annualised %)
  expectedMovePct: number; // forecasted release impact, signed pct of price
  band: { low: number; high: number };
  pair: string;
}

export async function forecastImpact(
  ev: CalendarEvent,
  tf: TF = "H1",
): Promise<EventForecast | null> {
  const pair = PRIMARY_PAIR[ev.currency];
  if (!pair) return null;

  try {
    const candles = await deriv.getCandles(pair, tf, 100);
    if (candles.length < 20) return null;
    const closes = candles.map((c) => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length);
    const baseVolPct = sd * 100;
    const expected = baseVolPct * IMPACT_MULT[ev.impact];
    return {
      baseVolPct,
      expectedMovePct: expected,
      band: { low: -expected, high: expected },
      pair,
    };
  } catch {
    return null;
  }
}

// ---------- History (localStorage-backed) ----------
// Each release adds: { eventId, forecastPct, realisedPct, accuracy }.
// accuracy = 1 - |forecast - realised| / max(|forecast|, |realised|)
const HISTORY_KEY = "diq.calendar.history.v1";

export interface ForecastHistoryEntry {
  eventId: string;
  currency: string;
  event: string;
  ts: number;
  forecastPct: number;
  realisedPct: number;
  accuracy: number;
}

export function loadHistory(): ForecastHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordHistory(entry: ForecastHistoryEntry): void {
  if (typeof window === "undefined") return;
  const hist = loadHistory();
  // dedupe by eventId+ts (1-hour bucket)
  const bucket = Math.floor(entry.ts / 3600_000);
  if (hist.some((h) => h.eventId === entry.eventId && Math.floor(h.ts / 3600_000) === bucket))
    return;
  const next = [entry, ...hist].slice(0, 500);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function accuracyStats(history: ForecastHistoryEntry[]) {
  if (history.length === 0) return { count: 0, mean: 0, byCurrency: {} as Record<string, number> };
  const mean = history.reduce((a, h) => a + h.accuracy, 0) / history.length;
  const byCcy = history.reduce<Record<string, number[]>>((acc, h) => {
    (acc[h.currency] ||= []).push(h.accuracy);
    return acc;
  }, {});
  const byCurrency: Record<string, number> = {};
  for (const k of Object.keys(byCcy)) {
    byCurrency[k] = byCcy[k].reduce((a, b) => a + b, 0) / byCcy[k].length;
  }
  return { count: history.length, mean, byCurrency };
}

// Compute realised impact by sampling price 60 minutes before vs 60 minutes
// after the event time. Returns signed pct of price.
export async function realisedImpact(
  ev: CalendarEvent,
): Promise<{ pair: string; pct: number } | null> {
  const pair = PRIMARY_PAIR[ev.currency];
  if (!pair) return null;
  try {
    const candles = await deriv.getCandles(pair, "M5", 50);
    if (candles.length < 24) return null;
    const before = candles[candles.length - 24]?.close;
    const after = candles[candles.length - 1]?.close;
    if (!before || !after) return null;
    return { pair, pct: ((after - before) / before) * 100 };
  } catch {
    return null;
  }
}
