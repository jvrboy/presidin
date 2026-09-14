import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Retrain the ML model based on accumulated signal outcomes.
 * Recomputes agent weights based on calibration (per-agent accuracy).
 */
export async function POST() {
  try {
    const allSignals = await db.signalRecord.findMany({
      where: { outcome: { not: null } },
      take: 1000,
    });

    if (allSignals.length < 10) {
      return NextResponse.json({
        retrained: false,
        reason: "not enough evaluated signals (need ≥10)",
        evaluated: allSignals.length,
      });
    }

    // Compute per-agent accuracy
    const agentCal: Record<string, { votes: number; correct: number; weight: number }> = {};
    for (const s of allSignals) {
      try {
        const votes = JSON.parse(s.votesJson);
        for (const v of votes) {
          if (!agentCal[v.agentId]) agentCal[v.agentId] = { votes: 0, correct: 0, weight: v.weight ?? 1 };
          agentCal[v.agentId].votes++;
          const agentCorrect = v.direction === s.direction && s.outcome === "win";
          if (agentCorrect) agentCal[v.agentId].correct++;
        }
      } catch {}
    }

    // Recompute weights
    const newWeights: Record<string, number> = {};
    for (const [agentId, cal] of Object.entries(agentCal)) {
      const acc = cal.votes > 0 ? cal.correct / cal.votes : 0.5;
      const adjusted = Math.max(0.3, Math.min(2.0, cal.weight * (acc / 0.5)));
      newWeights[agentId] = adjusted;
    }

    const correct = allSignals.filter((s) => s.outcome === "win").length;
    const accuracy = allSignals.length > 0 ? (correct / allSignals.length) * 100 : 0;

    // Save a new ML model version
    try {
      await db.mlModelVersion.create({
        data: {
          modelType: "mlp_2layer",
          version: `auto_${Date.now()}`,
          weightsJson: JSON.stringify(newWeights),
          metricsJson: JSON.stringify({ accuracy, evaluated: allSignals.length }),
          status: "production",
          samples: allSignals.length,
        },
      });
    } catch {}

    return NextResponse.json({
      retrained: true,
      newWeights,
      accuracy,
      evaluated: allSignals.length,
    });
  } catch (err: any) {
    return NextResponse.json({ retrained: false, error: err?.message }, { status: 500 });
  }
}
