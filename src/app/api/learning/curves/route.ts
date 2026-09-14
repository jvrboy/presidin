import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Per-symbol learning curves — daily accuracy + signal count over time.
 * Returns time series for charting.
 */
export async function GET() {
  try {
    const all = await db.signalRecord.findMany({
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    // Group by day + symbol
    const byDaySymbol: Record<string, Record<string, { total: number; correct: number }>> = {};
    for (const s of all) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!byDaySymbol[day]) byDaySymbol[day] = {};
      if (!byDaySymbol[day][s.symbol]) byDaySymbol[day][s.symbol] = { total: 0, correct: 0 };
      byDaySymbol[day][s.symbol].total++;
      if (s.outcome === "win") byDaySymbol[day][s.symbol].correct++;
    }

    // Build per-symbol time series
    const symbols = new Set<string>();
    for (const day of Object.keys(byDaySymbol)) {
      for (const sym of Object.keys(byDaySymbol[day])) symbols.add(sym);
    }

    const series: Record<string, { day: string; accuracy: number; total: number; correct: number }[]> = {};
    for (const sym of symbols) {
      series[sym] = [];
      for (const day of Object.keys(byDaySymbol).sort()) {
        const d = byDaySymbol[day][sym];
        if (d) {
          series[sym].push({
            day,
            accuracy: d.total > 0 ? (d.correct / d.total) * 100 : 0,
            total: d.total,
            correct: d.correct,
          });
        }
      }
    }

    // Overall curve (all symbols combined)
    const overall: { day: string; accuracy: number; total: number; correct: number }[] = [];
    for (const day of Object.keys(byDaySymbol).sort()) {
      let total = 0, correct = 0;
      for (const sym of Object.keys(byDaySymbol[day])) {
        total += byDaySymbol[day][sym].total;
        correct += byDaySymbol[day][sym].correct;
      }
      overall.push({ day, accuracy: total > 0 ? (correct / total) * 100 : 0, total, correct });
    }

    return NextResponse.json({
      symbols: Array.from(symbols),
      series,
      overall,
      totalSignals: all.length,
      days: Object.keys(byDaySymbol).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, symbols: [], series: {}, overall: [] }, { status: 500 });
  }
}
