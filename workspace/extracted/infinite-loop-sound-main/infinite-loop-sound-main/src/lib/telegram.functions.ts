import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const tgFetch = async (method: string, body: any) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
};

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const SignalSchema = z.object({
  pair: z.string(),
  timeframe: z.string(),
  direction: z.enum(["BUY", "SELL"]),
  entry: z.number(),
  sl: z.number(),
  tp1: z.number(),
  tp2: z.number(),
  tp3: z.number(),
  score: z.number(),
  rating: z.string(),
  confluence: z.array(z.object({ label: z.string(), passed: z.boolean(), pts: z.number() })),
});

// Adaptive precision: forex needs 5 decimals, crypto/indices/stocks need fewer.
const fmt = (n: number) => {
  const v = Math.abs(Number(n));
  const d = v >= 1000 ? 2 : v >= 100 ? 3 : v >= 10 ? 4 : 5;
  return Number(n).toFixed(d);
};

// Pretty display for any asset symbol (forex frxEURUSD → EUR/USD, others → strip prefix).
const displaySymbol = (sym: string): string => {
  if (sym.startsWith("frx")) return sym.slice(3).replace(/(.{3})(.{3})/, "$1/$2");
  if (sym.startsWith("cry")) return sym.slice(3).replace(/(.{3})(.{3})/, "$1/$2");
  if (sym.startsWith("OTC_")) return sym.slice(4);
  return sym;
};

