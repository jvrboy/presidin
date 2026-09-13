// Auto-trader runner.
//
// Modes (mutually exclusive, set via settings.mode):
//   off      → fully inactive. No trades, no monitoring, no scanning.
//   signal   → reacts to every NEW signal (Supabase `signals` INSERT or the
//              built-in self-scanner). One trade per signal. Honours
//              maxOpen; queues signals when the slot limit is reached.
//   scalper  → perpetual scalper. Continuously opens trades up to maxOpen and,
//              whenever a trade closes, immediately opens a replacement.
//
// Position sizing supports FIXED lot and MARTINGALE (multiply lot after a loss,
// reset to base after a win, capped at martingaleMaxLot).
//
// Because Deriv's trade API used here is duration-based binary (CALL/PUT), the
// runner layers a tick-driven monitor over each open position to detect TP/SL
// hits, compute realised P&L, drive the martingale ladder, and update stats.

import { supabase } from "@/integrations/supabase/client";
import { deriv, type TF } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";
import { isLowLiquidityHour, pipSize, pipValuePerLot, type BotSettings } from "./store";

// Persisted session snapshot so cumulative stats and trade history survive an
// app restart / page reload (the spec requires history not be lost).
const SESSION_KEY = "div-iq/bot-session/v1";

interface SessionSnapshot {
  day: string;
  sessionPnl: number;
  dailyPnl: number;
  wins: number;
  losses: number;
  lastResult: TradeResult;
  martingaleLot: number;
  closed: ClosedTrade[];
}

export type RunStatus = "stopped" | "running" | "paused" | "halted";
export type TradeResult = "WIN" | "LOSS" | "PENDING";

export interface OpenPosition {
  id: string;
  dbId: string | null;
  contractId: string | null;
  pair: string;
  direction: "BUY" | "SELL";
  lot: number;
  entry: number;
  tpPrice: number;
  slPrice: number;
  tpPips: number;
  slPips: number;
  openedAt: number;
  source: "scan" | "supabase" | "scalper" | "automation";
  unsubTicks?: () => void;
  timeout?: number;
}

export interface ClosedTrade {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  lot: number;
  entry: number;
  exit: number;
  tpPips: number;
  slPips: number;
  pnl: number;
  result: "WIN" | "LOSS";
  openedAt: number;
  closedAt: number;
  source: string;
}

interface QueuedSignal {
  pair: string;
  direction: "BUY" | "SELL";
  entry: number;
  score: number;
  source: "scan" | "supabase" | "automation";
  tpPips?: number;
  slPips?: number;
}

type IncomingSignal = QueuedSignal;

class BotRunner {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private settings: BotSettings | null = null;
  private open: OpenPosition[] = [];
  private queue: QueuedSignal[] = [];
  private closed: ClosedTrade[] = [];
  private lastTradeAt = 0;
  private lastTradePerPair: Record<string, number> = {};
  private sessionPnl = 0;
  private dailyPnl = 0;
  private day = new Date().toDateString();
  private wins = 0;
  private losses = 0;
  private lastResult: TradeResult = "PENDING";
  private lastActionAt = 0;
  private martingaleLot = 0;

  private listeners = new Set<(s: string) => void>();
  private changeListeners = new Set<() => void>();
  private status: RunStatus = "stopped";
  private scanTimer: number | null = null;
  private scalperTimer: number | null = null;
  private balanceTimer: number | null = null;
  private scanning = false;
  private lastScanAt = 0;
  private balanceBlocked = false;
  private lastBalance: number | null = null;

  constructor() {
    this.restoreSession();
  }

