"use client";

import { useState, useEffect } from "react";
import { GlassPanel, SectionTitle, ShimmerButton, KpiCard } from "@/components/presidin/glass";
import { Bell, Send, MessageCircle, Smartphone, Check, AlertCircle } from "lucide-react";
import { useProvidersStore } from "@/stores/presidin";
import { dispatchNotification, requestNotificationPermission, type NotificationPayload } from "@/lib/presidin/notifications";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function NotificationsSection() {
  const { telegramBotToken, telegramChatId, discordWebhook, setTelegram, setDiscord } = useProvidersStore();
  const [tgBot, setTgBot] = useState(telegramBotToken ?? "");
  const [tgChat, setTgChat] = useState(telegramChatId ?? "");
  const [dcWh, setDcWh] = useState(discordWebhook ?? "");
  const [localEnabled, setLocalEnabled] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "denied" | "default" | "granted" | "unsupported">("default");
  const [testPayload] = useState<NotificationPayload>({
    title: "Test Signal",
    body: "EURUSD BUY signal @ 1.0850 — 72% confidence, R:R 1:2.0",
    level: "info",
    source: "signal",
  });

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPerm(Notification.permission);
    } else {
      setNotifPerm("unsupported");
    }
  }, []);

  const saveTelegram = () => {
    setTelegram(tgBot, tgChat);
    toast.success("Telegram settings saved");
  };
  const saveDiscord = () => {
    setDiscord(dcWh);
    toast.success("Discord webhook saved");
  };
  const requestLocal = async () => {
    requestNotificationPermission();
    if (typeof window !== "undefined" && "Notification" in window) {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      if (p === "granted") {
        setLocalEnabled(true);
        toast.success("Local notifications enabled");
      } else {
        toast.error("Local notifications denied");
      }
    }
  };
  const sendTest = async () => {
    await dispatchNotification(testPayload, {
      telegramBotToken: tgBot,
      telegramChatId: tgChat,
      discordWebhook: dcWh,
      localEnabled,
    });
    toast.success("Test notification dispatched to all configured channels");
  };

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Notifications"
        subtitle="Telegram · Discord · Push · Local — unified dispatch"
        icon={<Bell className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={sendTest} className="text-xs">
            <Send className="h-3.5 w-3.5" />
            Send test
          </ShimmerButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Telegram"
          value={tgBot ? "Connected" : "Off"}
          delta={tgBot ? "ready" : "configure below"}
          deltaType={tgBot ? "up" : "neutral"}
          icon={<Send className="h-4 w-4" />}
        />
        <KpiCard
          label="Discord"
          value={dcWh ? "Connected" : "Off"}
          delta={dcWh ? "ready" : "configure below"}
          deltaType={dcWh ? "up" : "neutral"}
          icon={<MessageCircle className="h-4 w-4" />}
        />
        <KpiCard
          label="Local Push"
          value={notifPerm === "granted" ? "Enabled" : "Off"}
          delta={notifPerm}
          deltaType={notifPerm === "granted" ? "up" : "neutral"}
          icon={<Smartphone className="h-4 w-4" />}
        />
        <KpiCard
          label="Channels Active"
          value={[tgBot, dcWh, localEnabled].filter(Boolean).length}
          delta="of 3 channels"
          deltaType="neutral"
          icon={<Bell className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Telegram */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-cyan-400" />
              Telegram Bot
            </h3>
            {tgBot && <Check className="h-4 w-4 text-emerald-400" />}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Bot Token</label>
              <input
                type="password"
                value={tgBot}
                onChange={(e) => setTgBot(e.target.value)}
                placeholder="123456:ABC-DEF..."
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Chat ID</label>
              <input
                value={tgChat}
                onChange={(e) => setTgChat(e.target.value)}
                placeholder="-1001234567890"
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs"
              />
            </div>
            <ShimmerButton onClick={saveTelegram} className="w-full !text-xs">
              Save Telegram
            </ShimmerButton>
          </div>
        </GlassPanel>

        {/* Discord */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-violet-400" />
              Discord Webhook
            </h3>
            {dcWh && <Check className="h-4 w-4 text-emerald-400" />}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Webhook URL</label>
              <input
                type="url"
                value={dcWh}
                onChange={(e) => setDcWh(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs"
              />
            </div>
            <ShimmerButton onClick={saveDiscord} className="w-full !text-xs">
              Save Discord
            </ShimmerButton>
            <div className="rounded-md bg-violet-500/10 p-2 text-[10px] text-violet-300">
              Tip: In Discord → Channel Settings → Integrations → Webhooks → New Webhook → Copy URL
            </div>
          </div>
        </GlassPanel>

        {/* Local Push */}
        <GlassPanel veil>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-400" />
              Local Push
            </h3>
            <Switch checked={localEnabled} onCheckedChange={setLocalEnabled} />
          </div>
          <div className="space-y-3">
            <div className="rounded-md bg-secondary/40 p-3 text-xs">
              <div className="font-medium">Permission status</div>
              <div className="mt-1 capitalize">{notifPerm}</div>
            </div>
            {notifPerm !== "granted" && (
              <ShimmerButton onClick={requestLocal} className="w-full !text-xs">
                <Bell className="h-3 w-3" />
                Request permission
              </ShimmerButton>
            )}
            <div className="rounded-md bg-amber-500/10 p-2 text-[10px] text-amber-300 flex items-start gap-2">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>On mobile (Capacitor build), this uses native push notifications via Expo/FCM. On web, uses the Web Notifications API.</span>
            </div>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Alert Rules (auto-dispatched)</h3>
        <div className="space-y-2">
          {[
            { event: "New signal above 70% confidence", channel: "All enabled", enabled: true },
            { event: "New signal above 85% confidence (high-priority)", channel: "Telegram + Push", enabled: true },
            { event: "Trade opened", channel: "Telegram", enabled: true },
            { event: "Trade closed (win)", channel: "Discord", enabled: false },
            { event: "Trade closed (loss)", channel: "Telegram + Push", enabled: true },
            { event: "Anomaly Guard triggered — symbol paused", channel: "All enabled (urgent)", enabled: true },
            { event: "Drift Monitor — PSI > 0.25", channel: "Telegram", enabled: true },
            { event: "Shadow model promoted to production", channel: "Telegram + Push", enabled: true },
          ].map((rule) => (
            <div key={rule.event} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3 text-xs">
              <div>
                <div className="font-medium">{rule.event}</div>
                <div className="text-muted-foreground">→ {rule.channel}</div>
              </div>
              <Switch defaultChecked={rule.enabled} />
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
