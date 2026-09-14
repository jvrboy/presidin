import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Walk-forward regime detection — analyzes signal accuracy on a rolling 30-day
 * window per symbol, detects when a symbol's regime shifts (trending vs ranging
 * vs volatile). Returns per-symbol regime classification + trend.
 *
 * GET /api/regime
 */
export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = await db.signalRecord.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    // Group by symbol + 5-day windows
    const bySymbol: Record<string, any[]> = {};
    for (const s of recent) {
      if (!bySymbol[s.symbol]) bySymbol[s.symbol] = [];
      bySymbol[s.symbol].push(s);
    }

    const regimes: {
      symbol: string;
      regime: "TRENDING" | "RANGING" | "VOLATILE" | "TRANSITIONING" | "INSUFFICIENT";
      accuracy: number;
      signalCount: number;
      trend: "improving" | "declining" | "stable";
      recommendation: string;
      windows: { windowEnd: string; accuracy: number; count: number }[];
    }[] = [];

    for (const [symbol, sigs] of Object.entries(bySymbol)) {
      const evaluated = sigs.filter((s) => s.outcome !== null);
      if (evaluated.length < 10) {
        regimes.push({
          symbol,
          regime: "INSUFFICIENT",
          accuracy: 0,
          signalCount: sigs.length,
          trend: "stable",
          recommendation: "Need more data",
          windows: [],
        });
        continue;
      }

      // Split into 5-day windows
      const windows: { windowEnd: string; accuracy: number; count: number }[] = [];
      const dayMs = 24 * 60 * 60 * 1000;
      for (let w = 0; w < 6; w++) {
        const wStart = Date.now() - (6 - w) * 5 * dayMs;
        const wEnd = wStart + 5 * dayMs;
        const wSigs = evaluated.filter((s) => {
          const t = s.createdAt.getTime();
          return t >= wStart && t < wEnd;
        });
        if (wSigs.length > 0) {
          const correct = wSigs.filter((s) => s.outcome === "win").length;
          windows.push({
            windowEnd: new Date(wEnd).toISOString().slice(0, 10),
            accuracy: (correct / wSigs.length) * 100,
            count: wSigs.length,
          });
        }
      }

      // Overall accuracy
      const correct = evaluated.filter((s) => s.outcome === "win").length;
      const accuracy = (correct / evaluated.length) * 100;

      // Determine regime from accuracy variance + BUY/SELL distribution
      const buyCount = evaluated.filter((s) => s.direction === "BUY").length;
      const sellCount = evaluated.filter((s) => s.direction === "SELL").length;
      const directionalBias = Math.abs(buyCount - sellCount) / evaluated.length;

      // Compute accuracy variance across windows
      const accs = windows.map((w) => w.accuracy);
      const meanAcc = accs.reduce((a, b) => a + b, 0) / (accs.length || 1);
      const variance = accs.reduce((a, b) => a + (b - meanAcc) ** 2, 0) / (accs.length || 1);
      const stddev = Math.sqrt(variance);

      let regime: "TRENDING" | "RANGING" | "VOLATILE" | "TRANSITIONING";
      if (stddev > 25) {
        regime = "TRANSITIONING";
      } else if (directionalBias > 0.65) {
        regime = "TRENDING";
      } else if (accuracy > 60 && stddev < 10) {
        regime = "TRENDING";
      } else if (accuracy < 45 && directionalBias < 0.3) {
        regime = "VOLATILE";
      } else {
        regime = "RANGING";
      }

      // Trend: compare last 2 windows
      let trend: "improving" | "declining" | "stable" = "stable";
      if (windows.length >= 2) {
        const recent = windows[windows.length - 1].accuracy;
        const older = windows[windows.length - 2].accuracy;
        if (recent > older + 10) trend = "improving";
        else if (recent < older - 10) trend = "declining";
      }

      const recommendation =
        regime === "TRENDING" && accuracy > 55 ? "Increase position size — trending regime favors momentum agents"
        : regime === "RANGING" ? "Reduce position size — ranging regime favors mean-reversion agents"
        : regime === "VOLATILE" ? "Pause auto-execution — high volatility, signals unreliable"
        : regime === "TRANSITIONING" ? "Wait for regime to stabilize before increasing exposure"
        : "Monitor";

      regimes.push({
        symbol,
        regime,
        accuracy,
        signalCount: sigs.length,
        trend,
        recommendation,
        windows,
      });
    }

    return NextResponse.json({ regimes, totalSymbols: regimes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, regimes: [] }, { status: 500 });
  }
}
