import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// ─── 1. Get Automation Engine State ──────────────────────────────────

export const getAutomationStateFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();

  const { data: schedules, error: sErr } = await sb
    .from("automation_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  if (sErr) throw new Error(sErr.message);

  const { data: signals, error: sigErr } = await sb
    .from("automation_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (sigErr) throw new Error(sigErr.message);

  const { count: totalSignals } = await sb
    .from("automation_signals")
    .select("*", { count: "exact", head: true });

  const { count: dispatched } = await sb
    .from("automation_signals")
    .select("*", { count: "exact", head: true })
    .eq("dispatched", true);

  return {
    schedules: schedules ?? [],
    recentSignals: signals ?? [],
    stats: {
      totalSignals: totalSignals ?? 0,
      dispatched: dispatched ?? 0,
      lastRun: signals?.[0]?.created_at ?? null,
      bySchedule: (schedules ?? []).reduce<Record<string, { signals: number; dispatched: number }>>(
        (acc, s: any) => {
          acc[s.id] = { signals: 0, dispatched: 0 };
          return acc;
        },
        {},
      ),
    },
    isRunning: true,
  };
});

// ─── 2. Create Schedule ──────────────────────────────────────────────

const ScheduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  instruments: z.array(z.string()).min(1),
  timeframe: z.string().min(1),
  schedules: z.array(
    z.object({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      session: z.enum(["night", "day", "any"]).optional(),
    }),
  ),
  strategies: z.array(z.string()),
  minScore: z.number().min(0).max(100),
  minConfidence: z.number().min(0).max(1),
  dispatchTargets: z.array(z.enum(["supabase", "telegram", "webhook", "bot"])),
  neuralEnhance: z.boolean().default(false),
  maxSignalsPerHour: z.number().int().min(1).max(20),
  cooldownMinutes: z.number().int().min(1).max(120),
});

export const createScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((d) => ScheduleSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = admin();
    const { error } = await sb.from("automation_schedules").upsert(data, {
      onConflict: "id",
    });
    if (error) throw new Error(error.message);
    return { ok: true, id: data.id };
  });

// ─── 3. Update Schedule ──────────────────────────────────────────────

export const updateScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().min(1),
        updates: z
          .object({
            name: z.string().min(1).max(100).optional(),
            enabled: z.boolean().optional(),
            instruments: z.array(z.string()).optional(),
            timeframe: z.string().min(1).optional(),
            minScore: z.number().min(0).max(100).optional(),
            minConfidence: z.number().min(0).max(1).optional(),
            neuralEnhance: z.boolean().optional(),
            maxSignalsPerHour: z.number().int().min(1).max(20).optional(),
            cooldownMinutes: z.number().int().min(1).max(120).optional(),
            strategies: z.array(z.string()).optional(),
            dispatchTargets: z.array(z.enum(["supabase", "telegram", "webhook", "bot"])).optional(),
            schedules: z
              .array(
                z.object({
                  hour: z.number().int().min(0).max(23),
                  minute: z.number().int().min(0).max(59),
                  daysOfWeek: z.array(z.number().int().min(0).max(6)),
                  session: z.enum(["night", "day", "any"]).optional(),
                }),
              )
              .optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { error } = await sb.from("automation_schedules").update(data.updates).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── 4. Remove Schedule ──────────────────────────────────────────────

export const removeScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sb = admin();
    const { error: sErr } = await sb.from("automation_schedules").delete().eq("id", data.id);
    if (sErr) throw new Error(sErr.message);

    // Clean up associated signals
    await sb.from("automation_signals").delete().eq("schedule_id", data.id);

    return { ok: true };
  });

// ─── 5. Trigger Immediate Automation Run ─────────────────────────────

export const triggerAutomationRunFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        scheduleIds: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    // Fetch enabled schedules to run
    let query = sb.from("automation_schedules").select("*").eq("enabled", true);

    if (data.scheduleIds?.length) {
      query = query.in("id", data.scheduleIds);
    }

    const { data: schedules, error } = await query;
    if (error) throw new Error(error.message);

    // Record the triggered run
    const runId = `run_${Date.now().toString(36)}`;
    await sb.from("automation_runs").insert({
      id: runId,
      schedule_ids: (schedules ?? []).map((s: any) => s.id),
      status: "triggered",
      triggered_at: new Date().toISOString(),
    });

    return {
      ok: true,
      runId,
      schedulesQueued: (schedules ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        instruments: s.instruments,
      })),
    };
  });

