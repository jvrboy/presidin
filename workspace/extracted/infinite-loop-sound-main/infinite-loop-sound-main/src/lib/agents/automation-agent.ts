// Automation Agent — Monitors the automation engine, reports on schedule
// performance, suggests optimal scan times, and recommends schedule
// optimizations based on historical signal quality.
//
// This agent is read-only with respect to the engine state but can
// suggest schedule additions/changes that the caller can apply.

import type { AgentResult, AgentSignal, AgentConfig } from "./types";
import {
  automationEngine,
  AutomationEngine,
  type AutomationSchedule,
  type AutomationSignal,
  type AutomationState,
} from "../engine/automation-engine";

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const AUTOMATION_AGENT_CONFIG: AgentConfig = {
  id: "automation-agent",
  name: "Automation Agent",
  description:
    "Monitors automation engine health, reports schedule performance, suggests optimal scan times, and detects dispatch issues.",
  enabled: true,
  priority: "medium",
  intervalSec: 60,
  instruments: ["all"],
  timeframes: ["all"],
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Format a timestamp to a human-readable UTC string. */
const fmtTime = (ts: number): string => (ts > 0 ? new Date(ts).toUTCString() : "never");

/** Format milliseconds to human-readable duration. */
const fmtDuration = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

/** Get a short time-of-day label from a schedule entry. */
const timeLabel = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC`;

/** Day-of-week codes. */
const DAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Compute dispatch success rate per target across recent signals.
 */
function computeDispatchStats(
  signals: AutomationSignal[],
): Record<string, { total: number; success: number; rate: number }> {
  const stats: Record<string, { total: number; success: number }> = {};

  for (const sig of signals) {
    for (const [target, result] of Object.entries(sig.dispatchResults)) {
      if (!stats[target]) stats[target] = { total: 0, success: 0 };
      stats[target].total++;
      if (result.success) stats[target].success++;
    }
  }

  // Convert to rates
  const result: Record<string, { total: number; success: number; rate: number }> = {};
  for (const [target, s] of Object.entries(stats)) {
    result[target] = { ...s, rate: s.total > 0 ? s.success / s.total : 0 };
  }

  return result;
}

/**
 * Analyze schedule performance and suggest optimizations.
 * Compares signal production rate and dispatch success per schedule.
 */
function analyzeSchedulePerformance(
  schedules: AutomationSchedule[],
  signals: AutomationSignal[],
): Array<{
  scheduleId: string;
  name: string;
  totalSignals: number;
  dispatched: number;
  dispatchRate: number;
  avgScore: number;
  avgConfidence: number;
  topPair: string;
  suggestion?: string;
}> {
  const results: Array<{
    scheduleId: string;
    name: string;
    totalSignals: number;
    dispatched: number;
    dispatchRate: number;
    avgScore: number;
    avgConfidence: number;
    topPair: string;
    suggestion?: string;
  }> = [];

  for (const schedule of schedules) {
    const sigs = signals.filter((s) => s.scheduleId === schedule.id);
    const dispatched = sigs.filter((s) => s.dispatched).length;
    const total = sigs.length;
    const dispatchRate = total > 0 ? dispatched / total : 0;

    const avgScore = total > 0 ? sigs.reduce((s, sig) => s + sig.scorePct, 0) / total : 0;
    const avgConfidence = total > 0 ? sigs.reduce((s, sig) => s + sig.confidence, 0) / total : 0;

    // Find most common pair
    const pairCounts = new Map<string, number>();
    for (const sig of sigs) {
      pairCounts.set(sig.pair, (pairCounts.get(sig.pair) ?? 0) + 1);
    }
    const topPair = [...pairCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

    // Generate suggestions based on performance
    let suggestion: string | undefined;

    if (total > 10 && dispatchRate < 0.3) {
      suggestion = `Low dispatch rate (${(dispatchRate * 100).toFixed(0)}%). Consider lowering minScore from ${schedule.minScore} to ${Math.max(30, schedule.minScore - 10)} or minConfidence from ${(schedule.minConfidence * 100).toFixed(0)}% to ${Math.max(0.5, schedule.minConfidence - 0.1).toFixed(0)}%.`;
    } else if (total > 10 && avgScore < 45) {
      suggestion = `Average signal score is low (${avgScore.toFixed(1)}%). Consider switching to a more selective timeframe (H1 instead of M5) or reducing the instrument list.`;
    } else if (total === 0 && schedule.enabled) {
      suggestion =
        "No signals produced yet. The schedule may need more time to accumulate data, or the instrument/timeframe combination may be too restrictive.";
    } else if (total > 20 && avgScore > 65 && dispatchRate > 0.8) {
      suggestion =
        "Excellent performance! Consider adding more instruments or lowering minScore slightly to capture additional high-quality signals.";
    }

    results.push({
      scheduleId: schedule.id,
      name: schedule.name,
      totalSignals: total,
      dispatched,
      dispatchRate,
      avgScore: Math.round(avgScore * 10) / 10,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      topPair,
      suggestion,
    });
  }

  return results.sort((a, b) => b.dispatchRate - a.dispatchRate);
}

/**
 * Suggest new schedules based on strategy performance patterns.
 * Looks at hours when signals were highest quality.
 */
function suggestNewSchedules(signals: AutomationSignal[]): Array<{
  name: string;
  hour: number;
  day: string;
  reason: string;
  timeframe: string;
  pair: string;
}> {
  if (signals.length < 10) return [];

  const suggestions: Array<{
    name: string;
    hour: number;
    day: string;
    reason: string;
    timeframe: string;
    pair: string;
  }> = [];

  // Group signals by hour-of-day and compute avg score
  const hourBuckets = new Map<number, AutomationSignal[]>();
  for (const sig of signals) {
    const hour = new Date(sig.timestamp).getUTCHours();
    if (!hourBuckets.has(hour)) hourBuckets.set(hour, []);
    hourBuckets.get(hour)!.push(sig);
  }

  // Find hours with high avg score but no schedule
  const scheduledHours = new Set<number>();
  const existingSchedules = automationEngine.getSchedules();
  for (const sched of existingSchedules) {
    for (const entry of sched.schedules) {
      scheduledHours.add(entry.hour);
    }
  }

  // Find unscheduled high-quality hours
  const hourPerformance: Array<{ hour: number; avgScore: number; count: number; topPair: string }> =
    [];
  for (const [hour, sigs] of hourBuckets) {
    if (sigs.length < 3) continue; // need at least 3 signals to be meaningful
    const avgScore = sigs.reduce((s, sig) => s + sig.scorePct, 0) / sigs.length;
    if (avgScore >= 50 && !scheduledHours.has(hour)) {
      const pairCounts = new Map<string, number>();
      for (const sig of sigs) {
        pairCounts.set(sig.pair, (pairCounts.get(sig.pair) ?? 0) + 1);
      }
      const topPair = [...pairCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EURUSD";
      hourPerformance.push({ hour, avgScore, count: sigs.length, topPair });
    }
  }

  // Sort by avg score descending and take top 3
  hourPerformance.sort((a, b) => b.avgScore - a.avgScore);
  for (const hp of hourPerformance.slice(0, 3)) {
    suggestions.push({
      name: `Auto-detected ${timeLabel(hp.hour, 0)}`,
      hour: hp.hour,
      day: "Weekdays",
      reason:
        `${hp.count} signals with avg score ${hp.avgScore.toFixed(0)}% at this hour — ` +
        `no schedule currently covers this time. Top pair: ${hp.topPair}.`,
      timeframe: "H1",
      pair: hp.topPair,
    });
  }

  return suggestions;
}

/**
 * Suggest optimal scan times based on historical signal quality.
 * Analyzes which times produced the best risk-adjusted signals.
 */
function computeOptimalScanTimes(signals: AutomationSignal[]): Array<{
  hour: number;
  dayOfWeek: string;
  avgScore: number;
  signalCount: number;
  dispatchRate: number;
}> {
  if (signals.length < 5) return [];

  // Group by hour + day-of-week
  const buckets = new Map<string, { hour: number; day: number; sigs: AutomationSignal[] }>();

  for (const sig of signals) {
    const d = new Date(sig.timestamp);
    const key = `${d.getUTCHours()}_${d.getUTCDay()}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        hour: d.getUTCHours(),
        day: d.getUTCDay(),
        sigs: [],
      });
    }
    buckets.get(key)!.sigs.push(sig);
  }

  // Compute stats per bucket, keep only those with 2+ signals
  const results: Array<{
    hour: number;
    dayOfWeek: string;
    avgScore: number;
    signalCount: number;
    dispatchRate: number;
  }> = [];

  for (const [, bucket] of buckets) {
    if (bucket.sigs.length < 2) continue;
    const avgScore = bucket.sigs.reduce((s, sig) => s + sig.scorePct, 0) / bucket.sigs.length;
    const dispatched = bucket.sigs.filter((s) => s.dispatched).length;
    results.push({
      hour: bucket.hour,
      dayOfWeek: DAY_CODES[bucket.day],
      avgScore: Math.round(avgScore * 10) / 10,
      signalCount: bucket.sigs.length,
      dispatchRate: bucket.sigs.length > 0 ? dispatched / bucket.sigs.length : 0,
    });
  }

  return results
    .sort((a, b) => b.avgScore * b.dispatchRate - a.avgScore * a.dispatchRate)
    .slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
