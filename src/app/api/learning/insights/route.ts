import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Learning Insights — per-agent accuracy contribution.
 * Returns each agent's vote count, correct count, accuracy, and a "contribution" score
 * (how much the agent's vote correlated with the final signal being correct).
 */
export async function GET() {
  try {
    const evaluated = await db.signalRecord.findMany({
      where: { outcome: { not: null } },
      take: 1000,
    });

    if (evaluated.length === 0) {
      return NextResponse.json({
        agents: [],
        totalSignals: 0,
        evaluated: 0,
        topContributors: [],
        needsImprovement: [],
      });
    }

    const agentStats: Record<string, {
      agentId: string;
      agentName: string;
      votes: number;
      correct: number;
      accuracy: number;
      avgConfidence: number;
      weight: number;
      contribution: number; // positive = helps, negative = hurts
      direction: "BUY" | "SELL" | "NEUTRAL";
    }> = {};

    for (const sig of evaluated) {
      try {
        const votes = JSON.parse(sig.votesJson);
        const signalWon = sig.outcome === "win";
        for (const v of votes) {
          if (!agentStats[v.agentId]) {
            agentStats[v.agentId] = {
              agentId: v.agentId,
              agentName: v.agentName ?? v.agentId,
              votes: 0, correct: 0, accuracy: 0,
              avgConfidence: 0, weight: v.weight ?? 1, contribution: 0,
              direction: v.direction,
            };
          }
          const a = agentStats[v.agentId];
          a.votes++;
          a.avgConfidence += v.confidence ?? 0;
          const agentAgreedWithOutcome =
            (v.direction === sig.direction && signalWon) ||
            (v.direction !== sig.direction && v.direction !== "NEUTRAL" && !signalWon);
          if (agentAgreedWithOutcome) a.correct++;
          // Contribution: +1 if agent agreed with winning outcome, -1 if disagreed
          if (signalWon && v.direction === sig.direction) a.contribution += 1;
          if (signalWon && v.direction !== sig.direction && v.direction !== "NEUTRAL") a.contribution -= 0.5;
          if (!signalWon && v.direction === sig.direction) a.contribution -= 1;
        }
      } catch {}
    }

    // Finalize stats
    const agents = Object.values(agentStats).map((a) => ({
      ...a,
      accuracy: a.votes > 0 ? (a.correct / a.votes) * 100 : 0,
      avgConfidence: a.votes > 0 ? a.avgConfidence / a.votes : 0,
    }));

    // Sort by contribution descending
    agents.sort((a, b) => b.contribution - a.contribution);

    const topContributors = agents.slice(0, 5);
    const needsImprovement = [...agents].reverse().slice(0, 5);

    return NextResponse.json({
      agents,
      totalSignals: evaluated.length,
      evaluated: evaluated.length,
      topContributors,
      needsImprovement,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, agents: [] }, { status: 500 });
  }
}