// ─── 6. Get Recent Automated Signals ─────────────────────────────────

export const getAutomationSignalsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb
    .from("automation_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return { count: data?.length ?? 0, signals: data ?? [] };
});

// ─── 7. Load All Preset Schedules ────────────────────────────────────

const PRESET_SCHEDULES = [
  {
    id: "preset_sast_night",
    name: "SAST Night Scanner",
    enabled: true,
    instruments: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "XAUUSD"],
    timeframe: "M5",
    schedules: [
      { hour: 22, minute: 0, daysOfWeek: [], session: "night" as const },
      { hour: 23, minute: 0, daysOfWeek: [], session: "night" as const },
      { hour: 0, minute: 0, daysOfWeek: [], session: "night" as const },
    ],
    strategies: ["all"],
    minScore: 40,
    minConfidence: 0.65,
    dispatchTargets: ["supabase", "telegram"] as const,
    neuralEnhance: true,
    maxSignalsPerHour: 4,
    cooldownMinutes: 30,
  },
  {
    id: "preset_london_open",
    name: "London Open",
    enabled: true,
    instruments: ["EURUSD", "GBPUSD", "XAUUSD"],
    timeframe: "H1",
    schedules: [
      { hour: 7, minute: 55, daysOfWeek: [1, 2, 3, 4, 5], session: "day" as const },
      { hour: 8, minute: 0, daysOfWeek: [1, 2, 3, 4, 5], session: "day" as const },
    ],
    strategies: ["squeeze-breakout", "small-body-breakout", "ichimoku-cloud", "ema-crossover"],
    minScore: 45,
    minConfidence: 0.7,
    dispatchTargets: ["supabase", "telegram", "bot"] as const,
    neuralEnhance: true,
    maxSignalsPerHour: 3,
    cooldownMinutes: 15,
  },
  {
    id: "preset_ny_open",
    name: "NY Open",
    enabled: true,
    instruments: ["USDJPY", "USDCAD", "SPX500"],
    timeframe: "H1",
    schedules: [
      { hour: 12, minute: 25, daysOfWeek: [1, 2, 3, 4, 5] },
      { hour: 12, minute: 30, daysOfWeek: [1, 2, 3, 4, 5] },
    ],
    strategies: ["squeeze-breakout", "macd-adx", "stoch-bb-crossover"],
    minScore: 45,
    minConfidence: 0.68,
    dispatchTargets: ["supabase", "telegram"] as const,
    neuralEnhance: false,
    maxSignalsPerHour: 3,
    cooldownMinutes: 15,
  },
  {
    id: "preset_news_hour",
    name: "News Hour Scanner",
    enabled: false,
    instruments: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD"],
    timeframe: "M15",
    schedules: [
      { hour: 12, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
      { hour: 12, minute: 30, daysOfWeek: [1, 2, 3, 4, 5] },
      { hour: 13, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
    ],
    strategies: ["news-spike-follow", "all"],
    minScore: 35,
    minConfidence: 0.55,
    dispatchTargets: ["telegram", "webhook"] as const,
    neuralEnhance: false,
    maxSignalsPerHour: 6,
    cooldownMinutes: 10,
  },
  {
    id: "preset_weekend_close",
    name: "Weekend Close",
    enabled: true,
    instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
    timeframe: "H4",
    schedules: [{ hour: 21, minute: 0, daysOfWeek: [5] }],
    strategies: ["all"],
    minScore: 50,
    minConfidence: 0.75,
    dispatchTargets: ["supabase", "telegram"] as const,
    neuralEnhance: true,
    maxSignalsPerHour: 8,
    cooldownMinutes: 5,
  },
];

export const loadPresetSchedulesFn = createServerFn({ method: "POST" }).handler(async () => {
  const sb = admin();

  // Upsert all presets — existing ones are updated, new ones are inserted
  const { error } = await sb
    .from("automation_schedules")
    .upsert(PRESET_SCHEDULES, { onConflict: "id" });

  if (error) throw new Error(error.message);

  return {
    ok: true,
    loaded: PRESET_SCHEDULES.length,
    ids: PRESET_SCHEDULES.map((p) => p.id),
  };
});
