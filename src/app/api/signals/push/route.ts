import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchNotification, type NotificationPayload } from "@/lib/presidin/notifications";

export const runtime = "nodejs";

/**
 * Push a signal to all configured notification channels (Telegram + Discord + local push).
 * Called automatically when the engine generates a high-confidence signal.
 *
 * POST /api/signals/push
 * Body: { signal: Signal }
 */
export async function POST(req: NextRequest) {
  try {
    const { signal } = await req.json();
    if (!signal) return NextResponse.json({ error: "signal required" }, { status: 400 });

    const payload: NotificationPayload = {
      title: `${signal.direction} ${signal.symbol} · ${signal.confidence.toFixed(0)}% confidence`,
      body: `Entry ${signal.suggestedEntry?.toFixed(4) ?? "?"} · SL ${signal.suggestedStopLoss?.toFixed(4) ?? "?"} · TP ${signal.suggestedTakeProfit?.toFixed(4) ?? "?"} · R:R 1:${signal.riskRewardRatio?.toFixed(1) ?? "?"}`,
      level: signal.confidence > 85 ? "success" : "info",
      source: "signal",
      data: signal,
    };

    // Dispatch to Telegram + Discord (server-side env vars)
    const tgBot = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    const dcWh = process.env.DISCORD_WEBHOOK_URL;
    const config: any = { localEnabled: false };
    if (tgBot && tgChat) { config.telegramBotToken = tgBot; config.telegramChatId = tgChat; }
    if (dcWh) { config.discordWebhook = dcWh; }

    await dispatchNotification(payload, config);

    // Log the dispatch
    try {
      await db.notificationLog.create({
        data: {
          channel: "telegram+discord",
          level: payload.level,
          title: payload.title,
          body: payload.body,
          source: "signal",
          success: true,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, dispatched: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
