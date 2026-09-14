import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchNotification, type NotificationPayload } from "@/lib/presidin/notifications";

export const runtime = "nodejs";

/**
 * Generate and dispatch a daily learning report.
 * Summarizes: signals generated, accuracy, top agents, agent weight changes.
 *
 * POST /api/learning/daily-report
 * Optional body: { dispatch: true } (default true — sends to Telegram + Discord)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shouldDispatch = body.dispatch !== false;

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todaysSignals = await db.signalRecord.findMany({
      where: { createdAt: { gte: dayAgo } },
      orderBy: { createdAt: "desc" },
    });
    const allEvaluated = await db.signalRecord.findMany({
      where: { outcome: { not: null } },
      take: 1000,
    });

    const totalToday = todaysSignals.length;
    const evaluatedToday = todaysSignals.filter((s) => s.outcome !== null);
    const correctToday = evaluatedToday.filter((s) => s.outcome === "win");
    const accuracyToday = evaluatedToday.length > 0
      ? (correctToday.length / evaluatedToday.length) * 100 : 0;

    const buyToday = todaysSignals.filter((s) => s.direction === "BUY");
    const sellToday = todaysSignals.filter((s) => s.direction === "SELL");

    const bySymbol: Record<string, number> = {};
    for (const s of todaysSignals) bySymbol[s.symbol] = (bySymbol[s.symbol] ?? 0) + 1;
    const topSymbols = Object.entries(bySymbol).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sym, count]) => `${sym}: ${count}`);

    const agentStats: Record<string, { votes: number; correct: number }> = {};
    for (const s of allEvaluated) {
      try {
        const votes = JSON.parse(s.votesJson);
        for (const v of votes) {
          if (!agentStats[v.agentId]) agentStats[v.agentId] = { votes: 0, correct: 0 };
          agentStats[v.agentId].votes++;
          if (v.direction === s.direction && s.outcome === "win") agentStats[v.agentId].correct++;
        }
      } catch {}
    }
    const topAgents = Object.entries(agentStats)
      .map(([id, st]) => ({ agent: id, accuracy: st.votes > 0 ? (st.correct / st.votes) * 100 : 0, votes: st.votes }))
      .sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);

    const latestModel = await db.mlModelVersion.findFirst({ orderBy: { trainedAt: "desc" } });

    const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const lines: string[] = [
      `PRESIDIN Daily Report — ${date}`,
      "",
      `Today's Activity:`,
      `  Signals generated: ${totalToday}`,
      `  Evaluated: ${evaluatedToday.length}`,
      `  Correct: ${correctToday.length} (${accuracyToday.toFixed(1)}%)`,
      `  BUY: ${buyToday.length} · SELL: ${sellToday.length}`,
      "",
      `Top Symbols: ${topSymbols.join(", ")}`,
      "",
    ];
    if (topAgents.length > 0) {
      lines.push("Top Agents:");
      topAgents.forEach((a, i) => lines.push(`  ${i + 1}. ${a.agent}: ${a.accuracy.toFixed(0)}% (${a.votes} votes)`));
      lines.push("");
    }
    if (latestModel) {
      lines.push(`Latest Model: v${latestModel.version} · ${latestModel.samples} samples`);
    }

    const reportText = lines.join("\n");
    let dispatched = false;
    if (shouldDispatch) {
      const payload: NotificationPayload = { title: `Daily Report — ${date}`, body: reportText, level: "info", source: "ml" };
      const config: any = { localEnabled: false };
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        config.telegramChatId = process.env.TELEGRAM_CHAT_ID;
      }
      if (process.env.DISCORD_WEBHOOK_URL) config.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
      await dispatchNotification(payload, config);
      dispatched = true;
    }

    return NextResponse.json({ ok: true, report: reportText, dispatched });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
