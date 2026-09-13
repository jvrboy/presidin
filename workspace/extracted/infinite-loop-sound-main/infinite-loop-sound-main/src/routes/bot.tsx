import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  Power,
  Radio,
  Zap,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Layers,
  Target,
  Gauge,
  Pause,
  Play,
  Save,
  Ban,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadBot,
  saveBot,
  validateSettings,
  DEFAULT_BOT,
  MAX_CONCURRENT_TRADES,
  type BotSettings,
  type BotMode,
} from "@/lib/bot/store";
import {
  botRunner,
  type ClosedTrade,
  type OpenPosition,
  type RunStatus,
  type TradeResult,
} from "@/lib/bot/runner";
import { ALL_ASSETS, displayPair } from "@/lib/engine/deriv";

export const Route = createFileRoute("/bot")({
  head: () => ({
    meta: [
      { title: "Auto-Trader Bot — DivergenceIQ" },
      {
        name: "description",
        content:
          "Automated Deriv trading bot with Signal and Perpetual Scalper modes, martingale sizing, and risk controls.",
      },
    ],
  }),
  component: BotPage,
});

// ----------------------------------------------------------------------------
// NumberField — controlled but text-buffered so users can type "0.01" etc.
// ----------------------------------------------------------------------------
function NumberField({
  value,
  onCommit,
  min,
  max,
  step = "0.01",
  placeholder,
  disabled,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [buf, setBuf] = useState<string>(value === 0 ? "0" : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setBuf(value === 0 ? "0" : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") return;
    let n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    if (typeof min === "number") n = Math.max(min, n);
    if (typeof max === "number") n = Math.min(max, n);
    onCommit(n);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      value={buf}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (/^-?\d*\.?\d*$/.test(v)) setBuf(v);
      }}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed)) setBuf(String(parsed));
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const MODE_META: Record<
  BotMode,
  { label: string; icon: typeof Power; desc: string; accent: string }
> = {
  off: {
    label: "OFF",
    icon: Power,
    desc: "Bot inactive. No trades or monitoring.",
    accent: "muted",
  },
  signal: {
    label: "SIGNAL",
    icon: Radio,
    desc: "Trades each new signal. One trade per signal.",
    accent: "primary",
  },
  scalper: {
    label: "SCALPER",
    icon: Zap,
    desc: "Perpetual scalper. Opens & closes trades 24/7.",
    accent: "bull",
  },
};

