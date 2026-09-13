/**
 * Automation Engine — DivergenceIQ
 *
 * Time-based strategy automation engine that auto-analyzes instruments
 * at scheduled times and dispatches signals to configured targets.
 *
 * Features:
 *  - Cron-like scheduling with day-of-week and session filters
 *  - Full analysis pipeline: signal analysis → V2 strategies → V3 strategies
 *    → signal optimizer adjustments → neural enhancement
 *  - Rate limiting (per-hour caps, cooldown between signals)
 *  - Multi-target dispatch (Supabase, Telegram, Webhook, Bot)
 *  - Persistent state via localStorage
 *  - 5 preset schedules covering major trading sessions
 */

import type { Candle } from "./indicators";
import { analyze, type AnalysisResult } from "./signal";
import { evaluateStrategiesV2, getSASTSession } from "./strategies-v2";
import { evaluateStrategiesV3 as evaluateV3 } from "./strategies-v3";
import { signalOptimizer } from "./signal-optimizer";
import type { StrategyHitV2 } from "./strategies-v2";
import { neuralEnhanceSignal } from "./neural-networks";
import { ALL_ASSETS } from "./deriv";

/**
 * Map a bare instrument name to Deriv's symbol format.
 * "EURUSD" → "frxEURUSD", "XAUUSD" → "frxXAUUSD", "SPX500" → "OTC_SPC".
 * Symbols already in the correct form pass through unchanged.
 */
function toDerivSymbol(name: string): string {
  if (ALL_ASSETS.some((a) => a.symbol === name)) return name;
  const upper = name.toUpperCase();
  // Index/synthetic aliases
  const syntheticAliases: Record<string, string> = {
    SPX500: "OTC_SPC",
    SPC: "OTC_SPC",
    US30: "OTC_DJI",
    NAS100: "OTC_NDX",
    GER40: "OTC_GDAXI",
    UK100: "OTC_FTSE",
    JPN225: "OTC_JPN",
  };
  if (syntheticAliases[upper]) return syntheticAliases[upper];
  if (/^(XAU|XAG|BTC|ETH)/.test(upper)) return `frx${upper}`;
  if (upper.includes("USD") || upper.length === 6) return `frx${upper}`;
  return name;
}

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

/** A single cron-like schedule entry within an AutomationSchedule */
export interface ScheduleEntry {
  /** Hour in UTC (0-23) */
  hour: number;
  /** Minute in UTC (0-59) */
  minute: number;
  /** Days of week to fire (0=Sun … 6=Sat). Empty array = every day. */
  daysOfWeek: number[];
  /** Only fire during this session. Omit or "any" = no filter. */
  session?: "night" | "day" | "any";
}

/** A complete automation schedule configuration */
export interface AutomationSchedule {
  id: string;
  name: string;
  enabled: boolean;
  instruments: string[];
  timeframe: string;
  /** Cron-like schedule entries defining when to run */
  schedules: ScheduleEntry[];
  /** Which strategies to run: "all" or specific strategy IDs */
  strategies: string[];
  /** Minimum scorePct required to produce a signal */
  minScore: number;
  /** Minimum strategy confidence (0-1) required */
  minConfidence: number;
  /** Where to dispatch qualifying signals */
  dispatchTargets: ("supabase" | "telegram" | "webhook" | "bot")[];
  /** Whether to run neural enhancement on the signal */
  neuralEnhance: boolean;
  /** Maximum signals dispatched per hour (across all instruments in this schedule) */
  maxSignalsPerHour: number;
  /** Minimum minutes between dispatches for the same instrument */
  cooldownMinutes: number;
}

/** A signal produced by the automation engine, ready for dispatch */
export interface AutomationSignal {
  id: string;
  scheduleId: string;
  pair: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  scorePct: number;
  confidence: number;
  rating: string;
  /** Names of strategies that contributed to this signal */
  strategies: string[];
  /** Neural network boost amount added to scorePct */
  neuralBoost: number;
  timestamp: number;
  dispatched: boolean;
  dispatchResults: Record<string, { success: boolean; message: string }>;
}

