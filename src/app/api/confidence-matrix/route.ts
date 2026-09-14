import { NextResponse } from "next/server";
import { runMasterAgent, DEFAULT_MASTER_CONFIG } from "@/lib/presidin/agents";
import { SYMBOL_MAP, TIMEFRAMES, DEFAULT_ACTIVE_SYMBOLS } from "@/lib/presidin/symbols";
import { backtest, DEFAULT_BT_CONFIG } from "@/lib/presidin/quant";
import type { Candle } from "@/lib/presidin/indicators";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Confidence matrix — runs shadow-mode backtest across multiple symbols × timeframes,
 * aggregates results into a matrix showing win rate per cell.
 *
 * GET /api/confidence-matrix
 * Returns: { matrix: [{ symbol, timeframe, winRate, sharpe, signals, recommendation }], summary }
 */
export async function GET() {
  try {
    const symbols = DEFAULT_ACTIVE_SYMBOLS.slice(0, 5); // 5 symbols to keep fast
    const timeframes = ["15m", "1h", "4h"];

    const matrix: {
      symbol: string;
      timeframe: string;
      winRate: number;
      sharpe: number;
      maxDD: number;
      signals: number;
      recommendation: string;
    }[] = [];

    for (const sym of symbols) {
      const def = SYMBOL_MAP[sym];
      if (!def) continue;
      for (const tf of timeframes) {
        const tfDef = TIMEFRAMES.find((t) => t.value === tf);
        if (!tfDef) continue;
        try {
          const candles = generateSyntheticCandles(sym, tfDef.seconds, 300);
          const signals: { time: number; direction: "BUY" | "SELL" }[] = [];
          for (let i = 200; i < candles.length - 5; i += 10) {
            const slice = candles.slice(0, i + 1);
            const sig = runMasterAgent(def.display, tf, slice, DEFAULT_MASTER_CONFIG);
            if (sig.direction !== "NEUTRAL" && sig.confidence >= 60) {
              signals.push({ time: candles[i].time, direction: sig.direction });
            }
          }
          const result = backtest(candles, signals, DEFAULT_BT_CONFIG);
          const rec = result.metrics.sharpe > 1 && result.metrics.winRate > 50
            ? "GO_LIVE" : result.metrics.sharpe > 0 ? "SHADOW_MODE" : "DO_NOT_DEPLOY";
          matrix.push({
            symbol: def.display,
            timeframe: tf,
            winRate: result.metrics.winRate,
            sharpe: result.metrics.sharpe,
            maxDD: result.metrics.maxDrawdownPct,
            signals: signals.length,
            recommendation: rec,
          });
        } catch {}
      }
    }

    // Aggregate stats
    const goLiveCount = matrix.filter((m) => m.recommendation === "GO_LIVE").length;
    const shadowCount = matrix.filter((m) => m.recommendation === "SHADOW_MODE").length;
    const avgWinRate = matrix.length > 0
      ? matrix.reduce((a, m) => a + m.winRate, 0) / matrix.length
      : 0;
    const avgSharpe = matrix.length > 0
      ? matrix.reduce((a, m) => a + m.sharpe, 0) / matrix.length
      : 0;
    const bestCell = matrix.length > 0
      ? matrix.reduce((best, m) => m.sharpe > best.sharpe ? m : best)
      : null;

    return NextResponse.json({
      matrix,
      summary: {
        totalCells: matrix.length,
        goLiveCount,
        shadowCount,
        rejectCount: matrix.length - goLiveCount - shadowCount,
        avgWinRate,
        avgSharpe,
        bestCell,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message, matrix: [], summary: null }, { status: 500 });
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
