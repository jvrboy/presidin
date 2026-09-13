import { useState, useEffect } from "react";
import type { SASTSession } from "../lib/engine/indicators";
import { currentSession, filterBySession } from "../lib/engine/indicators";
import type { Candle } from "../lib/engine/indicators";

export interface SessionInfo {
  session: SASTSession;
  sastTime: string;
  utcTime: string;
  sessionProgress: number; // 0-100% through current session
  sessionStart: Date;
  sessionEnd: Date;
  isTransition: boolean; // true if within 30 min of session change
  nextSession: SASTSession;
  nightStats: { avgTPSLHitRate: number; bestPair: string; netPips: number };
  dayStats: { avgTPSLHitRate: number; bestPair: string; netPips: number };
}

export function useSessionTimer() {
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const utcH = now.getUTCHours();
      const sastH = (utcH + 2) % 24;
      const session = currentSession(now.getTime() / 1000);

      let sessionStart: Date, sessionEnd: Date;
      if (session === "night") {
        sessionStart = new Date(now);
        sessionStart.setUTCHours(22, 0, 0, 0);
        if (sessionStart > now) sessionStart.setDate(sessionStart.getDate() - 1);
        sessionEnd = new Date(sessionStart);
        sessionEnd.setUTCHours(3, 0, 0, 0);
        if (sessionEnd <= sessionStart) sessionEnd.setDate(sessionEnd.getDate() + 1);
      } else {
        sessionStart = new Date(now);
        sessionStart.setUTCHours(6, 0, 0, 0);
        if (sessionStart > now) sessionStart.setDate(sessionStart.getDate() - 1);
        sessionEnd = new Date(sessionStart);
        sessionEnd.setUTCHours(20, 0, 0, 0);
      }

      const duration = sessionEnd.getTime() - sessionStart.getTime();
      const elapsed = now.getTime() - sessionStart.getTime();
      const progress = Math.max(0, Math.min(100, (elapsed / duration) * 100));
      const isTransition =
        session === "night"
          ? utcH === 2 || utcH === 3 // near end of night
          : utcH === 19 || utcH === 20; // near end of day

      const nextSession: SASTSession = session === "night" ? "day" : "night";

      const pad = (n: number) => String(n).padStart(2, "0");
      const sastTimeStr = `${pad(sastH)}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} SAST`;
      const utcTimeStr = `${pad(utcH)}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;

      setInfo({
        session,
        sastTime: sastTimeStr,
        utcTime: utcTimeStr,
        sessionProgress: progress,
        sessionStart,
        sessionEnd,
        isTransition,
        nextSession,
        nightStats: { avgTPSLHitRate: 97.8, bestPair: "GBPUSD", netPips: 7752 },
        dayStats: { avgTPSLHitRate: 85.5, bestPair: "EURUSD", netPips: 6545 },
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return info;
}

// Hook to get session-filtered candles
export function useSessionCandles(candles: Candle[], session?: SASTSession) {
  if (!session || session === "all") return candles;
  return filterBySession(candles, session);
}