/** Full engine state snapshot */
export interface AutomationState {
  schedules: AutomationSchedule[];
  recentSignals: AutomationSignal[];
  stats: {
    totalSignals: number;
    dispatched: number;
    lastRun: number;
    nextRun: number;
    bySchedule: Record<string, { signals: number; dispatched: number }>;
  };
  isRunning: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** localStorage key for persisted engine state */
const STORAGE_KEY = "diq_automation_engine";

/** How often (ms) the engine checks for matching schedules */
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

/** Maximum number of recent signals to keep in memory / storage */
const MAX_RECENT_SIGNALS = 200;

/** Generate a short unique ID */
const uid = (): string => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ═══════════════════════════════════════════════════════════════════
// AUTOMATION ENGINE
// ═══════════════════════════════════════════════════════════════════

export class AutomationEngine {
  // ── State ──────────────────────────────────────────────────────
  private schedules: AutomationSchedule[] = [];
  private recentSignals: AutomationSignal[] = [];
  private timer: number | null = null;
  private isRunning = false;

  /**
   * Rate-limit tracking: key = `${scheduleId}_${pair}`, value = { hour, count }.
   * We track how many signals were dispatched for a given schedule+pair
   * within the current UTC hour.
   */
  private signalCounts: Record<string, { hour: number; count: number }> = {};

  /**
   * Cooldown tracking: key = `${scheduleId}_${pair}`, value = last
   * dispatch timestamp in ms. Prevents rapid-fire dispatches.
   */
  private lastDispatchAt: Record<string, number> = {};

  // ───────────────────────────────────────────────────────────────
  // CONSTRUCTOR
  // ───────────────────────────────────────────────────────────────
  constructor() {
    this.load();
  }

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add a new schedule. If a schedule with the same id already exists
   * it will be replaced (upsert behaviour).
   */
  addSchedule(schedule: AutomationSchedule): void {
    const idx = this.schedules.findIndex((s) => s.id === schedule.id);
    if (idx >= 0) {
      this.schedules[idx] = schedule;
    } else {
      this.schedules.push(schedule);
    }
    this.save();
  }

  /** Remove a schedule by id */
  removeSchedule(id: string): void {
    this.schedules = this.schedules.filter((s) => s.id !== id);
    // Clean up rate-limit / cooldown state for this schedule
    for (const key of Object.keys(this.signalCounts)) {
      if (key.startsWith(`${id}_`)) delete this.signalCounts[key];
    }
    for (const key of Object.keys(this.lastDispatchAt)) {
      if (key.startsWith(`${id}_`)) delete this.lastDispatchAt[key];
    }
    this.save();
  }

  /** Partially update an existing schedule */
  updateSchedule(id: string, updates: Partial<AutomationSchedule>): void {
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx < 0) return;
    this.schedules[idx] = { ...this.schedules[idx], ...updates };
    this.save();
  }

  /** Get a shallow copy of all schedules */
  getSchedules(): AutomationSchedule[] {
    return [...this.schedules];
  }

  // ═══════════════════════════════════════════════════════════════
  // ENGINE CONTROL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start the automation check loop. The engine will call
   * `checkAndRun` every 30 seconds, which requires a candle
   * provider to be supplied at call time (passed from the caller).
   *
   * The loop runs until `stop()` is called.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.save();

