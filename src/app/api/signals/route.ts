import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const symbol = url.searchParams.get("symbol");
  const direction = url.searchParams.get("direction");

  try {
    const where: any = {};
    if (symbol) where.symbol = symbol;
    if (direction) where.direction = direction;
    const signals = await db.signalRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });
    return NextResponse.json({ signals });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sig = await db.signalRecord.create({
      data: {
        symbol: body.symbol,
        timeframe: body.timeframe,
        direction: body.direction,
        confidence: body.confidence,
        consensus: body.consensus,
        votesJson: JSON.stringify(body.votes ?? []),
        entryPrice: body.entryPrice,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
        rrRatio: body.rrRatio,
        positionSize: body.positionSize ?? 0,
      },
    });
    return NextResponse.json({ signal: sig });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
