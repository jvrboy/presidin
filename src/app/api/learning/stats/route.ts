import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const allSignals = await db.signalRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const totalSignals = allSignals.length;
    const evaluated = allSignals.filter((s) => s.outcome !== null);
    const correct = evaluated.filter((s) => s.outcome === "win");

    // Streaks
    let currentStreak = 0, bestStreak = 0;
    for (const s of evaluated) {
      if (s.outcome === "win") {
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else if (s.outcome === "loss") {
        currentStreak = 0;
      }
    }

    // By direction
    const byDirection = {
      BUY: { total: 0, correct: 0 },
      SELL: { total: 0, correct: 0 },
    };
    for (const s of evaluated) {
      if (s.direction === "BUY" || s.direction === "SELL") {
        byDirection[s.direction as "BUY" | "SELL"].total++;
        if (s.outcome === "win") byDirection[s.direction as "BUY" | "SELL"].correct++;
      }
    }

    const lastSignalAt = allSignals.length > 0 ? allSignals[0].createdAt.toISOString() : null;

    return NextResponse.json({
      totalSignals,
      evaluated: evaluated.length,
      correct: correct.length,
      accuracy: evaluated.length > 0 ? (correct.length / evaluated.length) * 100 : 0,
      currentStreak,
      bestStreak,
      byDirection,
      lastSignalAt,
      lastRetrainedAt: null,
    });
  } catch (err: any) {
    return NextResponse.json({
      totalSignals: 0, evaluated: 0, correct: 0, accuracy: 0,
      currentStreak: 0, bestStreak: 0,
      byDirection: { BUY: { total: 0, correct: 0 }, SELL: { total: 0, correct: 0 } },
      lastSignalAt: null, lastRetrainedAt: null,
      error: err?.message,
    });
  }
}
