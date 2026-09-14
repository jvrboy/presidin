import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const open = await db.trade.count({ where: { status: "open" } });
    const closed = await db.trade.count({ where: { status: "closed" } });
    const signals = await db.signalRecord.count();
    const logs = await db.botLog.count();
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      stats: { openTrades: open, closedTrades: closed, signals, logs },
      services: {
        marketData: "deriv-public",
        database: "sqlite",
        ai: "zai",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "degraded", error: err?.message },
      { status: 200 }
    );
  }
}
