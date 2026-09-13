import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { recordWebhookEvent, clientIp, headerSnapshot } from "@/lib/api/audit";

const tg = (token: string, method: string, body: any) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const endpoint = new URL(request.url).pathname;
        const ip = clientIp(request);
        const headers = headerSnapshot(request);
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
        const providedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
        const signatureValid = expectedSecret ? expectedSecret === providedSecret : true;

        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          await recordWebhookEvent({
            source: "telegram",
            endpoint,
            ip,
            signatureValid,
            statusCode: 500,
            payload: {},
            headers,
            error: "TELEGRAM_BOT_TOKEN not configured",
          });
          return new Response("not configured", { status: 500 });
        }

        const raw = await request.text();
        let update: any = {};
        try {
          update = JSON.parse(raw);
        } catch {}

        if (!signatureValid) {
          await recordWebhookEvent({
            source: "telegram",
            endpoint,
            ip,
            signatureValid: false,
            statusCode: 401,
            payload: update,
            headers,
            error: "Telegram secret token mismatch",
          });
          return new Response("unauthorized", { status: 401 });
        }

        const msg = update.message ?? update.edited_message;
        if (!msg?.chat?.id) {
          await recordWebhookEvent({
            source: "telegram",
            endpoint,
            ip,
            signatureValid,
            statusCode: 200,
            payload: update,
            headers,
          });
          return Response.json({ ok: true });
        }

        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const chatId = msg.chat.id as number;
        const text = (msg.text || "").trim();
        const username = msg.from?.username;

        if (text.startsWith("/start")) {
          await sb
            .from("telegram_subscribers")
            .upsert({ chat_id: chatId, username, active: true }, { onConflict: "chat_id" });
          await tg(token, "sendMessage", {
            chat_id: chatId,
            text:
              "Welcome to DivergenceIQ!\n\n" +
              "You're subscribed. You'll receive auto-generated forex signals based on multi-indicator divergence + confluence analysis.\n\n" +
              "Commands:\n" +
              "/signals — latest signals\n" +
              "/elite — only score 80+\n" +
              "/stop — pause alerts\n" +
              "/start — resume alerts",
          });
        } else if (text.startsWith("/stop")) {
          await sb.from("telegram_subscribers").update({ active: false }).eq("chat_id", chatId);
          await tg(token, "sendMessage", {
            chat_id: chatId,
            text: "Alerts paused. Send /start to resume.",
          });
        } else if (text.startsWith("/signals") || text.startsWith("/elite")) {
          const minScore = text.startsWith("/elite") ? 80 : 0;
          const { data } = await sb
            .from("signals")
            .select("*")
            .gte("score", minScore)
            .order("created_at", { ascending: false })
            .limit(5);
          if (!data || data.length === 0) {
            await tg(token, "sendMessage", {
              chat_id: chatId,
              text: "No signals yet. Run a scan from the dashboard.",
            });
          } else {
            const lines = data.map((s: any) => {
              const pair = s.pair.replace(/^frx/, "").replace(/(.{3})(.{3})/, "$1/$2");
              const arrow = s.direction === "BUY" ? "🟢" : "🔴";
              return `${arrow} ${pair} ${s.timeframe} • ${s.direction} • ${s.score}/100 (${s.rating})`;
            });
            await tg(token, "sendMessage", {
              chat_id: chatId,
              text: "Latest signals:\n\n" + lines.join("\n"),
            });
          }
        } else {
          await tg(token, "sendMessage", {
            chat_id: chatId,
            text: "Commands: /start /stop /signals /elite",
          });
        }

        await recordWebhookEvent({
          source: "telegram",
          endpoint,
          ip,
          signatureValid,
          statusCode: 200,
          payload: { chat_id: chatId, text },
          headers,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
