// Admin alert helper — records alerts to DB and broadcasts to Telegram.
import { createClient } from "@supabase/supabase-js";

export interface AlertInput {
  severity?: "info" | "warn" | "error" | "critical";
  kind: string;
  message: string;
  context?: Record<string, unknown>;
}

function sb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function broadcastTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const { data: subs } = await sb()
      .from("telegram_subscribers")
      .select("chat_id")
      .eq("active", true);
    await Promise.all(
      (subs || []).map((s: any) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: s.chat_id, text }),
        }).catch(() => null),
      ),
    );
  } catch {
    /* ignore */
  }
}

export async function raiseAlert(a: AlertInput) {
  const severity = a.severity ?? "warn";
  try {
    await sb()
      .from("admin_alerts")
      .insert({
        severity,
        kind: a.kind,
        message: a.message,
        context: (a.context ?? {}) as any,
      });
  } catch (err) {
    console.error("[alerts] insert failed", err);
  }
  if (severity === "error" || severity === "critical" || severity === "warn") {
    const prefix =
      severity === "critical" ? "[CRITICAL]" : severity === "error" ? "[ERROR]" : "[WARN]";
    const ctx = a.context ? "\n" + JSON.stringify(a.context).slice(0, 400) : "";
    await broadcastTelegram(`${prefix} ${a.kind}\n${a.message}${ctx}`);
  }
}