// AUTOMATION AGENT
// ═══════════════════════════════════════════════════════════════════

export function runAutomationAgent(): AgentResult {
  const start = performance.now();
  const signals: AgentSignal[] = [];
  const insights: string[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Get current automation state ─────────────────────────
    const state: AutomationState = automationEngine.getState();
    const schedules = automationEngine.getSchedules();
    const recentSignals = automationEngine.getRecentSignals();
    const isRunning = automationEngine.isEngineRunning();

    // ── 2. Check if presets are loaded, suggest if not ──────────
    const enabledSchedules = schedules.filter((s) => s.enabled);
    const disabledSchedules = schedules.filter((s) => !s.enabled);

    if (schedules.length === 0) {
      insights.push(
        "NO SCHEDULES: Automation engine has no schedules configured. Load presets to get started with SAST Night, London Open, NY Open, News Hour, and Weekend Close scanners.",
      );
    } else {
      insights.push(
        `Automation: ${enabledSchedules.length}/${schedules.length} schedules enabled, engine ${isRunning ? "RUNNING" : "STOPPED"}.`,
      );
    }

    // ── 3. Report on next run ───────────────────────────────────
    if (isRunning && state.stats.nextRun > 0) {
      const minutesUntil = Math.max(0, Math.round((state.stats.nextRun - Date.now()) / 60_000));
      insights.push(
        `Next scheduled scan: ${timeLabel(new Date(state.stats.nextRun).getUTCHours(), new Date(state.stats.nextRun).getUTCMinutes())} ` +
          `(${minutesUntil} min from now).`,
      );
    } else if (!isRunning && enabledSchedules.length > 0) {
      insights.push(
        "WARNING: Engine is STOPPED but schedules are configured. Start the engine to begin automated scanning.",
      );
    }

    // ── 4. Analyze recent automated signals performance ─────────
    const schedulePerformance = analyzeSchedulePerformance(schedules, recentSignals);

    for (const sp of schedulePerformance) {
      if (sp.totalSignals > 0) {
        insights.push(
          `[${sp.name}] ${sp.totalSignals} signals, ${sp.dispatched} dispatched ` +
            `(${(sp.dispatchRate * 100).toFixed(0)}%), avg score ${sp.avgScore}%, ` +
            `avg confidence ${(sp.avgConfidence * 100).toFixed(0)}%, top pair: ${sp.topPair}.`,
        );
      }

      // Report suggestions
      if (sp.suggestion) {
        insights.push(`SUGGESTION [${sp.name}]: ${sp.suggestion}`);
      }
    }

    // ── 5. Compute and report dispatch success rates ────────────
    const dispatchStats = computeDispatchStats(recentSignals);

    if (Object.keys(dispatchStats).length > 0) {
      for (const [target, stats] of Object.entries(dispatchStats)) {
        const rateStr = (stats.rate * 100).toFixed(0);
        if (stats.rate < 0.8 && stats.total > 3) {
          insights.push(
            `DISPATCH WARNING: ${target} has ${rateStr}% success rate (${stats.success}/${stats.total}). Check connectivity and credentials.`,
          );
        } else {
          insights.push(
            `Dispatch [${target}]: ${stats.success}/${stats.total} successful (${rateStr}%).`,
          );
        }
      }
    } else if (state.stats.totalSignals > 0) {
      insights.push(
        "No dispatch targets have been used — signals are being generated but not sent anywhere. Configure dispatch targets in your schedules.",
      );
    }

    // ── 6. Suggest optimal scan times ───────────────────────────
    const optimalTimes = computeOptimalScanTimes(recentSignals);
    if (optimalTimes.length > 0) {
      const topTimes = optimalTimes.slice(0, 3);
      const timeList = topTimes
        .map(
          (t) =>
            `${t.dayOfWeek} ${timeLabel(t.hour, 0)} (${t.avgScore}% avg, ${t.signalCount} signals)`,
        )
        .join("; ");
      insights.push(
        `Best signal quality times: ${timeList}. Consider adding schedules at these times.`,
      );
    }

    // ── 7. Suggest new schedules based on performance ───────────
    const scheduleSuggestions = suggestNewSchedules(recentSignals);
    if (scheduleSuggestions.length > 0) {
      for (const sug of scheduleSuggestions) {
        insights.push(`NEW SCHEDULE CANDIDATE: ${sug.name} — ${sug.reason}`);
      }
    }

    // ── 8. Check disabled schedules and suggest re-enabling ─────
    for (const ds of disabledSchedules) {
      const sigs = recentSignals.filter((s) => s.scheduleId === ds.id);
      if (sigs.length > 0) {
        const avgScore = sigs.reduce((s, sig) => s + sig.scorePct, 0) / sigs.length;
        insights.push(
          `DISABLED [${ds.name}] produced ${sigs.length} signals at avg ${avgScore.toFixed(0)}% score. Consider re-enabling if conditions have changed.`,
        );
      }
    }

    // ── 9. Check for stale schedules (no signals in 24h) ────────
    const oneDayAgo = Date.now() - 86_400_000;
    for (const sched of enabledSchedules) {
      const recentForSched = recentSignals.filter(
        (s) => s.scheduleId === sched.id && s.timestamp >= oneDayAgo,
      );
      if (recentForSched.length === 0 && isRunning) {
        insights.push(
          `STALE SCHEDULE: [${sched.name}] has produced no signals in the last 24h. ` +
            `Check if instrument data is available and the schedule times are correct.`,
        );
      }
    }

    // ── 10. Generate signals for automation issues ──────────────
    if (!isRunning && enabledSchedules.length > 0) {
      signals.push({
        id: crypto.randomUUID(),
        strategy: "automation-health",
        pair: "SYSTEM",
        direction: "BUY",
        confidence: 0.9,
        score: 25,
        timestamp: Date.now(),
        metadata: {
          issue: "engine_stopped",
          message: "Automation engine is stopped with active schedules",
          scheduleCount: enabledSchedules.length,
        },
      });
    }

    for (const sp of schedulePerformance) {
      if (sp.totalSignals > 10 && sp.dispatchRate < 0.2) {
        signals.push({
          id: crypto.randomUUID(),
          strategy: "automation-performance",
          pair: "SYSTEM",
          direction: "BUY",
          confidence: 0.7,
          score: 15,
          timestamp: Date.now(),
          metadata: {
            issue: "low_dispatch_rate",
            scheduleId: sp.scheduleId,
            scheduleName: sp.name,
            dispatchRate: sp.dispatchRate,
            suggestion: sp.suggestion,
          },
        });
      }
    }

    // ── 11. Build the report output ─────────────────────────────
    const report = {
      isRunning,
      totalSchedules: schedules.length,
      enabledSchedules: enabledSchedules.length,
      disabledSchedules: disabledSchedules.length,
      totalSignals: state.stats.totalSignals,
      totalDispatched: state.stats.dispatched,
      overallDispatchRate:
        state.stats.totalSignals > 0 ? state.stats.dispatched / state.stats.totalSignals : 0,
      lastRun: state.stats.lastRun,
      nextRun: state.stats.nextRun,
      lastRunFormatted: fmtTime(state.stats.lastRun),
      nextRunFormatted: fmtTime(state.stats.nextRun),
      nextRunIn: fmtDuration(Math.max(0, state.stats.nextRun - Date.now())),
      schedulePerformance,
      dispatchStats,
      optimalScanTimes: optimalTimes.slice(0, 5),
      scheduleSuggestions,
      statusSummary: automationEngine.getStatusSummary(),
    };

    return {
      agentId: AUTOMATION_AGENT_CONFIG.id,
      status: "completed",
      timestamp: Date.now(),
      output: { report } as Record<string, unknown>,
      signals: signals.length > 0 ? signals : undefined,
      insights,
      errors: errors.length > 0 ? errors : undefined,
      duration: performance.now() - start,
    };
  } catch (err) {
    return {
      agentId: AUTOMATION_AGENT_CONFIG.id,
      status: "error",
      timestamp: Date.now(),
      errors: [err instanceof Error ? err.message : String(err)],
      duration: performance.now() - start,
    };
  }
}

export { AUTOMATION_AGENT_CONFIG };
