import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// ─── 1. Get Optimizer State ──────────────────────────────────────────

export const getOptimizerStateFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();

  // Fetch all recorded outcomes
  const { data: outcomes, error: oErr } = await sb
    .from("optimizer_outcomes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (oErr) throw new Error(oErr.message);

  // Fetch active adjustments
  const { data: adjustments, error: aErr } = await sb.from("optimizer_adjustments").select("*");

  if (aErr) throw new Error(aErr.message);

  // Aggregate stats
  const all = outcomes ?? [];
  const slHitCount = all.filter((o: any) => o.outcome === "SL_HIT").length;
  const winCount = all.filter((o: any) => o.outcome === "WIN").length;

  // Aggregate root causes
  const causeMap = new Map<string, { count: number; severity: number }>();
  for (const o of all) {
    const causes = (o.root_causes as any[]) ?? [];
    for (const c of causes) {
      const existing = causeMap.get(c.category) ?? { count: 0, severity: 0 };
      existing.count++;
      existing.severity += c.severity === "critical" ? 3 : c.severity === "major" ? 2 : 1;
      causeMap.set(c.category, existing);
    }
  }

  // Per-pair stats
  const pairStats: Record<
    string,
    { total: number; wins: number; slHits: number; avgPnl: number; topCause: string }
  > = {};
  for (const o of all) {
    const k = `${(o as any).pair}_${(o as any).timeframe}`;
    const entry = pairStats[k] ?? { total: 0, wins: 0, slHits: 0, avgPnl: 0, topCause: "" };
    entry.total++;
    if ((o as any).outcome === "WIN") entry.wins++;
    if ((o as any).outcome === "SL_HIT") entry.slHits++;
    entry.avgPnl = (entry.avgPnl * (entry.total - 1) + ((o as any).pnl ?? 0)) / entry.total;
    pairStats[k] = entry;
  }

  // Derive top root cause per pair
  for (const [key, entry] of Object.entries(pairStats)) {
    let topCat = "";
    let topCount = 0;
    const pair = key.split("_")[0];
    for (const o of all.filter((o: any) => (o as any).pair === pair)) {
      for (const c of ((o as any).root_causes as any[]) ?? []) {
        const existing = causeMap.get(c.category);
        if (existing && existing.count > topCount) {
          topCount = existing.count;
          topCat = c.category;
        }
      }
    }
    entry.topCause = topCat;
  }

  // Get active recommendations
  const { data: recs } = await sb
    .from("optimizer_recommendations")
    .select("*")
    .eq("applied", false)
    .order("confidence", { ascending: false })
    .limit(20);

  return {
    totalAnalyzed: all.length,
    slHitCount,
    winCount,
    topRootCauses: Array.from(causeMap.entries())
      .sort(([, a], [, b]) => b.severity - a.severity)
      .slice(0, 10)
      .map(([category, data]) => ({ category, count: data.count, severity: data.severity })),
    activeRecommendations: recs ?? [],
    appliedAdjustments: (adjustments ?? []).reduce<Record<string, any>>((acc, a: any) => {
      acc[a.key] = a.value;
      return acc;
    }, {}),
    pairStats,
  };
});

// ─── 2. Submit Signal Outcome ────────────────────────────────────────

