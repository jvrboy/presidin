import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const Pivot = z.object({ time: z.number(), price: z.number() });

export const saveValidation = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pair: z.string(),
        timeframe: z.string(),
        oscillator: z.string(),
        divType: z.string().nullable().optional(),
        isValid: z.boolean(),
        pricePivots: z.array(Pivot),
        oscPivots: z.array(Pivot),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { error } = await sb.from("divergence_validations").insert({
      pair: data.pair,
      timeframe: data.timeframe,
      oscillator: data.oscillator,
      div_type: data.divType ?? null,
      is_valid: data.isValid,
      price_pivots: data.pricePivots,
      osc_pivots: data.oscPivots,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const validationStats = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb.from("divergence_validations").select("oscillator,is_valid");
  if (error) throw new Error(error.message);
  const byOsc: Record<string, { valid: number; invalid: number }> = {};
  let total = 0,
    valid = 0;
  (data || []).forEach((r: any) => {
    total++;
    if (r.is_valid) valid++;
    const k = r.oscillator;
    byOsc[k] = byOsc[k] || { valid: 0, invalid: 0 };
    if (r.is_valid) byOsc[k].valid++;
    else byOsc[k].invalid++;
  });
  return { total, valid, accuracy: total ? Math.round((valid / total) * 1000) / 10 : 0, byOsc };
});

// Per-context recent verdicts + accuracy for the signal drawer.
export const validationStatsFor = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pair: z.string().optional(),
        timeframe: z.string().optional(),
        oscillator: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    let q = sb
      .from("divergence_validations")
      .select("id,created_at,oscillator,timeframe,pair,div_type,is_valid,notes")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.pair) q = q.eq("pair", data.pair);
    if (data.timeframe) q = q.eq("timeframe", data.timeframe);
    if (data.oscillator) q = q.eq("oscillator", data.oscillator);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const total = (rows || []).length;
    const valid = (rows || []).filter((r: any) => r.is_valid).length;
    return {
      recent: rows || [],
      total,
      valid,
      accuracy: total ? Math.round((valid / total) * 1000) / 10 : 0,
    };
  });

// Calibration weights derived from user validations.
// Returns a multiplier (0.6 – 1.4) per oscillator label that future signals
// can apply on top of the base confluence points.
export const calibrationWeights = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb.from("divergence_validations").select("oscillator,is_valid");
  if (error) throw new Error(error.message);
  const agg: Record<string, { v: number; t: number }> = {};
  (data || []).forEach((r: any) => {
    const k = (r.oscillator || "").toUpperCase();
    agg[k] = agg[k] || { v: 0, t: 0 };
    agg[k].t++;
    if (r.is_valid) agg[k].v++;
  });
  const weights: Record<string, number> = {};
  for (const [k, { v, t }] of Object.entries(agg)) {
    if (t < 3) {
      weights[k] = 1;
      continue;
    }
    const acc = v / t; // 0..1
    weights[k] = Math.max(0.6, Math.min(1.4, 0.6 + acc * 0.8));
  }
  return { weights };
});
