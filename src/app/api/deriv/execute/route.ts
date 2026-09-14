import { NextRequest, NextResponse } from "next/server";
import { getExecutor } from "@/lib/presidin/deriv-executor";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Execute a real trade on Deriv via WebSocket.
 * Requires DERIV_API_TOKEN in .env.
 *
 * POST /api/deriv/execute
 * Body: {
 *   symbol: "frxEURUSD",
 *   direction: "BUY" | "SELL",
 *   amount: 1,           // stake in USD
 *   duration: 15,
 *   durationUnit: "m",   // s/m/h/d
 *   token?: string       // optional override
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol, direction, amount = 1, duration = 15, durationUnit = "m",
      token: bodyToken,
    } = body;

    if (!symbol || !direction) {
      return NextResponse.json({ error: "symbol and direction required" }, { status: 400 });
    }

    if (direction !== "BUY" && direction !== "SELL") {
      return NextResponse.json({ error: "direction must be BUY or SELL" }, { status: 400 });
    }

    const executor = await getExecutor(bodyToken);
    if (!executor) {
      return NextResponse.json({
        error: "Deriv executor unavailable. Add DERIV_API_TOKEN to .env or Settings → Brokers.",
        demo: true,
      }, { status: 400 });
    }

    const result = await executor.buy({ symbol, direction, amount, duration, durationUnit });

    // Persist the trade to the database
    if (result.ok && result.contractId) {
      try {
        await db.trade.create({
          data: {
            symbol,
            broker: "deriv",
            direction,
            quantity: amount,
            entryPrice: result.buyPrice ?? 0,
            entryTime: new Date(),
            status: "open",
            notes: `Deriv contract ${result.contractId} · payout ${result.payout ?? "?"} · ${duration}${durationUnit}`,
          },
        });
      } catch {}
    }

    // Log the result
    try {
      await db.botLog.create({
        data: {
          level: result.ok ? "info" : "error",
          source: "deriv-execute",
          message: `${direction} ${symbol} ${amount} USD ${duration}${durationUnit} → ${result.ok ? "ok" : "FAILED"}`,
          data: JSON.stringify({ ...result, symbol, direction, amount }),
        },
      });
    } catch {}

    return NextResponse.json({
      ...result,
      symbol,
      direction,
      amount,
      duration,
      durationUnit,
      balance: executor.currentBalance,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

/**
 * GET — check Deriv connection status + balance
 */
export async function GET() {
  const token = process.env.DERIV_API_TOKEN;
  if (!token) {
    return NextResponse.json({
      connected: false,
      reason: "DERIV_API_TOKEN not set",
      demo: true,
    });
  }
  const executor = await getExecutor();
  if (!executor) {
    return NextResponse.json({
      connected: false,
      reason: "Failed to connect / authorize",
      tokenMasked: `${token.slice(0, 4)}...${token.slice(-4)}`,
    });
  }
  const balance = await executor.getBalance();
  const positions = await executor.getOpenPositions();
  return NextResponse.json({
    connected: true,
    authorized: executor.isAuthorized,
    balance,
    openPositions: positions.length,
    tokenMasked: `${token.slice(0, 4)}...${token.slice(-4)}`,
  });
}