function BotPage() {
  const [s, setS] = useState<BotSettings>(DEFAULT_BOT);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<RunStatus>(botRunner.getStatus());
  // dirty: true when settings changed but not yet applied to a live bot.
  const [dirty, setDirty] = useState(false);
  // tick: forces re-render whenever the runner emits a change.
  const [, setTick] = useState(0);
  // Trade-history filters / sort.
  const [histSymbol, setHistSymbol] = useState<string>("all");
  const [histResult, setHistResult] = useState<"all" | "WIN" | "LOSS">("all");
  const [histSort, setHistSort] = useState<"time" | "pnl">("time");

  useEffect(() => {
    setS(loadBot());
  }, []);

  useEffect(() => {
    const offLog = botRunner.on((l) =>
      setLogs((prev) => [`${new Date().toLocaleTimeString()} · ${l}`, ...prev].slice(0, 100)),
    );
    const offChange = botRunner.onChange(() => {
      setStatus(botRunner.getStatus());
      setTick((t) => t + 1);
    });
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      offLog();
      offChange();
      clearInterval(i);
    };
  }, []);

  const update = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) => {
    const next = { ...s, [k]: v };
    setS(next);
    saveBot(next);
    // While the bot is live, config edits persist to storage but don't take
    // effect until the user clicks Save & Apply.
    const st = botRunner.getStatus();
    if (st === "running" || st === "paused") setDirty(true);
  };

  const toggleInstrument = (sym: string) => {
    const set = new Set(s.instruments);
    if (set.has(sym)) set.delete(sym);
    else set.add(sym);
    update("instruments", Array.from(set));
  };

  const applyMode = async (mode: BotMode) => {
    // Already on this mode and active — no-op. Use Pause/Resume to control it.
    if (mode === s.mode && (status === "running" || status === "paused")) return;
    const next = { ...s, mode };

    if (mode === "off") {
      setS(next);
      saveBot(next);
      await botRunner.stop();
      toast.message("Bot turned OFF");
      return;
    }

    const errors = validateSettings(next);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    if (
      next.accountType === "real" &&
      !confirm(
        `Start REAL-money trading in ${mode.toUpperCase()} mode? Trades will execute on your live Deriv account.`,
      )
    ) {
      return;
    }

    setS(next);
    saveBot(next);
    try {
      await botRunner.start(next);
      toast.success(`Bot running · ${mode.toUpperCase()} · ${next.accountType.toUpperCase()}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bot failed to start");
      const off = { ...next, mode: "off" as BotMode };
      setS(off);
      saveBot(off);
    }
  };

  const emergency = async () => {
    if (!confirm("EMERGENCY STOP — close ALL open positions immediately and turn the bot OFF?"))
      return;
    await botRunner.emergencyStop();
    setS((prev) => ({ ...prev, mode: "off" }));
    saveBot({ ...s, mode: "off" });
    toast.error("Emergency stop executed — all positions closed");
  };

  const massClose = async () => {
    if (botRunner.getOpenCount() === 0) {
      toast.message("No open positions to close");
      return;
    }
    if (
      !confirm(
        `Close all ${botRunner.getOpenCount()} open position(s) now? The bot stays in its current mode.`,
      )
    )
      return;
    await botRunner.massClose();
    toast.message("All open positions closed");
  };

  const pause = () => {
    botRunner.pause();
    toast.message("Bot paused — positions still monitored");
  };

  const resume = () => {
    botRunner.resume();
    toast.success("Bot resumed");
  };

  const applySettings = () => {
    const errors = validateSettings(s);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    saveBot(s);
    const st = botRunner.getStatus();
    if (st === "running" || st === "paused") {
      botRunner.updateSettings(s);
      toast.success("Settings applied to the running bot");
    } else {
      toast.success("Settings saved");
    }
    setDirty(false);
  };

  const openCount = botRunner.getOpenCount();
  const queueLen = botRunner.getQueueLength();
  const sessionPnl = botRunner.getSessionPnl();
  const dailyPnl = botRunner.getDailyPnl();
  const { wins, losses } = botRunner.getWinLoss();
  const lastResult: TradeResult = botRunner.getLastResult();
  const nextLot = botRunner.getNextLot();
  const openPositions: OpenPosition[] = botRunner.getOpenPositions();
  const closed: ClosedTrade[] = botRunner.getRecentClosed(200);
  const lastClosed = botRunner.getLastClosed();
  const lastActionAt = botRunner.getLastActionAt();
  const actionAgo = lastActionAt ? Math.round((Date.now() - lastActionAt) / 1000) : null;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const balance = botRunner.getBalance();
  const balanceBlocked = botRunner.isBalanceBlocked();

  const histSymbols = Array.from(new Set(closed.map((t) => t.pair)));
  const visibleClosed = closed
    .filter(
      (t) =>
        (histSymbol === "all" || t.pair === histSymbol) &&
        (histResult === "all" || t.result === histResult),
    )
    .slice()
    .sort((a, b) => (histSort === "pnl" ? b.pnl - a.pnl : b.closedAt - a.closedAt));

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isActive = isRunning || isPaused;
  const validationErrors = validateSettings(s);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" /> Auto-Trader Bot
            </h1>
            <p className="text-sm text-muted-foreground">
              Automated Deriv trading with Signal and Perpetual Scalper modes, martingale sizing,
              and built-in risk controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                onClick={isPaused ? resume : pause}
                variant="outline"
                className="gap-1.5 transition-all duration-300"
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4 text-bull" /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" /> Pause
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={massClose}
              variant="outline"
              disabled={openCount === 0}
              className="gap-1.5"
            >
              <Ban className="w-4 h-4" /> Close All ({openCount})
            </Button>
            <Button onClick={emergency} variant="destructive" className="gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Emergency Stop
            </Button>
          </div>
        </div>

        {balanceBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-bear/10 border border-bear/30 text-xs">
            <AlertTriangle className="w-4 h-4 text-bear shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-bear">New trades halted — insufficient balance.</span>{" "}
              The bot will keep monitoring open positions and resume opening trades once the balance
              recovers above your minimum.
            </div>
          </div>
        )}

        {/* ── Mode control panel ──────────────────��──────────────── */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-bold uppercase tracking-wider">Bot Mode</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(MODE_META) as BotMode[]).map((m) => {
              const meta = MODE_META[m];
              const Icon = meta.icon;
              const active = s.mode === m;
              const activeRunning = active && (m === "off" || isActive);
              return (
                <button
                  key={m}
                  onClick={() => applyMode(m)}
                  className={`text-left rounded-lg border p-3 transition-all duration-300 ease-out ${
                    activeRunning
                      ? m === "scalper"
                        ? "border-bull bg-bull/10 scale-[1.02] shadow-lg shadow-bull/10"
                        : m === "signal"
                          ? "border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10"
                          : "border-border bg-muted scale-[1.02]"
                      : "border-border bg-background hover:bg-muted/50 hover:scale-[1.01]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-bold">
                      <Icon
                        className={`w-4 h-4 transition-colors duration-300 ${activeRunning && m !== "off" ? (m === "scalper" ? "text-bull" : "text-primary") : "text-muted-foreground"}`}
                      />
                      {meta.label}
                    </span>
                    {active && m !== "off" && isRunning && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bull/20 text-bull animate-pulse">
                        LIVE
                      </span>
                    )}
                    {active && m !== "off" && isPaused && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        PAUSED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{meta.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`inline-block w-2 h-2 rounded-full transition-colors duration-300 ${
                status === "running"
                  ? "bg-bull animate-pulse"
                  : status === "paused"
                    ? "bg-primary"
                    : status === "halted"
                      ? "bg-bear"
                      : "bg-muted-foreground"
              }`}
            />
            Status: <span className="font-bold uppercase text-foreground">{status}</span>
            {status === "running" && actionAgo !== null && (
              <span>· last action {actionAgo}s ago</span>
            )}
            {status === "paused" && <span>· {openCount} position(s) monitored</span>}
            {queueLen > 0 && <span>· {queueLen} queued</span>}
          </div>
        </div>

        {/* ── Live dashboard ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Open Trades
            </div>
            <div className="text-2xl font-bold mt-1">
              {openCount} <span className="text-sm text-muted-foreground">/ {s.maxOpen}</span>
            </div>
            {queueLen > 0 && (
              <div className="text-[11px] text-muted-foreground">{queueLen} queued</div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Today&apos;s P&amp;L
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${dailyPnl > 0 ? "text-bull" : dailyPnl < 0 ? "text-bear" : ""}`}
            >
              {dailyPnl >= 0 ? "+" : ""}
              {dailyPnl.toFixed(2)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              session {sessionPnl >= 0 ? "+" : ""}
              {sessionPnl.toFixed(2)} · {wins}W / {losses}L · {winRate.toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Last Trade
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                lastResult === "WIN"
                  ? "text-bull"
                  : lastResult === "LOSS"
                    ? "text-bear"
                    : "text-muted-foreground"
              }`}
            >
              {lastResult}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lastClosed ? (
                <>
                  <span className={lastClosed.direction === "BUY" ? "text-bull" : "text-bear"}>
                    {lastClosed.direction}
                  </span>{" "}
                  {displayPair(lastClosed.pair)} ·{" "}
                  {new Date(lastClosed.closedAt).toLocaleTimeString()}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Next Lot
            </div>
            <div className="text-2xl font-bold mt-1">{nextLot.toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground">
              {s.positionSizing === "martingale"
                ? `martingale ×${s.martingaleMultiplier}`
                : "fixed"}
            </div>
          </div>
        </div>

        {/* ── Settings ───────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="text-sm font-bold uppercase tracking-wider">Configuration</div>

          {/* Account + token */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Account">
              <div className="flex gap-1">
                {(["demo", "real"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update("accountType", t)}
                    className={`flex-1 px-3 py-1.5 rounded text-xs font-bold ${
                      s.accountType === t
                        ? t === "real"
                          ? "bg-bear text-white"
                          : "bg-bull text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
            <div className="md:col-span-2">
              <Field label={`Deriv API token (${s.accountType})`}>
                <Input
                  type="password"
                  value={s.token}
                  onChange={(e) => update("token", e.target.value)}
                  placeholder="paste token (leave empty for dry-run)"
                />
              </Field>
            </div>
          </div>

          {/* Position sizing */}
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground">Position Sizing</div>
            <div className="flex gap-2">
              {(["fixed", "martingale"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => update("positionSizing", m)}
                  className={`px-3 py-1.5 rounded text-xs font-bold ${s.positionSizing === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {m === "fixed" ? "FIXED LOT" : "MARTINGALE"}
                </button>
              ))}
            </div>
            {s.positionSizing === "fixed" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Lot size (min 0.01)">
                  <NumberField
                    value={s.lotSize}
                    min={0.01}
                    max={1000}
                    step="0.01"
                    onCommit={(v) => update("lotSize", v)}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Base lot">
                  <NumberField
                    value={s.martingaleBase}
                    min={0.01}
                    max={1000}
                    step="0.01"
                    onCommit={(v) => update("martingaleBase", v)}
                  />
                </Field>
                <Field label="Multiplier (on loss)">
                  <NumberField
                    value={s.martingaleMultiplier}
                    min={1.1}
                    max={10}
                    step="0.1"
                    onCommit={(v) => update("martingaleMultiplier", v)}
                  />
                </Field>
                <Field label="Max lot (cap)">
                  <NumberField
                    value={s.martingaleMaxLot}
                    min={s.martingaleBase}
                    max={1000}
                    step="0.01"
                    onCommit={(v) => update("martingaleMaxLot", v)}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* TP source */}
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground">
              Take Profit Source
            </div>
            <div className="flex gap-2">
              {(["fixed", "system"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => update("tpSource", m)}
                  className={`px-3 py-1.5 rounded text-xs font-bold ${s.tpSource === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {m === "fixed" ? "FIXED TP" : "SYSTEM-BASED"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {s.tpSource === "fixed" && (
                <Field label="Fixed TP (pips)">
                  <NumberField
                    value={s.fixedTpPips}
                    min={1}
                    max={5000}
                    step="1"
                    onCommit={(v) => update("fixedTpPips", Math.round(v))}
                  />
                </Field>
              )}
              {s.mode === "scalper" && (
                <>
                  <Field label="Scalper TP (pips)">
                    <NumberField
                      value={s.scalperTpPips}
                      min={1}
                      max={5000}
                      step="1"
                      onCommit={(v) => update("scalperTpPips", Math.round(v))}
                    />
                  </Field>
                  <Field label="Scalper SL (pips)">
                    <NumberField
                      value={s.scalperSlPips}
                      min={1}
                      max={5000}
                      step="1"
                      onCommit={(v) => update("scalperSlPips", Math.round(v))}
                    />
                  </Field>
                </>
              )}
            </div>
            {s.tpSource === "system" && (
              <p className="text-[11px] text-muted-foreground">
                System-based: signal mode uses each signal&apos;s engine TP/SL; scalper uses the
                scalper TP/SL above.
              </p>
            )}
          </div>

          {/* Risk / management */}
          <div className="pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label={`Max concurrent (1-${MAX_CONCURRENT_TRADES})`}>
              <NumberField
                value={s.maxOpen}
                min={1}
                max={MAX_CONCURRENT_TRADES}
                step="1"
                onCommit={(v) => update("maxOpen", Math.round(v))}
              />
            </Field>
            <Field label="Cooldown (s)">
              <NumberField
                value={s.cooldownSec}
                min={0}
                max={3600}
                step="1"
                onCommit={(v) => update("cooldownSec", Math.round(v))}
              />
            </Field>
            <Field label="Max duration (s)">
              <NumberField
                value={s.durationSec}
                min={15}
                max={3600}
                step="5"
                onCommit={(v) => update("durationSec", Math.round(v))}
              />
            </Field>
            <Field label="Daily loss cap">
              <NumberField
                value={s.dailyLossCap}
                min={1}
                max={100000}
                step="1"
                onCommit={(v) => update("dailyLossCap", v)}
              />
            </Field>
          </div>

          {/* Signal-mode self-scan */}
          {s.mode !== "scalper" && (
            <div className="pt-3 border-t border-border grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Min signal score">
                <NumberField
                  value={s.minScore}
                  min={0}
                  max={100}
                  step="1"
                  onCommit={(v) => update("minScore", Math.round(v))}
                />
              </Field>
              <Field label="Scan interval (s)">
                <NumberField
                  value={s.scanIntervalSec}
                  min={5}
                  max={600}
                  step="5"
                  onCommit={(v) => update("scanIntervalSec", Math.round(v))}
                />
              </Field>
              <Field label="Scan timeframe">
                <select
                  value={s.scanTimeframe}
                  onChange={(e) =>
                    update("scanTimeframe", e.target.value as BotSettings["scanTimeframe"])
                  }
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="M1">M1</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                  <option value="H1">H1</option>
                </select>
              </Field>
            </div>
          )}

          {/* Guardrails */}
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Safety Guardrails
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Allow weekend trading</div>
                <p className="text-[11px] text-muted-foreground">
                  When off, forex/indices are blocked Sat–Sun. Synthetics always trade 24/7.
                </p>
              </div>
              <button
                type="button"
                onClick={() => update("allowWeekends", !s.allowWeekends)}
                className={`relative w-10 h-5 rounded-full transition-colors ${s.allowWeekends ? "bg-primary" : "bg-muted"}`}
                aria-label="Toggle weekend trading"
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.allowWeekends ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" /> Avoid low-liquidity hours
                </div>
                <p className="text-[11px] text-muted-foreground">
                  When on, forex/indices are blocked during the UTC window below. Synthetics exempt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => update("avoidLowLiquidity", !s.avoidLowLiquidity)}
                className={`relative w-10 h-5 rounded-full transition-colors ${s.avoidLowLiquidity ? "bg-primary" : "bg-muted"}`}
                aria-label="Toggle low-liquidity guardrail"
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.avoidLowLiquidity ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {s.avoidLowLiquidity && (
                <>
                  <Field label="Low-liq start (UTC h)">
                    <NumberField
                      value={s.lowLiqStartUtc}
                      min={0}
                      max={23}
                      step="1"
                      onCommit={(v) => update("lowLiqStartUtc", Math.round(v))}
                    />
                  </Field>
                  <Field label="Low-liq end (UTC h)">
                    <NumberField
                      value={s.lowLiqEndUtc}
                      min={0}
                      max={23}
                      step="1"
                      onCommit={(v) => update("lowLiqEndUtc", Math.round(v))}
                    />
                  </Field>
                </>
              )}
              <Field label="Min balance (0 = off)">
                <NumberField
                  value={s.minBalance}
                  min={0}
                  max={1000000}
                  step="1"
                  onCommit={(v) => update("minBalance", v)}
                />
              </Field>
            </div>
            {s.minBalance > 0 && balance !== null && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Live balance:{" "}
                <span className="font-mono text-foreground">{balance.toFixed(2)}</span>
                {balanceBlocked && (
                  <span className="text-bear font-medium">· below minimum — trades halted</span>
                )}
              </p>
            )}
          </div>

          {s.accountType === "real" && (
            <div className="flex items-start gap-2 p-3 rounded bg-bear/10 border border-bear/30 text-xs">
              <AlertTriangle className="w-4 h-4 text-bear shrink-0 mt-0.5" />
              <div>
                REAL mode places real-money trades on Deriv. Always confirm sizing, max open, and
                daily cap before starting.
              </div>
            </div>
          )}

          {/* Save / Apply */}
          <div className="pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px]">
              {validationErrors.length > 0 ? (
                <span className="text-bear">{validationErrors[0]}</span>
              ) : isActive && dirty ? (
                <span className="text-primary">
                  Unapplied changes — click Save &amp; Apply to update the running bot.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Settings save automatically.
                  {isActive ? " Use Save & Apply to push changes to the running bot." : ""}
                </span>
              )}
            </div>
            <Button
              onClick={applySettings}
              disabled={validationErrors.length > 0 || (isActive && !dirty)}
              className="gap-1.5 transition-all duration-300"
            >
              <Save className="w-4 h-4" /> {isActive ? "Save & Apply" : "Save settings"}
            </Button>
          </div>
        </div>

        {/* ── Instruments ────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-sm font-bold uppercase tracking-wider">
            Instruments ({s.instruments.length})
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 max-h-48 overflow-auto">
            {ALL_ASSETS.map((a) => (
              <button
                key={a.symbol}
                onClick={() => toggleInstrument(a.symbol)}
                className={`px-2 py-1 rounded text-[11px] font-mono text-left ${
                  s.instruments.includes(a.symbol)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {a.display}
              </button>
            ))}
          </div>
        </div>

        {/* ── Live log + open positions ──────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live log
            </div>
            <div className="space-y-0.5 text-[11px] font-mono max-h-60 overflow-auto">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">no events yet</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="text-muted-foreground">
                    {l}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-bold uppercase tracking-wider mb-2">
              Open positions ({openPositions.length})
            </div>
            <div className="space-y-1 text-xs max-h-60 overflow-auto">
              {openPositions.length === 0 ? (
                <div className="text-muted-foreground">no open positions</div>
              ) : (
                openPositions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-1.5 rounded border border-border"
                  >
                    <span className="font-mono">
                      {displayPair(p.pair)}{" "}
                      <span className={p.direction === "BUY" ? "text-bull" : "text-bear"}>
                        {p.direction}
                      </span>{" "}
                      {p.lot}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      TP {p.tpPips}p / SL {p.slPips}p
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Trade history ──────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-sm font-bold uppercase tracking-wider">
              Trade history{" "}
              <span className="text-muted-foreground font-normal">({visibleClosed.length})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={histSymbol}
                onChange={(e) => setHistSymbol(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Filter by symbol"
              >
                <option value="all">All symbols</option>
                {histSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {displayPair(sym)}
                  </option>
                ))}
              </select>
              <select
                value={histResult}
                onChange={(e) => setHistResult(e.target.value as "all" | "WIN" | "LOSS")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Filter by result"
              >
                <option value="all">All results</option>
                <option value="WIN">Wins</option>
                <option value="LOSS">Losses</option>
              </select>
              <select
                value={histSort}
                onChange={(e) => setHistSort(e.target.value as "time" | "pnl")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Sort trades"
              >
                <option value="time">Newest first</option>
                <option value="pnl">Highest P&amp;L</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => botRunner.resetSession()}>
                Reset session
              </Button>
            </div>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground sticky top-0 bg-card">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2 font-medium">Time</th>
                  <th className="py-1.5 pr-2 font-medium">Symbol</th>
                  <th className="py-1.5 pr-2 font-medium">Dir</th>
                  <th className="py-1.5 pr-2 font-medium">Lot</th>
                  <th className="py-1.5 pr-2 font-medium">Entry</th>
                  <th className="py-1.5 pr-2 font-medium">Exit</th>
                  <th className="py-1.5 pr-2 font-medium">TP/SL</th>
                  <th className="py-1.5 pr-2 font-medium text-right">P&amp;L</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {visibleClosed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-muted-foreground">
                      {closed.length === 0
                        ? "no closed trades yet"
                        : "no trades match the current filters"}
                    </td>
                  </tr>
                ) : (
                  visibleClosed.map((t) => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                        {new Date(t.openedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-1.5 pr-2 font-mono">{displayPair(t.pair)}</td>
                      <td
                        className={`py-1.5 pr-2 font-bold ${t.direction === "BUY" ? "text-bull" : "text-bear"}`}
                      >
                        {t.direction}
                      </td>
                      <td className="py-1.5 pr-2 font-mono">{t.lot}</td>
                      <td className="py-1.5 pr-2 font-mono">{t.entry.toFixed(5)}</td>
                      <td className="py-1.5 pr-2 font-mono">{t.exit.toFixed(5)}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                        {t.tpPips}/{t.slPips}p
                      </td>
                      <td
                        className={`py-1.5 pr-2 font-mono text-right ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}
                      >
                        {t.pnl >= 0 ? "+" : ""}
                        {t.pnl.toFixed(2)}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right font-bold ${t.result === "WIN" ? "text-bull" : "text-bear"}`}
                      >
                        {t.result}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
