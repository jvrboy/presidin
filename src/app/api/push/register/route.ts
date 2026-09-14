import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Register a device for push notifications.
 * POST /api/push/register
 * Body: { token: string, platform: "web" | "ios" | "android" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, platform = "web" } = body;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    // Log the registration (in production, save to a DeviceToken table)
    try {
      await db.botLog.create({
        data: {
          level: "info",
          source: "push",
          message: `Device registered for push (${platform})`,
          data: JSON.stringify({ token: token.slice(0, 16) + "...", platform }),
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, platform, tokenMasked: `${token.slice(0, 8)}...` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
