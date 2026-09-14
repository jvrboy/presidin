import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Execute a trade on Deriv via the buy contract API.
 * Requires DERIV_API_TOKEN in .env (or passed in the request).
 *
 * POST /api/deriv/execute
 * Body: {
 *   symbol: "frxEURUSD",
 *   direction: "BUY" | "SELL",
 *   amount: 1,           // stake in account currency
 *   contractType: "CALL" | "PUT",  // CALL=up/BUY, PUT=down/SELL
 *   duration: 15,        // minutes
 *   durationUnit: "m",
 *   token?: string       // optional override
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol, direction, amount = 1, duration = 15, durationUnit = "m", token: bodyToken,
    } = body;

    if (!symbol || !direction) {
      return NextResponse.json({ error: "symbol and direction required" }, { status: 400 });
    }

    const token = bodyToken || process.env.DERIV_API_TOKEN;
    if (!token) {
      return NextResponse.json({
        error: "DERIV_API_TOKEN not set. Add your Deriv API token in .env or Settings → Brokers.",
        demo: true,
      }, { status: 400 });
    }

    const contractType = direction === "BUY" ? "CALL" : "PUT";

    // Deriv WebSocket API — buy contract
    // We use the REST-like endpoint via WebSocket from the server.
    // Deriv doesn't have a REST API; we need to use WebSocket.
    // For now, return a structured response showing what would be sent.

    // In production, this would open a WebSocket to wss://ws.derivws.com/websockets/v3?app_id=1089
    // and send: { buy: 1, price: amount, parameters: { amount, basis: "stake", contract_type, currency, duration, duration_unit, symbol } }

    return NextResponse.json({
      status: "would_execute",
      message: "Deriv auto-execution requires WebSocket connection from server. This endpoint is ready — wire the Deriv WebSocket client to complete the trade.",
      request: {
        symbol,
        contract_type: contractType,
        amount,
        basis: "stake",
        currency: "USD",
        duration,
        duration_unit: durationUnit,
      },
      tokenMasked: token ? `${token.slice(0, 4)}...${token.slice(-4)}` : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
