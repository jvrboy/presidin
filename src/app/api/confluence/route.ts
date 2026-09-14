import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectConfluence, confluenceLabel, type ConfluenceSignal } from "@/lib/presidin/confluence";

export const runtime = "nodejs";

/**
 * Get recent confluence signals from the last hour.
 * Groups signals by symbol, detects when multiple timeframes align.
 *
 * GET /api/confluence
 * Returns: { confluences: ConfluenceSignal[], count: number }
 */
export async function GET() {
  try {
    // Fetch signals from the last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db.signalRecord.findMany({
      where: { createdAt: { gte: hourAgo } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Reconstruct Signal objects (we stored votes as JSON)
    const signals = recent.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      direction: s.direction as "BUY" | "SELL" | "NEUTRAL",
      confidence: s.confidence,
      votes: JSON.parse(s.votesJson),
      consensusScore: s.consensus,
      suggestedEntry: s.entryPrice,
      suggestedStopLoss: s.stopLoss,
      suggestedTakeProfit: s.takeProfit,
      riskRewardRatio: s.rrRatio,
      positionSize: s.positionSize,
      createdAt: s.createdAt.getTime(),
      expiresAt: s.createdAt.getTime() + 30 * 60 * 1000,
    }));

    const confluences = detectConfluence(signals as any);

    return NextResponse.json({
      confluences: confluences.map((c) => ({
        ...c,
        levelLabel: confluenceLabel(c.level),
      })),
      count: confluences.length,
      totalSignals: signals.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, confluences: [], count: 0 }, { status: 500 });
  }
}
