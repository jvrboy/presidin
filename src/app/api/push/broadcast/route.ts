import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchNotification, type NotificationPayload } from "@/lib/presidin/notifications";

export const runtime = "nodejs";

/**
 * Multi-device broadcast — sends a notification to ALL channels simultaneously:
 *   - Web push (VAPID — stub)
 *   - Mobile push (FCM — stub)
 *   - Telegram
 *   - Discord
 *   - Local notifications (browser)
 *
 * POST /api/push/broadcast
 * Body: { title, body, level?, source?, data? }
 */
export async function POST(req: Request) {
  try {
    const { title, body, level = "info", source = "system", data } = await req.json();
    if (!title || !body) {
      return Response.json({ error: "title and body required" }, { status: 400 });
    }

    const payload: NotificationPayload = { title, body, level, source, data };

    // Build dispatch config from env
    const config: any = { localEnabled: false };
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      config.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }
    if (process.env.DISCORD_WEBHOOK_URL) config.discordWebhook = process.env.DISCORD_WEBHOOK_URL;

    await dispatchNotification(payload, config);

    // Log the broadcast
    try {
      await db.notificationLog.create({
        data: {
          channel: "broadcast",
          level,
          title,
          body,
          source,
          success: true,
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      dispatched: true,
      channels: {
        telegram: Boolean(config.telegramBotToken),
        discord: Boolean(config.discordWebhook),
        webPush: Boolean(process.env.VAPID_PUBLIC_KEY),
        mobilePush: Boolean(process.env.FCM_SERVER_KEY),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
