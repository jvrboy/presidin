import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Agent weight history — track how each agent's weight has changed over retraining cycles.
 * Reads from MlModelVersion table.
 */
export async function GET() {
  try {
    const models = await db.mlModelVersion.findMany({
      orderBy: { trainedAt: "asc" },
      take: 100,
    });

    if (models.length === 0) {
      return NextResponse.json({ history: [], agents: [] });
    }

    // Build weight history per agent
    const agentsSet = new Set<string>();
    const history: { trainedAt: number; version: string; weights: Record<string, number> }[] = [];

    for (const m of models) {
      try {
        const w = JSON.parse(m.weightsJson);
        const entry: any = { trainedAt: m.trainedAt.getTime(), version: m.version, weights: {} };
        for (const [k, v] of Object.entries(w)) {
          agentsSet.add(k);
          entry.weights[k] = v;
        }
        history.push(entry);
      } catch {}
    }

    // Per-agent weight time series
    const perAgent: Record<string, { trainedAt: number; weight: number }[]> = {};
    for (const agent of agentsSet) {
      perAgent[agent] = history.map((h) => ({
        trainedAt: h.trainedAt,
        weight: h.weights[agent] ?? 1,
      }));
    }

    return NextResponse.json({
      history,
      agents: Array.from(agentsSet),
      perAgent,
      retrainCount: models.length,
      latestVersion: models[models.length - 1]?.version ?? null,
      latestTrainedAt: models[models.length - 1]?.trainedAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, history: [], agents: [], perAgent: {} }, { status: 500 });
  }
}