export const submitOutcomeFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pair: z.string().min(1),
        timeframe: z.string().min(1),
        direction: z.enum(["BUY", "SELL"]),
        entry: z.number(),
        sl: z.number(),
        tp1: z.number(),
        tp2: z.number().optional(),
        tp3: z.number().optional(),
        scorePct: z.number(),
        rating: z.string(),
        confluence: z.array(
          z.object({
            label: z.string(),
            passed: z.boolean(),
            pts: z.number(),
          }),
        ),
        outcome: z.enum(["WIN", "SL_HIT", "BE", "EXPIRED"]),
        exitPrice: z.number(),
        pnl: z.number(),
        maxFavorable: z.number().optional(),
        maxAdverse: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    // Detect root causes for SL hits
    const rootCauses: any[] = [];
    let misleadingConfluence: string[] = [];

    if (data.outcome === "SL_HIT") {
      const slDist = Math.abs(data.entry - data.sl);
      const tp1Dist = Math.abs(data.entry - data.tp1);
      const favorable = data.maxFavorable ?? 0;
      const adverse = data.maxAdverse ?? slDist;

      // SL too tight check
      const slOvershoot = adverse - slDist;
      if (slOvershoot >= 0 && slOvershoot < slDist * 0.3 && favorable > slDist * 0.8) {
        rootCauses.push({
          category: "sl_placement",
          severity: "critical",
          description: "SL was too tight — price exceeded SL by a small margin before reversing.",
          evidence: `SL overshoot: ${slOvershoot.toFixed(2)}, favorable: ${favorable.toFixed(2)}`,
          fixSuggestion: "Widen SL by 1.2× to reduce premature stop-outs.",
        });
      }

      // Identify misleading confluence
      misleadingConfluence = data.confluence.filter((c) => c.passed).map((c) => c.label);

      // Low confluence check
      const passedCount = data.confluence.filter((c) => c.passed).length;
      if (passedCount < 3) {
        rootCauses.push({
          category: "insufficient_confluence",
          severity: "major",
          description: `Only ${passedCount} confluence items passed — insufficient confirmation.`,
          evidence: `${passedCount}/${data.confluence.length} confluence passed.`,
          fixSuggestion: "Increase minimum confluence requirement to 4+ items.",
        });
      }
    }

    // Build recommendation
    const recommendations: any[] = [];
    if (rootCauses.some((c) => c.category === "sl_placement")) {
      recommendations.push({
        type: "adjust_sl",
        description: `${data.pair} ${data.timeframe}: Widen SL multiplier to reduce stop-outs.`,
        impact: "high",
        confidence: 0.75,
        autoApplicable: true,
        params: { slMult: 1.2 },
      });
    }

    const { error } = await sb.from("optimizer_outcomes").insert({
      ...data,
      root_causes: rootCauses,
      misleading_confluence: misleadingConfluence,
      recommendations,
      created_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);

    // Insert recommendations if any
    if (recommendations.length) {
      await sb.from("optimizer_recommendations").insert(
        recommendations.map((r) => ({
          ...r,
          pair: data.pair,
          timeframe: data.timeframe,
          created_at: new Date().toISOString(),
        })),
      );
    }

    return { ok: true, rootCauses, recommendations, misleadingConfluence };
  });

// ─── 3. Get Active Recommendations ───────────────────────────────────

export const getRecommendationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();

  const { data, error } = await sb
    .from("optimizer_recommendations")
    .select("*")
    .eq("applied", false)
    .order("confidence", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return { count: data?.length ?? 0, recommendations: data ?? [] };
});

// ─── 4. Apply Recommendation ─────────────────────────────────────────

export const applyRecommendationFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        recommendationId: z.string().min(1),
        force: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    // Fetch the recommendation
    const { data: rec, error: rErr } = await sb
      .from("optimizer_recommendations")
      .select("*")
      .eq("id", data.recommendationId)
      .single();

    if (rErr || !rec) throw new Error("Recommendation not found");

    // Safety check: only auto-applicable recs can be applied without force
    const recAny = rec as any;
    if (!recAny.auto_applicable && !data.force) {
      throw new Error("This recommendation requires manual review. Set force=true to override.");
    }

    // Apply the adjustment
    if (recAny.params) {
      const adjustmentRows = Object.entries(recAny.params).map(([key, value]) => ({
        key: `${recAny.pair ?? "global"}_${recAny.timeframe ?? "all"}_${key}`,
        value,
        recommendation_id: data.recommendationId,
        created_at: new Date().toISOString(),
      }));

      await sb.from("optimizer_adjustments").upsert(adjustmentRows, {
        onConflict: "key",
      });
    }

    // Mark recommendation as applied
    const { error: uErr } = await sb
      .from("optimizer_recommendations")
      .update({
        applied: true,
        applied_at: new Date().toISOString(),
      })
      .eq("id", data.recommendationId);

    if (uErr) throw new Error(uErr.message);

    return {
      ok: true,
      applied: data.recommendationId,
      type: recAny.type,
      adjustments: recAny.params ?? {},
    };
  });
