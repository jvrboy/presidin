import { NextRequest, NextResponse } from "next/server";
import { getExecutor } from "@/lib/presidin/deriv-executor";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/deriv/close
 * Body: { contractId: string, symbol?: string }
 * Closes an open Deriv position at market.
 */
export async function POST(req: NextRequest) {
  try {
    const { contractId, symbol } = await req.json();
    if (!contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });
    const executor = await getExecutor();
    if (!executor) return NextResponse.json({ error: "Deriv not connected" }, { status: 400 });
    const ok = await executor.closePosition(contractId);
    if (ok && symbol) {
      try {
        await db.trade.updateMany({
          where: { notes: { contains: contractId }, status: "open" },
          data: { status: "closed", exitTime: new Date() },
        });
      } catch {}
    }
    return NextResponse.json({ ok, contractId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
