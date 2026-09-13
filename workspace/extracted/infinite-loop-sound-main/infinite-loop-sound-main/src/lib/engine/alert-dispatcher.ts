// Alert dispatcher — sends formatted messages to user-configured destinations
// (Telegram, webhook, in-app). Pure dispatch; the calling code decides what
// constitutes an "alert worth firing". Each destination is independent so a
// failure in one (e.g. Telegram down) doesn't block the others.

export type Channel = "telegram" | "webhook" | "in-app" | "console";

export interface DispatchTarget {
  channel: Channel;
  /** Telegram bot token (only for channel="telegram") */
  botToken?: string;
  /** Telegram chat id (only for channel="telegram") */
  chatId?: string;
  /** Webhook URL (only for channel="webhook") */
  url?: string;
  /** Optional secret to include as `Authorization: Bearer ...` */
  secret?: string;
}

export interface DispatchResult {
  channel: Channel;
  ok: boolean;
  status?: number;
  error?: string;
  ts: number;
}

export interface AlertPayload {
  title: string;
  body: string;
  level?: "info" | "warning" | "critical";
  meta?: Record<string, unknown>;
}

async function sendTelegram(t: DispatchTarget, p: AlertPayload): Promise<DispatchResult> {
  if (!t.botToken || !t.chatId) {
    return { channel: "telegram", ok: false, error: "missing botToken or chatId", ts: Date.now() };
  }
  const text = `*${p.title}*\n${p.body}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: t.chatId, text, parse_mode: "Markdown" }),
    });
    return { channel: "telegram", ok: res.ok, status: res.status, ts: Date.now() };
  } catch (e: any) {
    return { channel: "telegram", ok: false, error: e?.message || String(e), ts: Date.now() };
  }
}

async function sendWebhook(t: DispatchTarget, p: AlertPayload): Promise<DispatchResult> {
  if (!t.url) return { channel: "webhook", ok: false, error: "missing url", ts: Date.now() };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (t.secret) headers.Authorization = `Bearer ${t.secret}`;
    const res = await fetch(t.url, { method: "POST", headers, body: JSON.stringify(p) });
    return { channel: "webhook", ok: res.ok, status: res.status, ts: Date.now() };
  } catch (e: any) {
    return { channel: "webhook", ok: false, error: e?.message || String(e), ts: Date.now() };
  }
}

function sendInApp(_t: DispatchTarget, p: AlertPayload): DispatchResult {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("diq:alert", { detail: p }));
    } catch {
      /* ignore */
    }
  }
  return { channel: "in-app", ok: true, ts: Date.now() };
}

function sendConsole(_t: DispatchTarget, p: AlertPayload): DispatchResult {
  console.info(`[ALERT ${p.level ?? "info"}] ${p.title} — ${p.body}`);
  return { channel: "console", ok: true, ts: Date.now() };
}

/** Fire-and-collect: dispatches to every target in parallel, returns results. */
export async function dispatchAlert(
  targets: DispatchTarget[],
  payload: AlertPayload,
): Promise<DispatchResult[]> {
  return Promise.all(
    targets.map((t) => {
      switch (t.channel) {
        case "telegram":
          return sendTelegram(t, payload);
        case "webhook":
          return sendWebhook(t, payload);
        case "in-app":
          return Promise.resolve(sendInApp(t, payload));
        case "console":
          return Promise.resolve(sendConsole(t, payload));
        default:
          return Promise.resolve({
            channel: t.channel,
            ok: false,
            error: `unknown channel: ${String(t.channel)}`,
            ts: Date.now(),
          });
      }
    }),
  );
}
