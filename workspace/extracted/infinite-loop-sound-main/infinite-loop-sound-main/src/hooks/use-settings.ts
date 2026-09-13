import { useEffect, useState } from "react";

const KEY = "diq.settings";
export interface AppLocalSettings {
  telegramChartSnapshots: boolean;
  liveTickRescan: boolean;
  aiConfluenceEnabled: boolean;
  // Confluence engine scoring weights (Heatmap accuracy probability)
  weightFib: number;
  weightSD: number;
  weightOrderFlow: number;
  weightVolumeProfile: number;
  // Backtest realism
  spreadPips: number;
  slippagePips: number;
  execDelayBars: number;
  // Heatmap perf
  tickThrottleMs: number;
}
const DEFAULTS: AppLocalSettings = {
  telegramChartSnapshots: true,
  liveTickRescan: true,
  aiConfluenceEnabled: true,
  weightFib: 1,
  weightSD: 1,
  weightOrderFlow: 1,
  weightVolumeProfile: 1,
  spreadPips: 1.0,
  slippagePips: 0.5,
  execDelayBars: 0,
  tickThrottleMs: 150,
};

const read = (): AppLocalSettings => {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
};

export function useSettings() {
  const [s, setS] = useState<AppLocalSettings>(DEFAULTS);
  useEffect(() => {
    setS(read());
  }, []);
  const update = (patch: Partial<AppLocalSettings>) => {
    const next = { ...read(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    setS(next);
    window.dispatchEvent(new CustomEvent("diq:settings", { detail: next }));
  };
  useEffect(() => {
    const h = (e: any) => setS(e.detail);
    window.addEventListener("diq:settings", h);
    return () => window.removeEventListener("diq:settings", h);
  }, []);
  return { settings: s, update };
}

export const readSettings = read;
