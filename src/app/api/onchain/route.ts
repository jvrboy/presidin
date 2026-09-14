import { NextRequest, NextResponse } from "next/server";
import { getOnChainMetrics } from "@/lib/presidin/tools";
import { SYMBOL_MAP } from "@/lib/presidin/symbols";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") || "cryBTCUSD";
  try {
    const metrics = getOnChainMetrics(symbol);
    return NextResponse.json({ metrics, symbol, display: SYMBOL_MAP[symbol]?.display ?? symbol });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
