import { NextResponse } from "next/server";
import { getExecutor } from "@/lib/presidin/deriv-executor";

export const runtime = "nodejs";

/** GET /api/deriv/positions — list open positions */
export async function GET() {
  const executor = await getExecutor();
  if (!executor) {
    return NextResponse.json({ error: "Deriv not connected", positions: [] });
  }
  const positions = await executor.getOpenPositions();
  return NextResponse.json({
    positions,
    count: positions.length,
    balance: executor.currentBalance,
  });
}
