import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchNotification, type NotificationPayload } from "@/lib/presidin/notifications";

export const runtime = "nodejs";

/**
 * Weekly performance review — aggregates the last 7 days of signals + trades,
 * generates a comprehensive report, and dispatches to Telegram + Discord.
 *
 * POST /api/learning/weekly-report
 * Optional body: { dispatch: true }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const shouldDispatch = body.dispatch !== false;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekSignals = await db.signalRecord.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
    });
    const weekTrades = await db.trade.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
    });

    const evaluatedSignals = weekSignals.filter((s) => s.outcome !== null);
    const wins = evaluatedSignals.filter((s) => s.outcome === "win");
    const losses = evaluatedSignals.filter((s) => s.outcome === "loss");
    const accuracy = evaluatedSignals.length > 0 ? (wins.length / evaluatedSignals.length) * 100 : 0;

    const closedTrades = weekTrades.filter((t) => t.status === "closed");
    const totalPnl = closedTrades.reduce((a, t) => a + (t.pnl ?? 0), 0);
    const bestTrade = closedTrades.reduce((b, t) => (t.pnl ?? 0) > (b?.pnl ?? -Infinity) ? t : b, null as any);
    const worstTrade = closedTrades.reduce((w, t) => (t.pnl ?? 0) < (w?.pnl ?? Infinity) ? t : w, null as any);

    const buyCount = weekSignals.filter((s) => s.direction === "BUY").length;
    const sellCount = weekSignals.filter((s) => s.direction === "SELL").length;

    // Per-symbol stats
    const bySymbol: Record<string, { total: number; correct: number }> = {};
    for (const s of evaluatedSignals) {
      if (!bySymbol[s.symbol]) bySymbol[s.symbol] = { total: 0, correct: 0 };
      bySymbol[s.symbol].total++;
      if (s.outcome === "win") bySymbol[s.symbol].correct++;
    }
    const topSymbols = Object.entries(bySymbol)
      .map(([sym, st]) => ({ sym, acc: st.total > 0 ? (st.correct / st.total) * 100 : 0, total: st.total }))
      .sort((a, b) => b.acc - a.acc)
      .slice(0, 5);

    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
    const weekEnd = new Date().toLocaleDateString();
    const lines: string[] = [
      `PRESIDIN Weekly Review (${weekStart} — ${weekEnd})`,
      "",
      `Signals: ${weekSignals.length} total · ${buyCount} BUY · ${sellCount} SELL`,
      `Evaluated: ${evaluatedSignals.length} · Wins: ${wins.length} · Losses: ${losses.length}`,
      `Accuracy: ${accuracy.toFixed(1)}%`,
      "",
      `Trades: ${weekTrades.length} total · ${closedTrades.length} closed`,
      `Net P&L: $${totalPnl.toFixed(2)}`,
      bestTrade ? `Best: ${bestTrade.symbol} +$${(bestTrade.pnl ?? 0).toFixed(2)}` : "",
      worstTrade ? `Worst: ${worstTrade.symbol} -$${Math.abs(worstTrade.pnl ?? 0).toFixed(2)}` : "",
      "",
      "Top Symbols by Accuracy:",
      ...topSymbols.map((s, i) => `  ${i + 1}. ${s.sym}: ${s.acc.toFixed(0)}% (${s.total} signals)`),
    ].filter(Boolean);

    const report = lines.join("\n");

    if (shouldDispatch) {
      const payload: NotificationPayload = {
        title: `Weekly Review (${weekStart} — ${weekEnd})`,
        body: report,
        level: accuracy > 55 ? "success" : "info",
        source: "ml",
      };
      const config: any = { localEnabled: false };
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        config.telegramChatId = process.env.TELEGRAM_CHAT_ID;
      }
      if (process.env.DISCORD_WEBHOOK_URL) config.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
      await dispatchNotification(payload, config);
    }

    return NextResponse.json({
      ok: true,
      report,
      stats: {
        weekRange: `${weekStart} — ${weekEnd}`,
        totalSignals: weekSignals.length,
        evaluated: evaluatedSignals.length,
        wins: wins.length,
        losses: losses.length,
        accuracy,
        buyCount,
        sellCount,
        totalTrades: weekTrades.length,
        closedTrades: closedTrades.length,
        totalPnl,
        bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnl: bestTrade.pnl } : null,
        worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnl: worstTrade.pnl } : null,
        topSymbols,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
