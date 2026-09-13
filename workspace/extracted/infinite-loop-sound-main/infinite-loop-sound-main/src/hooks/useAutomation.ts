import { useState, useEffect, useCallback, useRef } from "react";

export interface UseAutomationReturn {
  isRunning: boolean;
  schedules: any[];
  recentSignals: any[];
  stats: any;
  start: () => void;
  stop: () => void;
  triggerRun: () => Promise<void>;
  addSchedule: (schedule: any) => void;
  removeSchedule: (id: string) => void;
  loadPresets: () => void;
}

export function useAutomation(
  getCandles?: (pair: string, tf: string) => Promise<any[]>,
): UseAutomationReturn {
  const [state, setState] = useState<any>(null);
  const engineRef = useRef<any>(null);

  useEffect(() => {
    import("@/lib/engine/automation-engine").then((mod) => {
      engineRef.current = mod.automationEngine;
      setState(mod.automationEngine.getState());
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRef.current) {
        setState(engineRef.current.getState());
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const start = useCallback(() => {
    engineRef.current?.start();
    if (getCandles) {
      engineRef.current?.onTick(() => engineRef.current.checkAndRun(getCandles));
    }
    setState(engineRef.current?.getState());
  }, [getCandles]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setState(engineRef.current?.getState());
  }, []);

  const triggerRun = useCallback(async () => {
    if (!getCandles || !engineRef.current) return;
    await engineRef.current.checkAndRun(getCandles);
    setState(engineRef.current?.getState());
  }, [getCandles]);

  const addSchedule = useCallback((schedule: any) => {
    engineRef.current?.addSchedule(schedule);
    setState(engineRef.current?.getState());
  }, []);

  const removeSchedule = useCallback((id: string) => {
    engineRef.current?.removeSchedule(id);
    setState(engineRef.current?.getState());
  }, []);

  const loadPresets = useCallback(() => {
    import("@/lib/engine/automation-engine").then((mod) => {
      const AutomationEngine = mod.AutomationEngine;
      const presets = AutomationEngine.getPresetSchedules();
      presets.forEach((s: any) => engineRef.current?.addSchedule(s));
      setState(engineRef.current?.getState());
    });
  }, []);

  return {
    isRunning: state?.isRunning ?? false,
    schedules: state?.schedules ?? [],
    recentSignals: state?.recentSignals ?? [],
    stats: state?.stats ?? {
      totalSignals: 0,
      dispatched: 0,
      lastRun: 0,
      nextRun: 0,
    },
    start,
    stop,
    triggerRun,
    addSchedule,
    removeSchedule,
    loadPresets,
  };
}
