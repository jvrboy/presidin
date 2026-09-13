import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getBotInfo,
  listSubscribers,
  sendTestMessage,
  subscribeChatId,
  setupTelegramWebhook,
  getWebhookStatus,
} from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Copy, Check, Zap, RefreshCw, AlertCircle, CircleCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: "Telegram Bot — DivergenceIQ" },
      {
        name: "description",
        content: "Configure the DivergenceIQ Telegram bot and manage signal subscribers.",
      },
    ],
  }),
  component: TelegramPage,
});

const PROJECT_ID = "cd2125b3-e3ec-4fc2-a7f2-25e144c8a534";
const STABLE_WEBHOOK_URL = `https://project--${PROJECT_ID}-dev.lovable.app/api/public/telegram/webhook`;

function TelegramPage() {
  const getInfo = useServerFn(getBotInfo);
  const list = useServerFn(listSubscribers);
  const subscribe = useServerFn(subscribeChatId);
  const sendTest = useServerFn(sendTestMessage);
  const setupHook = useServerFn(setupTelegramWebhook);
  const hookStatus = useServerFn(getWebhookStatus);

  const [bot, setBot] = useState<{ username: string; name: string } | null>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [chatId, setChatId] = useState("");
  const [copied, setCopied] = useState(false);
  const [hook, setHook] = useState<Awaited<ReturnType<typeof hookStatus>> | null>(null);
  const [registering, setRegistering] = useState(false);
  const [autoForward, setAutoForward] = useState(
    () => localStorage.getItem("tg_auto_forward") === "true",
  );
  const [minScore, setMinScore] = useState(() =>
    parseInt(localStorage.getItem("tg_min_score") || "80"),
  );

  const refresh = async () => {
    try {
      setBot(await getInfo());
    } catch (e: any) {
      toast.error("Bot info: " + e.message);
    }
    try {
      const r = await list();
      setSubs(r.subscribers);
    } catch {}
    try {
      setHook(await hookStatus());
    } catch {}
  };
  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, []);

  const toggleAutoForward = () => {
    const next = !autoForward;
    setAutoForward(next);
    localStorage.setItem("tg_auto_forward", String(next));
    toast.success(
      next
        ? "Auto-forward ENABLED - ELITE signals will be sent instantly"
        : "Auto-forward disabled",
    );
  };

  const updateMinScore = (score: number) => {
    setMinScore(score);
    localStorage.setItem("tg_min_score", String(score));
  };

  const registerWebhook = async () => {
    setRegistering(true);
    try {
      await setupHook({ data: { webhookUrl: STABLE_WEBHOOK_URL } });
      const status = await hookStatus();
      setHook(status);
      if (status.url === STABLE_WEBHOOK_URL && !status.lastError) {
        toast.success("Webhook registered & verified");
      } else if (status.lastError) {
        toast.error("Registered but error: " + status.lastError);
      } else {
        toast.success("Webhook registered");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(STABLE_WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const addManual = async () => {
    const id = parseInt(chatId, 10);
    if (!Number.isFinite(id)) {
      toast.error("Invalid chat ID");
      return;
    }
    try {
      await subscribe({ data: { chatId: id } });
      await sendTest({ data: { chatId: id } });
      toast.success("Subscriber added & test sent");
      setChatId("");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isRegistered = hook?.url === STABLE_WEBHOOK_URL;
  const hasError = hook?.lastError;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" /> Telegram Bot
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-deliver high-confluence signals to Telegram subscribers
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-gradient-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Bot Status
            </h2>
            {bot ? (
              <div className="space-y-1 text-sm font-mono">
                <div>
                  Name: <span className="font-bold">{bot.name}</span>
                </div>
                <div>
                  Username:{" "}
                  <a
                    href={`https://t.me/${bot.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    @{bot.username}
                  </a>
                </div>
                <div className="text-bull pulse-dot text-xs uppercase">Connected</div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Loading bot info…</p>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Auto-Forward
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Instant ELITE signals</span>
                <button
                  onClick={toggleAutoForward}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoForward ? "bg-bull" : "bg-muted"}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoForward ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Min Score</span>
                  <span className="font-mono">{minScore}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={minScore}
                  onChange={(e) => updateMinScore(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {autoForward
                  ? `Auto-sending signals ≥${minScore} to ${subs.filter((s) => s.active).length} subscribers`
                  : "Disabled - manual send only"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Webhook (Auto-Register)
            </h2>
            <div className="flex items-center gap-2">
              {hook && (
                <span
                  className={`flex items-center gap-1 text-xs font-mono ${isRegistered && !hasError ? "text-bull" : hasError ? "text-bear" : "text-muted-foreground"}`}
                >
                  {isRegistered && !hasError ? (
                    <CircleCheck className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  {isRegistered && !hasError
                    ? "VERIFIED"
                    : hasError
                      ? "ERROR"
                      : hook.url
                        ? "OTHER URL"
                        : "NOT SET"}
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => hookStatus().then(setHook)}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-[11px] font-mono bg-muted/50 rounded px-2 py-1.5 break-all">
              {STABLE_WEBHOOK_URL}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <Button onClick={registerWebhook} disabled={registering} className="w-full">
            <Zap className="w-3.5 h-3.5 mr-2" />
            {registering
              ? "Registering…"
              : isRegistered && !hasError
                ? "Re-Register & Verify Webhook"
                : "Auto-Register Webhook"}
          </Button>
          {hook && (
            <div className="text-[11px] font-mono text-muted-foreground space-y-0.5 pt-2 border-t border-border">
              <div>
                Current URL:{" "}
                <span className="text-foreground break-all">{hook.url || "(none)"}</span>
              </div>
              <div>
                Pending updates: <span className="text-foreground">{hook.pending}</span>
              </div>
              {hook.ipAddress && (
                <div>
                  IP: <span className="text-foreground">{hook.ipAddress}</span>
                </div>
              )}
              {hook.lastError && (
                <div className="text-bear">
                  Last error: {hook.lastError}
                  {hook.lastErrorDate
                    ? ` (${new Date(hook.lastErrorDate * 1000).toLocaleString()})`
                    : ""}
                </div>
              )}
            </div>
          )}
          {bot && (
            <p className="text-[11px] text-muted-foreground pt-1">
              After registering, message <strong>@{bot.username}</strong> on Telegram with{" "}
              <code>/start</code> to subscribe automatically.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Manual Subscribe
          </h2>
          <p className="text-xs text-muted-foreground">
            Get your chat ID from @userinfobot in Telegram.
          </p>
          <div className="flex gap-2">
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="123456789"
              className="font-mono"
            />
            <Button onClick={addManual}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Add + Test
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Subscribers
            </h2>
            <span className="text-xs font-mono text-muted-foreground">{subs.length}</span>
          </div>
          {subs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No subscribers yet.
            </div>
          ) : (
            subs.map((s) => (
              <div
                key={s.id}
                className="px-4 py-2 border-t border-border flex items-center justify-between text-sm font-mono"
              >
                <span>
                  {s.chat_id}{" "}
                  {s.username && <span className="text-muted-foreground">· @{s.username}</span>}
                </span>
                <span className={`text-xs ${s.active ? "text-bull" : "text-muted-foreground"}`}>
                  {s.active ? "ACTIVE" : "PAUSED"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
