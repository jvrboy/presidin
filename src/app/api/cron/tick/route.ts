import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Cron tick — called by Cloudflare Worker every 60s to keep PRESIDIN alive.
 * Protected by X-Presidin-Secret header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-presidin-secret");
  const expected = process.env.PRESIDIN_CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // 1. Log the tick
    await db.botLog.create({
      data: {
        level: "info",
        source: "cron",
        message: "Cron tick received",
        data: JSON.stringify({ ts: Date.now() }),
      },
    }).catch(() => {});

    // 2. Sweep expired signals (older than 1 hour, mark as expired)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Note: schema has updatedAt; we'd need a createdAt or expiresAt column
    // For now just log
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      tasks: ["tick-logged", "ready-for-signal-scan"],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cron/tick",
    method: "POST",
    description: "Heartbeat endpoint — call every 60s from Cloudflare Worker",
    requiredHeaders: process.env.PRESIDIN_CRON_SECRET ? ["X-Presidin-Secret"] : [],
  });
}
