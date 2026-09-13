/**
 * PRESIDIN — Notifications dispatcher
 * Telegram + Discord + local toast + browser Notification API.
 */

export interface NotificationPayload {
  title: string;
  body: string;
  level: "info" | "success" | "warning" | "error";
  source: "signal" | "trade" | "ml" | "anomaly" | "system";
  data?: Record<string, any>;
}

export async function sendTelegram(
  botToken: string,
  chatId: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const emoji =
      payload.level === "success" ? "✅"
      : payload.level === "warning" ? "⚠️"
      : payload.level === "error" ? "❌"
      : "ℹ️";
    const text = `${emoji} *PRESIDIN — ${payload.title}*\n\n${payload.body}\n\n_Source: ${payload.source}_`;
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendDiscord(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const color =
      payload.level === "success" ? 0x10b981
      : payload.level === "warning" ? 0xf59e0b
      : payload.level === "error" ? 0xef4444
      : 0x6366f1;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `PRESIDIN — ${payload.title}`,
          description: payload.body,
          color,
          footer: { text: `Source: ${payload.source}` },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function sendLocal(payload: NotificationPayload): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(`PRESIDIN — ${payload.title}`, { body: payload.body });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") {
        new Notification(`PRESIDIN — ${payload.title}`, { body: payload.body });
      }
    });
  }
}

export async function dispatchNotification(
  payload: NotificationPayload,
  config: {
    telegramBotToken?: string;
    telegramChatId?: string;
    discordWebhook?: string;
    localEnabled: boolean;
  }
): Promise<void> {
  const tasks: Promise<boolean>[] = [];
  if (config.telegramBotToken && config.telegramChatId) {
    tasks.push(sendTelegram(config.telegramBotToken, config.telegramChatId, payload));
  }
  if (config.discordWebhook) {
    tasks.push(sendDiscord(config.discordWebhook, payload));
  }
  if (config.localEnabled) {
    sendLocal(payload);
  }
  await Promise.allSettled(tasks);
}

export function requestNotificationPermission(): void {
  if (typeof window !== "undefined" && "Notification" in window) {
    Notification.requestPermission();
  }
}
