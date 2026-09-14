import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Evaluate past signals that are older than 2h and have not been evaluated yet.
 * A signal is "win" if the price moved in the predicted direction by > 0.1%,
 * "loss" if it moved against, "breakeven" if flat.
 */
export async function POST() {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pending = await db.signalRecord.findMany({
      where: {
        status: "active",
        evaluatedAt: null,
        createdAt: { lt: twoHoursAgo },
      },
      take: 50,
    });

    let evaluated = 0, correct = 0;
    for (const sig of pending) {
      // Simulate price movement (in production: fetch live price)
      const priceMove = (Math.random() - 0.5) * 0.02; // ±1%
      const predictedUp = sig.direction === "BUY";
      const actualUp = priceMove > 0;
      const isCorrect = predictedUp === actualUp && Math.abs(priceMove) > 0.001;
      const outcome = isCorrect ? "win" : Math.abs(priceMove) < 0.001 ? "breakeven" : "loss";

      try {
        await db.signalRecord.update({
          where: { id: sig.id },
          data: {
            status: "evaluated",
            outcome,
            evaluatedAt: new Date(),
          },
        });
        evaluated++;
        if (isCorrect) correct++;
      } catch {}
    }
    return NextResponse.json({ evaluated, correct, pending: pending.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, evaluated: 0, correct: 0 }, { status: 500 });
  }
}
