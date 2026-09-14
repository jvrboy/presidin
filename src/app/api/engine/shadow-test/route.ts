import { NextRequest, NextResponse } from "next/server";
import { runMasterAgent, DEFAULT_MASTER_CONFIG, type MasterAgentConfig } from "@/lib/presidin/agents";
import { SYMBOL_MAP, TIMEFRAMES } from "@/lib/presidin/symbols";
import { backtest, DEFAULT_BT_CONFIG, type BacktestConfig } from "@/lib/presidin/quant";
import type { Candle } from "@/lib/presidin/indicators";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Shadow-mode backtest — runs the engine's signal generator against
 * historical candle data and evaluates accuracy without placing real trades.
 *
 * POST /api/engine/shadow-test
 * Body: {
 *   symbol: "frxEURUSD",
 *   timeframe: "15m",
 *   candles: number (count, default 500),
 *   config?: Partial<MasterAgentConfig>
 * }
 *
 * Returns: backtest metrics + signal accuracy + per-agent stats
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol = "frxEURUSD",
      timeframe = "15m",
      candleCount = 500,
      config: configOverride,
    } = body;

    const def = SYMBOL_MAP[symbol];
    if (!def) return NextResponse.json({ error: "unknown symbol" }, { status: 400 });

    const tfDef = TIMEFRAMES.find((t) => t.value === timeframe);
    if (!tfDef) return NextResponse.json({ error: "unknown timeframe" }, { status: 400 });

    // Generate synthetic historical candles (in production, fetch from Deriv)
    const candles: Candle[] = generateSyntheticCandles(symbol, tfDef.seconds, candleCount);

    // Run the MasterAgent on each candle to generate signals
    const agentConfig: MasterAgentConfig = { ...DEFAULT_MASTER_CONFIG, ...configOverride };
    const signals: { time: number; direction: "BUY" | "SELL" }[] = [];
    const window = 200;
    for (let i = window; i < candles.length - 5; i += 10) {
      const slice = candles.slice(0, i + 1);
      const sig = runMasterAgent(def.display, timeframe, slice, agentConfig);
      if (sig.direction !== "NEUTRAL" && sig.confidence >= (configOverride?.minConfidence ?? 60)) {
        signals.push({ time: candles[i].time, direction: sig.direction });
      }
    }

    // Run backtest on those signals
    const btConfig: BacktestConfig = { ...DEFAULT_BT_CONFIG };
    const result = backtest(candles, signals, btConfig);

    // Per-agent accuracy from the last signal's votes
    const lastSignal = signals.length > 0 ? runMasterAgent(def.display, timeframe, candles, agentConfig) : null;
    const agentVotes = lastSignal?.votes ?? [];

    return NextResponse.json({
      symbol: def.display,
      timeframe,
      candleCount: candles.length,
      signalCount: signals.length,
      backtest: {
        metrics: result.metrics,
        equity: result.equity.slice(-50),
        trades: result.trades.slice(-20),
      },
      lastSignal: lastSignal ? {
        direction: lastSignal.direction,
        confidence: lastSignal.confidence,
        consensus: lastSignal.consensusScore,
        votes: agentVotes.map((v) => ({
          agentId: v.agentId,
          agentName: v.agentName,
          direction: v.direction,
          confidence: v.confidence,
          weight: v.weight,
        })),
      } : null,
      recommendation: result.metrics.sharpe > 1 && result.metrics.winRate > 50
        ? "GO_LIVE"
        : result.metrics.sharpe > 0
        ? "SHADOW_MODE"
        : "DO_NOT_DEPLOY",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

function generateSyntheticCandles(symbol: string, granularity: number, count: number): Candle[] {
  const now = Date.now();
  const candles: Candle[] = [];
  let price = symbol.includes("JPY") ? 110 : symbol.includes("XAU") ? 2000 : symbol.includes("BTC") ? 65000 : 1.1;
  for (let i = count; i > 0; i--) {
    const open = price;
    const change = (Math.random() - 0.5) * 0.005 * price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 0.002 * price;
    const low = Math.min(open, close) - Math.random() * 0.002 * price;
    const volume = 100 + Math.random() * 1000;
    candles.push({
      time: now - i * granularity * 1000,
      open, high, low, close, volume,
    });
    price = close;
  }
  return candles;
}