// Build a QuickChart.io URL (free, no key) showing recent price candles + entry/SL/TPs.
// candles: array of {epoch,close} (we use closes as a fast line). Levels overlaid via annotations.
const buildSnapshotUrl = (s: any, closes?: number[]) => {
  const data = (closes && closes.length ? closes : [s.entry]).slice(-60);
  const labels = data.map((_, i) => i);
  const color = s.direction === "BUY" ? "#10b981" : "#ef4444";
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: color,
          backgroundColor: color + "22",
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `${displaySymbol(s.pair)} ${s.timeframe} • ${s.direction} • ${s.score}/100`,
          color: "#e5e7eb",
        },
        legend: { display: false },
        annotation: {
          annotations: {
            entry: {
              type: "line",
              yMin: s.entry,
              yMax: s.entry,
              borderColor: "#94a3b8",
              borderWidth: 1,
              borderDash: [4, 4],
              label: { content: "ENTRY", display: true, color: "#fff", backgroundColor: "#475569" },
            },
            sl: {
              type: "line",
              yMin: s.sl,
              yMax: s.sl,
              borderColor: "#ef4444",
              borderWidth: 1,
              label: { content: "SL", display: true, color: "#fff", backgroundColor: "#ef4444" },
            },
            tp1: {
              type: "line",
              yMin: s.tp1,
              yMax: s.tp1,
              borderColor: "#10b981",
              borderWidth: 1,
              label: { content: "TP1", display: true, color: "#fff", backgroundColor: "#10b981" },
            },
            tp2: {
              type: "line",
              yMin: s.tp2,
              yMax: s.tp2,
              borderColor: "#10b981",
              borderWidth: 1,
              borderDash: [3, 3],
              label: { content: "TP2", display: true, color: "#fff", backgroundColor: "#10b981" },
            },
            tp3: {
              type: "line",
              yMin: s.tp3,
              yMax: s.tp3,
              borderColor: "#10b981",
              borderWidth: 1,
              borderDash: [2, 4],
              label: { content: "TP3", display: true, color: "#fff", backgroundColor: "#10b981" },
            },
          },
        },
      },
      scales: {
        x: { display: false },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } },
      },
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?w=720&h=400&bkg=%230f172a&c=${encoded}`;
};

const buildMessage = (s: z.infer<typeof SignalSchema>) => {
  const dir = s.direction === "BUY" ? "BUY" : "SELL";
  const badge =
    s.rating === "ELITE"
      ? "ELITE SIGNAL"
      : s.rating === "STRONG"
        ? "STRONG SIGNAL"
        : s.rating === "MEDIUM"
          ? "MEDIUM SETUP"
          : "WEAK";
  const confLines = s.confluence
    .filter((c) => c.passed)
    .map((c) => `▪ ${c.label}`)
    .join("\n");
  const pair = displaySymbol(s.pair);
  return [
    "━━━━━━━━━━━━━━━━━━━━",
    `${badge} - DivergenceIQ`,
    "━━━━━━━━━━━━━━━━━━━━",
    `[${pair} | ${s.timeframe}]`,
    `${dir}`,
    "",
    "Trade Levels:",
    `Entry: ${fmt(s.entry)}`,
    `SL:    ${fmt(s.sl)}`,
    `TP1:   ${fmt(s.tp1)}`,
    `TP2:   ${fmt(s.tp2)}`,
    `TP3:   ${fmt(s.tp3)}`,
    "",
    `Score: ${s.score}/100`,
    "",
    "Confluence:",
    confLines || "-",
    "",
    "Not financial advice.",
  ].join("\n");
};

export const sendSignalToTelegram = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        signalId: z.string().uuid().optional(),
        signal: SignalSchema,
        closes: z.array(z.number()).optional(),
        withChart: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: subs, error } = await sb
      .from("telegram_subscribers")
      .select("chat_id, min_score")
      .eq("active", true);
    if (error) throw new Error(error.message);
    const text = buildMessage(data.signal);
    const targets = (subs || []).filter((s: any) => data.signal.score >= s.min_score);
    const photoUrl = data.withChart !== false ? buildSnapshotUrl(data.signal, data.closes) : null;
    let sent = 0;
    for (const sub of targets) {
      try {
        if (photoUrl) {
          await tgFetch("sendPhoto", { chat_id: sub.chat_id, photo: photoUrl, caption: text });
        } else {
          await tgFetch("sendMessage", { chat_id: sub.chat_id, text });
        }
        sent++;
      } catch (e) {
        console.error("Telegram send fail", e);
      }
    }
    if (data.signalId) {
      await sb
        .from("signals")
        .update({ sent_telegram: sent > 0 })
        .eq("id", data.signalId);
    }
    return { sent, total: targets.length };
  });

export const subscribeChatId = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ chatId: z.number().int(), username: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { error } = await sb
      .from("telegram_subscribers")
      .upsert(
        { chat_id: data.chatId, username: data.username, active: true },
        { onConflict: "chat_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSubscribers = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb
    .from("telegram_subscribers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { subscribers: data || [] };
});

export const sendTestMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ chatId: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    await tgFetch("sendMessage", {
      chat_id: data.chatId,
      text: "DivergenceIQ connected!\nYou will receive signal alerts here.\nUse /signals to see latest, /elite for top signals.",
    });
    return { ok: true };
  });

export const getBotInfo = createServerFn({ method: "GET" }).handler(async () => {
  const me = await tgFetch("getMe", {});
  return { username: me.username as string, name: me.first_name as string, id: me.id as number };
});

export const setupTelegramWebhook = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ webhookUrl: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const result = await tgFetch("setWebhook", {
      url: data.webhookUrl,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });
    return { ok: true, result };
  });

export const getWebhookStatus = createServerFn({ method: "GET" }).handler(async () => {
  const info = await tgFetch("getWebhookInfo", {});
  return {
    url: info.url as string,
    pending: (info.pending_update_count ?? 0) as number,
    lastError: (info.last_error_message ?? null) as string | null,
    lastErrorDate: (info.last_error_date ?? null) as number | null,
    ipAddress: (info.ip_address ?? null) as string | null,
    maxConnections: (info.max_connections ?? 40) as number,
  };
});

// Broadcast an arbitrary alert message to every active subscriber.
// Used by the /alert-builder route.
export const broadcastAlertMessage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ text: z.string().min(1).max(3500), minScore: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: subs, error } = await sb
      .from("telegram_subscribers")
      .select("chat_id, min_score")
      .eq("active", true);
    if (error) throw new Error(error.message);
    const min = data.minScore ?? 0;
    const targets = (subs || []).filter((s: any) => min >= (s.min_score ?? 0));
    let sent = 0;
    for (const sub of targets) {
      try {
        await tgFetch("sendMessage", { chat_id: sub.chat_id, text: data.text });
        sent++;
      } catch (e) {
        console.error("Telegram alert send fail", e);
      }
    }
    return { sent, total: targets.length };
  });