    // We can't store the getCandles callback on the instance because
    // it's only available at call time. Instead, the caller must
    // invoke `checkAndRun(getCandles)` manually, or use the
    // auto-check wrapper pattern below.
    console.log("[AutomationEngine] Started — checking every 30s");
    this.timer = window.setInterval(() => {
      // The actual `checkAndRun` is async and needs a candle provider.
      // This interval is a "pulse" — the UI layer should wire it up
      // to the real getCandles function. For headless / server use,
      // call `checkAndRun` directly.
      this.emit("tick");
    }, CHECK_INTERVAL_MS) as unknown as number;
  }

  /** Stop the automation loop */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.save();
    console.log("[AutomationEngine] Stopped");
  }

  /** Whether the engine loop is currently active */
  isEngineRunning(): boolean {
    return this.isRunning;
  }

  // ── Simple event emitter for the "tick" event ──────────────────
  // This allows UI code to hook into the 30s pulse and supply
  // the getCandles callback without the engine holding a reference.
  private listeners: Array<() => void> = [];

  /** Subscribe to tick events (called every 30s when running) */
  onTick(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Emit a tick event to all subscribers */
  private emit(event: "tick"): void {
    if (event === "tick") {
      for (const fn of this.listeners) fn();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CORE: CHECK SCHEDULES AND RUN ANALYSES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Main evaluation loop. Called every 30 seconds (or manually).
   *
   * For each enabled schedule:
   *   1. Check if current UTC time matches any ScheduleEntry
   *   2. Fetch candles via the provided callback
   *   3. Run full analysis pipeline
   *   4. Filter by schedule thresholds
   *   5. Check rate limits
   *   6. Dispatch qualifying signals
   *
   * @param getCandles - Async function that returns candles for a given pair/timeframe
   * @returns Array of signals produced in this cycle (dispatched or not)
   */
  async checkAndRun(
    getCandles: (pair: string, tf: string) => Promise<Candle[]>,
  ): Promise<AutomationSignal[]> {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const utcDay = now.getUTCDay(); // 0=Sun … 6=Sat
    const currentEpoch = Math.floor(now.getTime() / 1000);
    const currentSession = getSASTSession(currentEpoch);

    const produced: AutomationSignal[] = [];

    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;

      // ── Step 1: Check if any schedule entry matches current time ──
      const matchingEntry = schedule.schedules.find((entry) => {
        // Hour/minute must match exactly (checked within the 30s window)
        if (entry.hour !== utcHour || entry.minute !== utcMinute) return false;

        // Day-of-week filter
        if (entry.daysOfWeek.length > 0 && !entry.daysOfWeek.includes(utcDay)) {
          return false;
        }

        // Session filter
        if (entry.session && entry.session !== "any") {
          if (entry.session !== currentSession) return false;
        }

        return true;
      });

      if (!matchingEntry) continue;

      // ── Step 2-6: Analyze each instrument in the schedule ──
      for (const rawPair of schedule.instruments) {
        try {
          // Presets may use bare names ("EURUSD", "XAUUSD", "SPX500") —
          // normalize them to Deriv's required symbol format
          const pair = toDerivSymbol(rawPair);
          const signal = await this.analyzeInstrument(
            pair,
            schedule.timeframe,
            await getCandles(pair, schedule.timeframe),
            schedule,
          );

          if (signal) {
            produced.push(signal);
          }
        } catch (err) {
          console.error(
            `[AutomationEngine] Error analyzing ${rawPair}/${schedule.timeframe}:`,
            err,
          );
        }
      }
    }

    // Update last run timestamp
    this.save();
    return produced;
  }

  // ═══════════════════════════════════════════════════════════════
  // SINGLE INSTRUMENT ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Run the full analysis pipeline for a single instrument and
   * determine if a signal should be dispatched.
   *
   * Pipeline:
   *   1. Core signal analysis (indicators + divergence)
   *   2. V2 strategy evaluation (SAST, squeeze, breakout, etc.)
   *   3. V3 strategy evaluation (Ichimoku, SMC, harmonics, etc.)
   *   4. Signal optimizer adjustments (learned SL/TP/score tweaks)
   *   5. Neural enhancement (if enabled)
   *   6. Filter by minScore and minConfidence
   *   7. Rate-limit checks
   *   8. Dispatch
   */
  async analyzeInstrument(
    pair: string,
    tf: string,
    candles: Candle[],
    schedule: AutomationSchedule,
  ): Promise<AutomationSignal | null> {
    // Need at least 30 candles for meaningful analysis
    if (candles.length < 30) {
      console.log(`[AutomationEngine] Skipping ${pair}/${tf} — only ${candles.length} candles`);
      return null;
    }

    // ── Step 1: Core signal analysis ────────────────────────────
    const result: AnalysisResult = analyze(pair, tf, candles);

    // If no direction was detected, skip
    if (!result.direction) return null;

    // ── Step 2: V2 strategy evaluation ───────────────────────────
    // evaluateStrategiesV2 needs ticks (empty array for automation)
    const v2Hits: StrategyHitV2[] = evaluateStrategiesV2(candles, []);

    // ── Step 3: V3 strategy evaluation ───────────────────────────
    const v3Hits: StrategyHitV2[] = evaluateV3(candles);

    // Combine all strategy hits
    const allHits = [...v2Hits, ...v3Hits];

    // ── Step 4: Signal optimizer adjustments ─────────────────────
    const adjusted = signalOptimizer.getAdjustedParams(pair, tf);

    // If the optimizer has blacklisted this pair/TF, skip entirely
    if (adjusted.blacklist) {
      console.log(`[AutomationEngine] ${pair}/${tf} is blacklisted by signal optimizer`);
      return null;
    }

    // Use the higher of the schedule's minScore or the optimizer's learned minScore
    const effectiveMinScore = Math.max(schedule.minScore, adjusted.minScore);

    // ── Step 5: Neural enhancement (if enabled) ──────────────────
    let neuralBoost = 0;
    if (schedule.neuralEnhance) {
      try {
        const neuralResult = neuralEnhanceSignal(
          {
            direction: result.direction,
            scorePct: result.scorePct,
            pair,
            timeframe: tf,
          },
          candles,
        );
        neuralBoost = neuralResult.neuralBoost;

        // If neural network disagrees with direction, skip
        if (neuralResult.direction !== result.direction) {
          console.log(
            `[AutomationEngine] Neural network disagrees on ${pair}/${tf}: ` +
              `analysis=${result.direction}, neural=${neuralResult.direction}. Skipping.`,
          );
          return null;
        }
      } catch (err) {
        // Neural enhancement is best-effort; don't block on failure
        console.warn(`[AutomationEngine] Neural enhancement failed for ${pair}/${tf}:`, err);
      }
    }

    // ── Step 6: Compute final score with neural boost ────────────
    const finalScorePct = Math.min(100, result.scorePct + neuralBoost);

    // Filter by minimum score
    if (finalScorePct < effectiveMinScore) {
      return null;
    }

    // Compute aggregate confidence from strategy hits
    // Average confidence of all hits, or 0.5 default if no hits
    const avgConfidence =
      allHits.length > 0
        ? allHits.reduce((sum, h) => sum + h.confidence, 0) / allHits.length
        : result.scorePct / 100;

    // Filter by minimum confidence
    if (avgConfidence < schedule.minConfidence) {
      return null;
    }

    // Collect strategy names that agree with the detected direction
    const agreeingStrategies = allHits
      .filter((h) => h.side === result.direction)
      .map((h) => h.name);

    // ── Step 7: Rate-limit checks ───────────────────────────────
    const rateKey = `${schedule.id}_${pair}`;

    // Per-hour rate limit keyed by the absolute UTC hour index so yesterday's
    // count can never block today's same-hour dispatches
    const currentHour = Math.floor(Date.now() / 3_600_000);
    const hourEntry = this.signalCounts[rateKey];
    if (hourEntry) {
      if (hourEntry.hour === currentHour && hourEntry.count >= schedule.maxSignalsPerHour) {
        console.log(
          `[AutomationEngine] Rate limited: ${pair} hit ${schedule.maxSignalsPerHour}/hr limit for schedule ${schedule.id}`,
        );
        return null;
      }
    }

    // Cooldown check
    const lastDispatch = this.lastDispatchAt[rateKey];
    if (lastDispatch) {
      const elapsed = (Date.now() - lastDispatch) / 60_000; // minutes
      if (elapsed < schedule.cooldownMinutes) {
        console.log(
          `[AutomationEngine] Cooldown active: ${pair} needs ${(schedule.cooldownMinutes - elapsed).toFixed(1)} more minutes`,
        );
        return null;
      }
    }

    // ── Build the automation signal ──────────────────────────────
    const signal: AutomationSignal = {
      id: uid(),
      scheduleId: schedule.id,
      pair,
      timeframe: tf,
      direction: result.direction,
      scorePct: finalScorePct,
      confidence: Math.round(avgConfidence * 100) / 100,
      rating: result.rating,
      strategies: agreeingStrategies,
      neuralBoost: Math.round(neuralBoost * 100) / 100,
      timestamp: Date.now(),
      dispatched: false,
      dispatchResults: {},
    };

    // ── Step 8: Dispatch ────────────────────────────────────────
    if (schedule.dispatchTargets.length > 0) {
      signal.dispatchResults = await this.dispatchSignal(signal);
      signal.dispatched = Object.values(signal.dispatchResults).some((r) => r.success);

      // Update rate-limit counters on successful dispatch
      if (signal.dispatched) {
        // Per-hour counter
        if (!this.signalCounts[rateKey] || this.signalCounts[rateKey].hour !== currentHour) {
          this.signalCounts[rateKey] = { hour: currentHour, count: 0 };
        }
        this.signalCounts[rateKey].count++;

        // Cooldown timestamp
        this.lastDispatchAt[rateKey] = Date.now();
      }
    }

    // Store the signal
    this.recentSignals.unshift(signal);
    if (this.recentSignals.length > MAX_RECENT_SIGNALS) {
      this.recentSignals = this.recentSignals.slice(0, MAX_RECENT_SIGNALS);
    }

    this.save();

    console.log(
      `[AutomationEngine] Signal ${signal.dispatched ? "DISPATCHED" : "generated"}: ` +
        `${signal.direction} ${pair}/${tf} @ ${finalScorePct}% (${result.rating}) ` +
        `[${agreeingStrategies.join(", ") || "no strategy hits"}]`,
    );

    return signal;
  }

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL DISPATCH
  // ═══════════════════════════════════════════════════════════════

  /**
   * Dispatch a signal to all configured targets.
   *
   * For each target we build the appropriate payload but do NOT
   * make the actual network call here — the caller can pick up
   * the built objects and send them. This keeps the engine
   * decoupled from transport-layer dependencies (Supabase client,
   * Telegram bot, etc.).
   *
   * @returns Record of target → { success, message }
   */
  async dispatchSignal(
    signal: AutomationSignal,
  ): Promise<Record<string, { success: boolean; message: string }>> {
    const results: Record<string, { success: boolean; message: string }> = {};

    // Find the schedule to know which targets to dispatch to
    const schedule = this.schedules.find((s) => s.id === signal.scheduleId);
    const targets = schedule?.dispatchTargets ?? [];

    for (const target of targets) {
      switch (target) {
        case "supabase": {
          // Build a Supabase-compatible insert object for the `signals` table.
          // The caller can use this object directly with `supabase.from('signals').insert(...)`
          const supabasePayload = {
            pair: signal.pair,
            timeframe: signal.timeframe,
            direction: signal.direction,
            score_pct: signal.scorePct,
            confidence: signal.confidence,
            rating: signal.rating,
            strategies: signal.strategies,
            neural_boost: signal.neuralBoost,
            source: `automation:${signal.scheduleId}`,
            created_at: new Date(signal.timestamp).toISOString(),
            // Include trade levels if available from the analysis
            // (we'd need to store them — for now, the caller can enrich)
          };
          console.log(
            `[AutomationEngine:Supabase] Prepared insert:`,
            JSON.stringify(supabasePayload),
          );
          results["supabase"] = {
            success: true,
            message: `Payload prepared for signals table insert (${signal.pair} ${signal.direction} @ ${signal.scorePct}%)`,
          };
          break;
        }

        case "telegram": {
          // Format a Telegram-friendly message using Markdown
          const emoji = signal.direction === "BUY" ? "🟢" : "🔴";
          const strategiesText =
            signal.strategies.length > 0 ? `\n📊 Strategies: ${signal.strategies.join(", ")}` : "";
          const neuralText =
            signal.neuralBoost > 0 ? `\n🧠 Neural Boost: +${signal.neuralBoost.toFixed(1)}%` : "";

          const telegramMessage =
            `${emoji} *${signal.direction} ${signal.pair} (${signal.timeframe})*\n` +
            `⭐ Rating: *${signal.rating}* (${signal.scorePct}%)\n` +
            `🎯 Confidence: ${(signal.confidence * 100).toFixed(0)}%` +
            `${strategiesText}${neuralText}\n` +
            `🕐 ${new Date(signal.timestamp).toUTCString()}\n` +
            `🤖 Source: automation:${signal.scheduleId}`;

          console.log(`[AutomationEngine:Telegram] Message:\n${telegramMessage}`);
          results["telegram"] = {
            success: true,
            message: `Telegram message formatted (${signal.pair} ${signal.direction})`,
          };
          break;
        }

        case "webhook": {
          // Build a generic webhook payload
          const webhookPayload = {
            event: "signal",
            data: {
              id: signal.id,
              scheduleId: signal.scheduleId,
              pair: signal.pair,
              timeframe: signal.timeframe,
              direction: signal.direction,
              scorePct: signal.scorePct,
              confidence: signal.confidence,
              rating: signal.rating,
              strategies: signal.strategies,
              neuralBoost: signal.neuralBoost,
              timestamp: signal.timestamp,
            },
          };
          console.log(`[AutomationEngine:Webhook] Payload:`, JSON.stringify(webhookPayload));
          results["webhook"] = {
            success: true,
            message: `Webhook payload built for ${signal.pair} ${signal.direction}`,
          };
          break;
        }

        case "bot": {
          // Signal the bot runner if available.
          // The bot runner module may or may not be loaded — we try
          // to invoke it gracefully.
          try {
            // Dynamic import to avoid hard dependency
            const botModule = await import("../bot/runner").catch(() => null);
            const botRunner = botModule?.botRunner;
            if (botRunner && typeof botRunner.executeSignal === "function") {
              await botRunner.executeSignal({
                pair: signal.pair,
                direction: signal.direction,
                scorePct: signal.scorePct,
                rating: signal.rating,
                source: `automation:${signal.scheduleId}`,
              });
              results["bot"] = {
                success: true,
                message: `Bot executed signal for ${signal.pair}`,
              };
            } else {
              results["bot"] = {
                success: false,
                message: "Bot runner not available or missing executeSignal method",
              };
            }
          } catch (err) {
            results["bot"] = {
              success: false,
              message: `Bot execution failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
          break;
        }

        default: {
          results[target] = {
            success: false,
            message: `Unknown dispatch target: ${target}`,
          };
        }
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRESET SCHEDULES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Return 5 pre-configured schedules covering major trading sessions.
   * Users can load these as starting points and customize.
   */
  static getPresetSchedules(): AutomationSchedule[] {
    return [
      // ──────────────────────────────────────────────────────────
      // 1. SAST Night Scanner
      // Scans forex majors every hour during SAST night session
      // when the session edge is strongest (22:00-03:00 UTC).
      // Uses M5 for precision entries during the low-vol period.
      // ──────────────────────────────────────────────────────────
      {
        id: "preset_sast_night",
        name: "SAST Night Scanner",
        enabled: true,
        instruments: [
          "EURUSD",
          "GBPUSD",
          "USDJPY",
          "AUDUSD",
          "NZDUSD",
          "USDCAD",
          "USDCHF",
          "XAUUSD",
        ],
        timeframe: "M5",
        schedules: [
          { hour: 22, minute: 0, daysOfWeek: [], session: "night" },
          { hour: 23, minute: 0, daysOfWeek: [], session: "night" },
          { hour: 0, minute: 0, daysOfWeek: [], session: "night" },
          { hour: 1, minute: 0, daysOfWeek: [], session: "night" },
          { hour: 2, minute: 0, daysOfWeek: [], session: "night" },
        ],
        strategies: ["all"],
        minScore: 40,
        minConfidence: 0.65,
        dispatchTargets: ["supabase", "telegram"],
        neuralEnhance: true,
        maxSignalsPerHour: 4,
        cooldownMinutes: 30,
      },

      // ──────────────────────────────────────────────────────────
      // 2. London Open
      // Three passes around the London open (07:55, 08:00, 08:05)
      // to catch the initial breakout move. H1 timeframe for
      // reliable candle closes. Day session only.
      // ──────────────────────────────────────────────────────────
      {
        id: "preset_london_open",
        name: "London Open",
        enabled: true,
        instruments: ["EURUSD", "GBPUSD", "XAUUSD"],
        timeframe: "H1",
        schedules: [
          { hour: 7, minute: 55, daysOfWeek: [1, 2, 3, 4, 5], session: "day" },
          { hour: 8, minute: 0, daysOfWeek: [1, 2, 3, 4, 5], session: "day" },
          { hour: 8, minute: 5, daysOfWeek: [1, 2, 3, 4, 5], session: "day" },
        ],
        strategies: [
          "squeeze-breakout",
          "small-body-breakout",
          "sast-day-rule-b",
          "ichimoku-cloud",
          "ema-crossover",
        ],
        minScore: 45,
        minConfidence: 0.7,
        dispatchTargets: ["supabase", "telegram", "bot"],
        neuralEnhance: true,
        maxSignalsPerHour: 3,
        cooldownMinutes: 15,
      },

      // ──────────────────────────────────────────────────────────
      // 3. NY Open
      // Three passes around the New York open (12:25, 12:30, 12:35)
      // focusing on USD pairs. The NY session brings volume and
      // trend continuation opportunities.
      // ──────────────────────────────────────────────────────────
      {
        id: "preset_ny_open",
        name: "NY Open",
        enabled: true,
        instruments: ["USDJPY", "USDCAD", "SPX500"],
        timeframe: "H1",
        schedules: [
          { hour: 12, minute: 25, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 12, minute: 30, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 12, minute: 35, daysOfWeek: [1, 2, 3, 4, 5] },
        ],
        strategies: [
          "squeeze-breakout",
          "macd-adx",
          "psar-trend",
          "stoch-bb-crossover",
          "confluence-master",
        ],
        minScore: 45,
        minConfidence: 0.68,
        dispatchTargets: ["supabase", "telegram"],
        neuralEnhance: false,
        maxSignalsPerHour: 3,
        cooldownMinutes: 15,
      },

      // ──────────────────────────────────────────────────────────
      // 4. News Hour Scanner
      // Scans every 15 minutes during the 12:00-14:00 UTC news
      // window (US economic releases). Covers all USD-pair
      // instruments. Higher frequency but lower per-signal score.
      // ──────────────────────────────────────────────────────────
      {
        id: "preset_news_hour",
        name: "News Hour Scanner",
        enabled: false, // Off by default — user enables manually
        instruments: [
          "EURUSD",
          "GBPUSD",
          "USDJPY",
          "AUDUSD",
          "NZDUSD",
          "USDCAD",
          "USDCHF",
          "XAUUSD",
        ],
        timeframe: "M15",
        schedules: [
          // Every 15 minutes from 12:00 to 13:45 UTC
          { hour: 12, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 12, minute: 15, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 12, minute: 30, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 12, minute: 45, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 13, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 13, minute: 15, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 13, minute: 30, daysOfWeek: [1, 2, 3, 4, 5] },
          { hour: 13, minute: 45, daysOfWeek: [1, 2, 3, 4, 5] },
        ],
        strategies: ["news-spike-follow", "momentign-momentum", "all"],
        minScore: 35,
        minConfidence: 0.55,
        dispatchTargets: ["telegram", "webhook"],
        neuralEnhance: false,
        maxSignalsPerHour: 6,
        cooldownMinutes: 10,
      },

      // ──────────────────────────────────────────────────────────
      // 5. Weekend Close
      // Single scan on Friday at 21:00 UTC (just before weekend
      // close) using H4 timeframe. Catches end-of-week positions
      // and potential weekend-gap risk setups across all pairs.
      // ──────────────────────────────────────────────────────────
      {
        id: "preset_weekend_close",
        name: "Weekend Close",
        enabled: true,
        instruments: [
          "EURUSD",
          "GBPUSD",
          "USDJPY",
          "AUDUSD",
          "NZDUSD",
          "USDCAD",
          "USDCHF",
          "XAUUSD",
        ],
        timeframe: "H4",
        schedules: [
          { hour: 21, minute: 0, daysOfWeek: [5] }, // Friday only
        ],
        strategies: ["all"],
        minScore: 50,
        minConfidence: 0.75,
        dispatchTargets: ["supabase", "telegram"],
        neuralEnhance: true,
        maxSignalsPerHour: 8,
        cooldownMinutes: 5,
      },
    ];
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a full snapshot of the engine's current state.
   * Includes schedules, recent signals, and aggregate stats.
   */
  getState(): AutomationState {
    // Compute per-schedule stats
    const bySchedule: Record<string, { signals: number; dispatched: number }> = {};
    for (const sig of this.recentSignals) {
      if (!bySchedule[sig.scheduleId]) {
        bySchedule[sig.scheduleId] = { signals: 0, dispatched: 0 };
      }
      bySchedule[sig.scheduleId].signals++;
      if (sig.dispatched) bySchedule[sig.scheduleId].dispatched++;
    }

    // Compute next scheduled run time
    const nextRun = this.computeNextRunTime();

    return {
      schedules: [...this.schedules],
      recentSignals: [...this.recentSignals],
      stats: {
        totalSignals: this.recentSignals.length,
        dispatched: this.recentSignals.filter((s) => s.dispatched).length,
        lastRun: this.recentSignals[0]?.timestamp ?? 0,
        nextRun,
        bySchedule,
      },
      isRunning: this.isRunning,
    };
  }

  /**
   * Compute the next UTC timestamp when any schedule will fire.
   * Useful for UI display ("Next scan in X minutes").
   */
  private computeNextRunTime(): number {
    const now = new Date();
    let nextTime = Infinity;

    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;

      for (const entry of schedule.schedules) {
        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
          // Try each day of the week
          const candidate = new Date(now);
          candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
          candidate.setUTCHours(entry.hour, entry.minute, 0, 0);

          // Skip past times (unless we're looking at future days)
          if (dayOffset === 0 && candidate.getTime() <= now.getTime()) continue;

          // Day-of-week check
          if (entry.daysOfWeek.length > 0 && !entry.daysOfWeek.includes(candidate.getUTCDay())) {
            continue;
          }

          // Session check (approximate — we only know the hour/minute)
          if (entry.session && entry.session !== "any") {
            const sessionEpoch = Math.floor(candidate.getTime() / 1000);
            const session = getSASTSession(sessionEpoch);
            if (session !== entry.session) continue;
          }

          if (candidate.getTime() < nextTime) {
            nextTime = candidate.getTime();
          }
        }
      }
    }

    return nextTime === Infinity ? 0 : nextTime;
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE (localStorage)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Persist engine state to localStorage. Only stores schedules
   * and recent signals — runtime state (isRunning, timers) is
   * ephemeral and reconstituted on load.
   */
  save(): void {
    try {
      const data = {
        schedules: this.schedules,
        recentSignals: this.recentSignals.slice(0, MAX_RECENT_SIGNALS),
        signalCounts: this.signalCounts,
        lastDispatchAt: this.lastDispatchAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn("[AutomationEngine] Failed to save state:", err);
    }
  }

  /**
   * Load engine state from localStorage. Falls back to empty
   * defaults if nothing is stored or the data is corrupt.
   */
  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw) as {
        schedules?: AutomationSchedule[];
        recentSignals?: AutomationSignal[];
        signalCounts?: Record<string, { hour: number; count: number }>;
        lastDispatchAt?: Record<string, number>;
      };

      if (Array.isArray(data.schedules)) {
        this.schedules = data.schedules;
      }
      if (Array.isArray(data.recentSignals)) {
        this.recentSignals = data.recentSignals.slice(0, MAX_RECENT_SIGNALS);
      }
      if (data.signalCounts) {
        this.signalCounts = data.signalCounts;
      }
      if (data.lastDispatchAt) {
        this.lastDispatchAt = data.lastDispatchAt;
      }
    } catch (err) {
      console.warn("[AutomationEngine] Failed to load state, using defaults:", err);
      // Reset to safe defaults on corruption
      this.schedules = [];
      this.recentSignals = [];
      this.signalCounts = {};
      this.lastDispatchAt = {};
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Clear all schedules and recent signals, resetting the engine
   * to a clean state.
   */
  reset(): void {
    this.stop();
    this.schedules = [];
    this.recentSignals = [];
    this.signalCounts = {};
    this.lastDispatchAt = {};
    this.save();
    console.log("[AutomationEngine] Reset to defaults");
  }

  /**
   * Get recent signals, optionally filtered by schedule ID.
   * Returns a copy to prevent external mutation.
   */
  getRecentSignals(scheduleId?: string): AutomationSignal[] {
    const signals = scheduleId
      ? this.recentSignals.filter((s) => s.scheduleId === scheduleId)
      : this.recentSignals;
    return [...signals];
  }

  /**
   * Remove signals older than a given timestamp from the recent
   * signals list. Useful for periodic cleanup.
   */
  pruneSignals(olderThanTimestamp: number): number {
    const before = this.recentSignals.length;
    this.recentSignals = this.recentSignals.filter((s) => s.timestamp >= olderThanTimestamp);
    const pruned = before - this.recentSignals.length;
    if (pruned > 0) this.save();
    return pruned;
  }

  /**
   * Get a quick summary string for logging / debug purposes.
   */
  getStatusSummary(): string {
    const enabled = this.schedules.filter((s) => s.enabled).length;
    const total = this.schedules.length;
    const dispatched = this.recentSignals.filter((s) => s.dispatched).length;
    const nextRun = this.computeNextRunTime();
    const minutesUntil = nextRun > 0 ? Math.round((nextRun - Date.now()) / 60_000) : -1;

    return (
      `[AutomationEngine] ` +
      `Running: ${this.isRunning} | ` +
      `Schedules: ${enabled}/${total} enabled | ` +
      `Recent signals: ${this.recentSignals.length} (${dispatched} dispatched) | ` +
      `Next run: ${minutesUntil >= 0 ? `in ${minutesUntil}min` : "none scheduled"}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Singleton instance of the AutomationEngine. Import this to
 * access schedule management, engine control, and state from
 * anywhere in the application.
 *
 * @example
 * ```ts
 * import { automationEngine } from "./automation-engine";
 *
 * // Add a preset schedule
 * const presets = AutomationEngine.getPresetSchedules();
 * automationEngine.addSchedule(presets[0]);
 *
 * // Start the engine
 * automationEngine.start();
 *
 * // Wire up the tick to provide candles
 * automationEngine.onTick(async () => {
 *   const signals = await automationEngine.checkAndRun(
 *     async (pair, tf) => await fetchCandles(pair, tf),
 *   );
 *   console.log("Produced signals:", signals.length);
 * });
 * ```
 */
export const automationEngine = new AutomationEngine();