  // ── session persistence ─────────────────────────────────────────
  private persistSession() {
    if (typeof window === "undefined") return;
    try {
      const snap: SessionSnapshot = {
        day: this.day,
        sessionPnl: this.sessionPnl,
        dailyPnl: this.dailyPnl,
        wins: this.wins,
        losses: this.losses,
        lastResult: this.lastResult,
        martingaleLot: this.martingaleLot,
        closed: this.closed.slice(0, 200),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
    } catch {
      /* ignore quota / serialization errors */
    }
  }

  private restoreSession() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as Partial<SessionSnapshot>;
      const today = new Date().toDateString();
      this.day = snap.day ?? today;
      this.sessionPnl = Number(snap.sessionPnl ?? 0);
      // Daily P&L only carries over within the same calendar day.
      this.dailyPnl = snap.day === today ? Number(snap.dailyPnl ?? 0) : 0;
      this.wins = Number(snap.wins ?? 0);
      this.losses = Number(snap.losses ?? 0);
      this.lastResult = (snap.lastResult as TradeResult) ?? "PENDING";
      this.martingaleLot = Number(snap.martingaleLot ?? 0);
      this.closed = Array.isArray(snap.closed) ? snap.closed.slice(0, 200) : [];
    } catch {
      /* corrupt snapshot — start fresh */
    }
  }

  // ── subscriptions ──────────────────────────────────────────────
  on(cb: (s: string) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  onChange(cb: () => void) {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }
  private log(s: string) {
    console.log("[bot]", s);
    this.lastActionAt = Date.now();
    this.listeners.forEach((c) => c(s));
    this.emitChange();
  }
  private emitChange() {
    this.changeListeners.forEach((c) => c());
  }

  // ── getters for the UI ─────────────────────────────────────────
  getStatus(): RunStatus {
    return this.status;
  }
  getMode(): BotSettings["mode"] {
    return this.settings?.mode ?? "off";
  }
  getOpenCount() {
    return this.open.length;
  }
  getOpenPositions(): OpenPosition[] {
    return this.open.slice();
  }
  getQueueLength() {
    return this.queue.length;
  }
  getSessionPnl() {
    return this.sessionPnl;
  }
  getDailyPnl() {
    return this.dailyPnl;
  }
  getWinLoss() {
    return { wins: this.wins, losses: this.losses };
  }
  getLastResult() {
    return this.lastResult;
  }
  getLastActionAt() {
    return this.lastActionAt;
  }
  getLastScanAt() {
    return this.lastScanAt;
  }
  getRecentClosed(limit = 30): ClosedTrade[] {
    return this.closed.slice(0, limit);
  }
  getNextLot(): number {
    if (!this.settings) return 0;
    return this.settings.positionSizing === "martingale"
      ? this.martingaleLot
      : this.settings.lotSize;
  }
  getBalance(): number | null {
    return this.lastBalance;
  }
  isBalanceBlocked(): boolean {
    return this.balanceBlocked;
  }

  resetSession() {
    this.sessionPnl = 0;
    this.dailyPnl = 0;
    this.wins = 0;
    this.losses = 0;
    this.closed = [];
    this.lastResult = "PENDING";
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    this.emitChange();
  }

  getLastClosed(): ClosedTrade | null {
    return this.closed[0] ?? null;
  }

  // ── lifecycle ───────────────────────────────────────────────────
  async start(s: BotSettings) {
    if (this.status === "running") await this.stop(true);
    this.settings = s;
    this.martingaleLot = s.martingaleBase;

    if (s.mode === "off") {
      this.status = "stopped";
      this.log("Mode is OFF — nothing to run");
      return;
    }

    if (!s.token) {
      this.log("No token — bot runs in DRY mode (simulated fills, no real orders)");
    } else {
      try {
        await deriv.assertTradeScope(s.token);
        this.log("Trade scope verified");
      } catch (e: unknown) {
        this.status = "stopped";
        const msg = e instanceof Error ? e.message : "scope check failed";
        this.log("HALT — " + msg);
        try {
          const mod = await import("@/lib/alerts.functions");
          await mod.raiseAlertFn({
            data: {
              severity: "error",
              kind: "deriv.scope_blocked",
              message: "Bot halted — Deriv token lacks trade scope",
              context: { error: msg },
            },
          });
        } catch {
          /* ignore */
        }
        throw e;
      }
    }

    this.status = "running";
    this.day = new Date().toDateString();
    this.log(
      `Bot started · ${s.mode.toUpperCase()} · ${s.accountType.toUpperCase()} · sizing=${s.positionSizing} · maxOpen=${s.maxOpen} · pairs=${s.instruments.join(",")}`,
    );

    this.balanceBlocked = false;
    if (s.token && s.minBalance > 0) void this.checkBalance();

    if (s.mode === "signal") {
      this.subscribeSignals();
      this.scheduleScan();
    } else if (s.mode === "scalper") {
      this.scheduleScalper(500);
    }
    this.emitChange();
  }

  // Live-apply configuration changes to a RUNNING or PAUSED bot without a
  // restart. Mode is governed separately by start/stop, so it is preserved
  // here. Session stats, open positions, queue, and the martingale ladder are
  // all kept intact; the martingale lot is re-clamped to the new base/cap.
  updateSettings(s: BotSettings) {
    if (!this.settings) {
      this.settings = s;
      return;
    }
    const runningMode = this.settings.mode;
    this.settings = { ...s, mode: runningMode };
    // Keep the current martingale lot within the new base/cap bounds.
    this.martingaleLot = Math.min(
      Math.max(this.martingaleLot, s.martingaleBase),
      s.martingaleMaxLot,
    );
    this.log(
      `Settings applied live · sizing=${s.positionSizing} · maxOpen=${s.maxOpen} · TP=${s.tpSource}${s.tpSource === "fixed" ? `(${s.fixedTpPips}p)` : ""}`,
    );
    this.emitChange();
  }

  async stop(silent = false) {
    if (this.channel) {
      try {
        await supabase.removeChannel(this.channel);
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scalperTimer !== null) {
      window.clearTimeout(this.scalperTimer);
      this.scalperTimer = null;
    }
    if (this.balanceTimer !== null) {
      window.clearTimeout(this.balanceTimer);
      this.balanceTimer = null;
    }
    this.queue = [];
    this.status = "stopped";
    if (!silent) this.log("Bot stopped");
    this.emitChange();
  }

  // Pause — stop opening NEW trades but keep open positions monitored so they
  // can still hit TP/SL. Preserves session stats, queue, and martingale ladder.
  // Primarily for PERPETUAL SCALPER (resume without data loss) but works in
  // SIGNAL mode too.
  pause() {
    if (this.status !== "running") return;
    this.status = "paused";
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scalperTimer !== null) {
      window.clearTimeout(this.scalperTimer);
      this.scalperTimer = null;
    }
    this.log(
      `Bot paused — ${this.open.length} open position(s) still monitored; no new trades will open`,
    );
    this.emitChange();
  }

  // Resume — pick the engine back up exactly where it left off.
  resume() {
    if (this.status !== "paused" || !this.settings) return;
    this.status = "running";
    this.log("Bot resumed");
    if (this.settings.token && this.settings.minBalance > 0) void this.checkBalance();
    if (this.settings.mode === "signal") {
      this.scheduleScan();
      this.processQueue();
    } else if (this.settings.mode === "scalper") {
      this.scheduleScalper(500);
    }
    this.emitChange();
  }

  halt(reason: string) {
    this.status = "halted";
    this.log("HALT — " + reason);
    if (this.channel) supabase.removeChannel(this.channel).catch(() => {});
    this.channel = null;
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scalperTimer !== null) {
      window.clearTimeout(this.scalperTimer);
      this.scalperTimer = null;
    }
    if (this.balanceTimer !== null) {
      window.clearTimeout(this.balanceTimer);
      this.balanceTimer = null;
    }
    this.queue = [];
    this.emitChange();
  }

  // Mass-close — force-close every open position immediately but keep the bot
  // in its current mode/status (unlike emergency stop, which also turns it OFF).
  async massClose() {
    const positions = this.open.slice();
    if (positions.length === 0) {
      this.log("Mass close — no open positions");
      return;
    }
    this.log(`Mass close — closing ${positions.length} open position(s)`);
    for (const p of positions) {
      try {
        await this.closePosition(p, p.entry, "manual");
      } catch {
        /* ignore */
      }
    }
    this.emitChange();
  }

  // Emergency stop — force-close every open position immediately and stop.
  async emergencyStop() {
    this.log(`EMERGENCY STOP — closing ${this.open.length} open position(s)`);
    const positions = this.open.slice();
    for (const p of positions) {
      try {
        await this.closePosition(p, p.entry, "manual");
      } catch {
        /* ignore */
      }
    }
    this.open = [];
    this.queue = [];
    await this.stop(true);
    if (this.settings) this.settings = { ...this.settings, mode: "off" };
    this.status = "stopped";
    this.log("All positions closed. Bot is OFF.");
    this.emitChange();
  }

  // ── guardrails ──────────────────────────────────────────────────
  // Synthetics (R_*, 1HZ*, BOOM, CRASH, JD) trade 24/7 and ignore session windows.
  private isSynthetic(pair: string): boolean {
    return /^R_|HZ|BOOM|CRASH|JD/i.test(pair);
  }

  private isWeekendBlocked(pair: string): boolean {
    if (!this.settings || this.settings.allowWeekends) return false;
    if (this.isSynthetic(pair)) return false;
    const day = new Date().getUTCDay(); // 0 = Sun, 6 = Sat
    return day === 0 || day === 6;
  }

  // Combined session guardrail: weekend block + configurable low-liquidity hours.
  // Returns a human-readable reason when blocked, otherwise null.
  private timeBlockReason(pair: string): string | null {
    if (!this.settings) return null;
    if (this.isWeekendBlocked(pair)) return "weekend trading disabled";
    if (!this.isSynthetic(pair) && isLowLiquidityHour(this.settings)) {
      return `low-liquidity hours (${this.settings.lowLiqStartUtc}:00–${this.settings.lowLiqEndUtc}:00 UTC)`;
    }
    return null;
  }

  private rollDay() {
    const today = new Date().toDateString();
    if (today !== this.day) {
      this.day = today;
      this.dailyPnl = 0;
    }
  }

  // ── balance guardrail ───────────────────────────────────────────
  // Polls the live Deriv balance and halts NEW trade openings (existing
  // positions keep being monitored) when it falls at/below minBalance.
  private scheduleBalanceCheck() {
    if (this.balanceTimer !== null) window.clearTimeout(this.balanceTimer);
    if (!this.settings || !this.settings.token || this.settings.minBalance <= 0) return;
    this.balanceTimer = window.setTimeout(() => void this.checkBalance(), 30_000);
  }

  private async checkBalance() {
    if (!this.settings || !this.settings.token) return;
    try {
      const b = await deriv.balance(this.settings.token);
      const amount = Number(b?.balance ?? b?.amount ?? NaN);
      if (Number.isFinite(amount)) {
        this.lastBalance = amount;
        const min = this.settings.minBalance;
        if (min > 0 && amount <= min) {
          if (!this.balanceBlocked) {
            this.balanceBlocked = true;
            this.log(
              `Balance ${amount.toFixed(2)} ≤ minimum ${min.toFixed(2)} — halting new trades`,
            );
            void this.raiseAlert(
              "deriv.balance_low",
              `Bot halted new trades — balance ${amount.toFixed(2)} ≤ minimum ${min.toFixed(2)}`,
              {
                balance: amount,
                minBalance: min,
              },
            );
          }
        } else if (this.balanceBlocked) {
          this.balanceBlocked = false;
          this.log(`Balance recovered (${amount.toFixed(2)}) — resuming new trades`);
        }
        this.emitChange();
      }
    } catch (e: unknown) {
      this.log(`balance check failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (this.status === "running" || this.status === "paused") this.scheduleBalanceCheck();
    }
  }

  private async raiseAlert(kind: string, message: string, context: Record<string, unknown>) {
    try {
      const mod = await import("@/lib/alerts.functions");
      await mod.raiseAlertFn({ data: { severity: "error", kind, message, context } });
    } catch {
      /* alerts are best-effort */
    }
  }

  private canOpenMore(): boolean {
    return !!this.settings && this.status === "running" && this.open.length < this.settings.maxOpen;
  }

  private cooldownOk(pair: string): boolean {
    if (!this.settings) return false;
    const cd = this.settings.cooldownSec * 1000;
    if (Date.now() - this.lastTradeAt < cd) return false;
    const lastPair = this.lastTradePerPair[pair] ?? 0;
    if (Date.now() - lastPair < cd) return false;
    return true;
  }

  // ── SIGNAL mode ─────────────────────────────────────────────────
  /**
   * Public entry point for external systems (e.g. the automation engine)
   * to push a signal into the bot. Honors all guardrails via handleSignal.
   * Accepts BUY/SELL or CALL/PUT direction strings.
   */
  async executeSignal(input: {
    pair: string;
    direction: string;
    scorePct?: number;
    entry?: number;
    rating?: string;
    source?: string;
    tpPips?: number;
    slPips?: number;
  }): Promise<{ accepted: boolean; reason?: string }> {
    if (this.status !== "running") return { accepted: false, reason: "Bot not running" };
    if (this.getMode() !== "signal") return { accepted: false, reason: "Bot not in SIGNAL mode" };
    const raw = String(input.direction || "").toUpperCase();
    const dir =
      raw === "BUY" || raw === "CALL" ? "BUY" : raw === "SELL" || raw === "PUT" ? "SELL" : null;
    if (!dir) return { accepted: false, reason: `Invalid direction: ${input.direction}` };
    await this.handleSignal({
      pair: input.pair,
      direction: dir,
      entry: Number(input.entry ?? 0),
      score: Number(input.scorePct ?? 100),
      source: "automation",
      tpPips: input.tpPips,
      slPips: input.slPips,
    });
    return { accepted: true };
  }

  private subscribeSignals() {
    try {
      this.channel = supabase
        .channel("bot-signals")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "signals" }, (p) => {
          const row = p.new as Record<string, unknown>;
          const dir = String(row.direction || "").toUpperCase();
          if (dir !== "BUY" && dir !== "SELL") return;
          this.handleSignal({
            pair: String(row.pair ?? row.symbol ?? ""),
            direction: dir as "BUY" | "SELL",
            entry: Number(row.entry ?? row.price ?? 0),
            score: Number(row.score ?? 100),
            source: "supabase",
            tpPips: row.tp != null ? Number(row.tp) : undefined,
            slPips: row.sl != null ? Number(row.sl) : undefined,
          });
        })
        .subscribe();
    } catch (e: unknown) {
      this.log("supabase channel failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private scheduleScan() {
    if (!this.settings || this.status !== "running" || this.settings.mode !== "signal") return;
    if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
    const intervalMs = Math.max(5, this.settings.scanIntervalSec) * 1000;
    this.scanTimer = window.setTimeout(() => this.runScan(), intervalMs);
  }

  private async runScan() {
    if (!this.settings || this.status !== "running" || this.settings.mode !== "signal") return;
    if (this.scanning) {
      this.scheduleScan();
      return;
    }
    this.scanning = true;
    const s = this.settings;
    const tf: TF = (s.scanTimeframe || "M5") as TF;
    this.lastScanAt = Date.now();
    this.emitChange();

    try {
      for (const pair of s.instruments) {
        if (this.status !== "running") break;
        try {
          const candles = await deriv.getCandles(pair, tf, 200);
          if (candles.length < 50) continue;
          const a = analyze(pair, tf, candles, {});
          if (!a.direction) continue;
          if (a.scorePct >= s.minScore) {
            const lastClose = candles[candles.length - 1].close;
            // System-based TP/SL from the analysis engine (in pips).
            let tpPips: number | undefined;
            let slPips: number | undefined;
            if (s.tpSource === "system" && a.trade) {
              const ps = pipSize(pair);
              tpPips = Math.abs(a.trade.tp1 - a.trade.entry) / ps;
              slPips = Math.abs(a.trade.entry - a.trade.sl) / ps;
            }
            this.log(`scan ${pair} ${tf}: ${a.rating} ${a.scorePct.toFixed(0)}% ${a.direction}`);
            await this.handleSignal({
              pair,
              direction: a.direction,
              entry: lastClose,
              score: a.scorePct,
              source: "scan",
              tpPips,
              slPips,
            });
          }
        } catch (e: unknown) {
          this.log(`scan ${pair} error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      this.scanning = false;
      this.scheduleScan();
    }
  }

  private async handleSignal(sig: IncomingSignal) {
    if (!this.settings || this.status !== "running" || this.settings.mode !== "signal") return;
    this.rollDay();
    const s = this.settings;
    if (!sig.pair || !s.instruments.includes(sig.pair)) return;
    if ((sig.score ?? 0) < s.minScore) return;

    if (this.dailyPnl <= -Math.abs(s.dailyLossCap)) {
      this.halt(`Daily loss cap hit (${this.dailyPnl.toFixed(2)})`);
      return;
    }
    const block = this.timeBlockReason(sig.pair);
    if (block) {
      this.log(`Skip ${sig.pair}: ${block}`);
      return;
    }
    if (this.balanceBlocked) {
      this.log(`Skip ${sig.pair}: balance below minimum — new trades halted`);
      return;
    }
    // Don't open a second trade for the same pair while one is still open
    // (spec: wait for the previous trade to close before another signal).
    if (this.open.some((o) => o.pair === sig.pair)) return;

    if (!this.canOpenMore()) {
      this.queue.push({
        pair: sig.pair,
        direction: sig.direction,
        entry: sig.entry,
        score: sig.score,
        source: sig.source,
        tpPips: sig.tpPips,
        slPips: sig.slPips,
      });
      this.log(`Max trades reached — queued ${sig.pair} (${this.queue.length} queued)`);
      return;
    }
    if (!this.cooldownOk(sig.pair)) {
      this.log(`Skip ${sig.pair}: cooldown`);
      return;
    }
    await this.openPosition(sig.pair, sig.direction, sig.entry, sig.source, sig.tpPips, sig.slPips);
  }

  private processQueue() {
    if (!this.settings || this.settings.mode !== "signal") return;
    while (this.queue.length > 0 && this.canOpenMore()) {
      const next = this.queue.shift()!;
      if (this.open.some((o) => o.pair === next.pair)) continue;
      this.log(`Opening queued signal ${next.pair} (${this.queue.length} left)`);
      void this.openPosition(
        next.pair,
        next.direction,
        next.entry,
        next.source,
        next.tpPips,
        next.slPips,
      );
    }
  }

  // ── SCALPER mode ────────────────────────────────────────────────
  private scheduleScalper(delayMs?: number) {
    if (!this.settings || this.status !== "running" || this.settings.mode !== "scalper") return;
    if (this.scalperTimer !== null) window.clearTimeout(this.scalperTimer);
    const ms = delayMs ?? Math.max(250, this.settings.cooldownSec * 1000);
    this.scalperTimer = window.setTimeout(() => this.runScalper(), ms);
  }

  private async runScalper() {
    if (!this.settings || this.status !== "running" || this.settings.mode !== "scalper") return;
    this.rollDay();
    const s = this.settings;

    if (this.dailyPnl <= -Math.abs(s.dailyLossCap)) {
      this.halt(`Daily loss cap hit (${this.dailyPnl.toFixed(2)})`);
      return;
    }

    try {
      if (this.balanceBlocked) {
        this.log("Scalper idle — balance below minimum; no new trades");
      } else if (this.canOpenMore() && this.cooldownOk("*")) {
        const candidates = s.instruments.filter((p) => !this.timeBlockReason(p));
        if (candidates.length === 0) {
          this.log("Scalper idle — all instruments blocked (weekend / low-liquidity)");
        } else {
          const pair = candidates[Math.floor(Math.random() * candidates.length)];
          const direction: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
          let entry = 0;
          try {
            const candles = await deriv.getCandles(pair, "M1", 1);
            entry = candles[candles.length - 1]?.close ?? 0;
          } catch {
            /* leave entry 0 — openPosition will resolve via tick */
          }
          await this.openPosition(pair, direction, entry, "scalper");
        }
      }
    } finally {
      this.scheduleScalper();
    }
  }

  // ── shared open/close ───────────────────────────────────────────
  private resolveTpSl(
    pair: string,
    source: OpenPosition["source"],
    sigTp?: number,
    sigSl?: number,
  ): { tpPips: number; slPips: number } {
    const s = this.settings!;
    if (source === "scalper") {
      const tp = s.tpSource === "system" ? s.scalperTpPips : s.fixedTpPips || s.scalperTpPips;
      return { tpPips: tp, slPips: s.scalperSlPips };
    }
    // signal mode
    if (s.tpSource === "system" && sigTp && sigTp > 0) {
      return { tpPips: sigTp, slPips: sigSl && sigSl > 0 ? sigSl : sigTp };
    }
    return { tpPips: s.fixedTpPips, slPips: s.fixedTpPips };
  }

  private nextLot(): number {
    const s = this.settings!;
    if (s.positionSizing === "fixed") return s.lotSize;
    // martingale current rung, clamped to the configured ceiling
    return Math.min(s.martingaleMaxLot, Math.max(s.martingaleBase, this.martingaleLot));
  }

  private async openPosition(
    pair: string,
    direction: "BUY" | "SELL",
    entryHint: number,
    source: OpenPosition["source"],
    sigTp?: number,
    sigSl?: number,
  ) {
    if (!this.settings || this.status !== "running") return;
    const s = this.settings;

    let entry = entryHint;
    if (!entry || !Number.isFinite(entry)) {
      try {
        const candles = await deriv.getCandles(pair, "M1", 1);
        entry = candles[candles.length - 1]?.close ?? 0;
      } catch {
        this.log(`ERR ${pair}: could not resolve entry price`);
        return;
      }
    }
    if (!entry) {
      this.log(`ERR ${pair}: entry price unavailable`);
      return;
    }

    const lot = this.nextLot();
    const { tpPips, slPips } = this.resolveTpSl(pair, source, sigTp, sigSl);
    const ps = pipSize(pair);
    const tpPrice = direction === "BUY" ? entry + tpPips * ps : entry - tpPips * ps;
    const slPrice = direction === "BUY" ? entry - slPips * ps : entry + slPips * ps;

    this.lastTradeAt = Date.now();
    this.lastTradePerPair[pair] = Date.now();

    const pos: OpenPosition = {
      id: `${pair}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dbId: null,
      contractId: null,
      pair,
      direction,
      lot,
      entry,
      tpPrice,
      slPrice,
      tpPips,
      slPips,
      openedAt: Date.now(),
      source,
    };
    this.open.push(pos);
    this.emitChange();

    // Persist to Supabase (best-effort).
    try {
      const ins = await supabase
        .from("bot_trades")
        .insert({ pair, direction, lot, entry, account_type: s.accountType, status: "pending" })
        .select()
        .single();
      pos.dbId = ins.data?.id ?? null;
    } catch (e: unknown) {
      this.log(`db insert failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Place the live order if we have a token; otherwise dry-run.
    if (s.token) {
      try {
        const r = await deriv.buyContract({
          token: s.token,
          symbol: pair,
          direction: direction === "BUY" ? "CALL" : "PUT",
          amount: lot,
          duration: s.durationSec,
        });
        pos.contractId = String(r.contract_id ?? "");
        if (pos.dbId)
          await supabase
            .from("bot_trades")
            .update({ status: "open", contract_id: pos.contractId })
            .eq("id", pos.dbId);
        this.log(
          `LIVE ${pair} ${direction} ${lot} #${pos.contractId} · TP ${tpPips}p / SL ${slPips}p`,
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (pos.dbId)
          await supabase
            .from("bot_trades")
            .update({ status: "error", error: msg })
            .eq("id", pos.dbId);
        this.log(`ERR ${pair}: ${msg}`);
        // Insufficient balance — stop opening further trades and alert the user.
        if (/insufficient|balance|not enough/i.test(msg)) {
          this.balanceBlocked = true;
          this.log("Insufficient balance — new trades halted");
          void this.raiseAlert(
            "deriv.insufficient_balance",
            `Bot halted new trades — order rejected: ${msg}`,
            { pair, error: msg },
          );
        }
        this.open = this.open.filter((o) => o.id !== pos.id);
        this.emitChange();
        return;
      }
    } else {
      if (pos.dbId)
        await supabase
          .from("bot_trades")
          .update({ status: "open" })
          .eq("id", pos.dbId)
          .then(
            () => {},
            () => {},
          );
      this.log(
        `DRY ${pair} ${direction} ${lot} @ ${entry.toFixed(5)} · TP ${tpPips}p / SL ${slPips}p`,
      );
    }

    // Monitor ticks to detect TP/SL hit.
    this.monitorPosition(pos);
  }

  private monitorPosition(pos: OpenPosition) {
    const s = this.settings!;
    const onTick = (t: { quote: number }) => {
      if (!this.open.some((o) => o.id === pos.id)) return;
      const price = t.quote;
      const hitTp = pos.direction === "BUY" ? price >= pos.tpPrice : price <= pos.tpPrice;
      const hitSl = pos.direction === "BUY" ? price <= pos.slPrice : price >= pos.slPrice;
      if (hitTp) void this.closePosition(pos, pos.tpPrice, "tp");
      else if (hitSl) void this.closePosition(pos, pos.slPrice, "sl");
    };
    try {
      pos.unsubTicks = deriv.subscribeTicks(pos.pair, onTick);
    } catch {
      /* ignore — duration timeout still closes it */
    }
    // Safety timeout — force-close at duration if neither level is hit.
    pos.timeout = window.setTimeout(
      () => {
        if (this.open.some((o) => o.id === pos.id)) {
          void this.closePosition(pos, pos.entry, "timeout");
        }
      },
      Math.max(15, s.durationSec) * 1000,
    );
  }

  private async closePosition(
    pos: OpenPosition,
    exitPrice: number,
    reason: "tp" | "sl" | "timeout" | "manual",
  ) {
    if (!this.open.some((o) => o.id === pos.id)) return;
    this.open = this.open.filter((o) => o.id !== pos.id);
    if (pos.unsubTicks) {
      try {
        pos.unsubTicks();
      } catch {
        /* ignore */
      }
    }
    if (pos.timeout) window.clearTimeout(pos.timeout);

    const ps = pipSize(pos.pair);
    const pips = ((exitPrice - pos.entry) / ps) * (pos.direction === "BUY" ? 1 : -1);
    // PnL must account for pip value per lot, not just raw pips × lots
    const pnl = pips * pos.lot * pipValuePerLot(pos.pair);
    const isWin = reason === "tp" || (reason !== "sl" && pips >= 0);

    this.sessionPnl += pnl;
    this.dailyPnl += pnl;
    if (reason !== "manual") {
      if (isWin) {
        this.wins++;
        this.lastResult = "WIN";
      } else {
        this.losses++;
        this.lastResult = "LOSS";
      }
      // Martingale ladder: grow on loss, reset on win.
      if (this.settings?.positionSizing === "martingale") {
        if (isWin) {
          this.martingaleLot = this.settings.martingaleBase;
        } else {
          this.martingaleLot = Math.min(
            this.settings.martingaleMaxLot,
            this.martingaleLot * this.settings.martingaleMultiplier,
          );
        }
      }
    }

    const closed: ClosedTrade = {
      id: pos.id,
      pair: pos.pair,
      direction: pos.direction,
      lot: pos.lot,
      entry: pos.entry,
      exit: exitPrice,
      tpPips: pos.tpPips,
      slPips: pos.slPips,
      pnl,
      result: isWin ? "WIN" : "LOSS",
      openedAt: pos.openedAt,
      closedAt: Date.now(),
      source: pos.source,
    };
    this.closed.unshift(closed);
    this.closed = this.closed.slice(0, 200);
    this.persistSession();

    if (pos.dbId) {
      try {
        await supabase
          .from("bot_trades")
          .update({ status: "closed", profit: pnl, closed_at: new Date().toISOString() })
          .eq("id", pos.dbId);
      } catch {
        /* ignore */
      }
    }

    const tag = reason === "manual" ? "CLOSE" : reason.toUpperCase();
    this.log(
      `${tag} ${pos.pair} ${pos.direction} ${pos.lot} → ${closed.result} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pips.toFixed(1)}p)`,
    );
    this.emitChange();

    if (this.status === "running") {
      if (this.settings?.mode === "signal") this.processQueue();
      else if (this.settings?.mode === "scalper")
        this.scheduleScalper(Math.max(250, (this.settings?.cooldownSec ?? 1) * 1000));
    }
  }
}

export const botRunner = new BotRunner();
