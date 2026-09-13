// Auto-trader bot settings persisted in localStorage (client-only).

export type BotMode = "off" | "signal" | "scalper";
export type PositionSizing = "fixed" | "martingale";
export type TpSource = "fixed" | "system";

export interface BotSettings {
  // ── Core mode ────────────────────────────────────────────────
  // off      → fully inactive, no trades, no monitoring.
  // signal   → trades each new signal from the engine (1 per signal).
  // scalper  → perpetual scalper: opens/closes trades in rapid succession 24/7.
  mode: BotMode;

  accountType: "demo" | "real";
  token: string; // Deriv API token (real or demo)
  instruments: string[]; // e.g. ["R_100", "frxEURUSD"]

  // ── Position sizing ──────────────────────────────────────────
  positionSizing: PositionSizing;
  lotSize: number; // FIXED LOT: exact lot per trade (min 0.01)
  martingaleBase: number; // MARTINGALE: starting lot
  martingaleMultiplier: number; // MARTINGALE: lot multiplier applied after a loss
  martingaleMaxLot: number; // MARTINGALE: hard cap to stop explosive growth

  // ── Risk / position management ───────────────────────────────
  maxOpen: number; // max concurrently open trades (1-500)
  cooldownSec: number; // min seconds between consecutive trade openings
  durationSec: number; // max trade lifetime before forced close (scalper target)
  dailyLossCap: number; // halt bot if cumulative session loss reaches this

  // ── Take profit / stop loss ──────────────────────────────────
  tpSource: TpSource; // fixed → use fixedTpPips ; system → use signal/engine TP
  fixedTpPips: number; // FIXED TP (pips) applied to every trade
  scalperTpPips: number; // scalper take profit (pips)
  scalperSlPips: number; // scalper stop loss (pips)

  // ── Signal-mode self-scan (generates signals when no external producer) ─
  minScore: number; // signals at/above this score auto-trade
  scanIntervalSec: number;
  scanTimeframe: "M1" | "M5" | "M15" | "M30" | "H1";

  // ── Guardrails ───────────────────────────────────────────────
  allowWeekends: boolean; // when false, block opening trades on Sat/Sun (synthetics exempt)
  avoidLowLiquidity: boolean; // when true, block forex/indices during the low-liquidity window below
  lowLiqStartUtc: number; // UTC hour (0-23) the low-liquidity window starts
  lowLiqEndUtc: number; // UTC hour (0-23) the low-liquidity window ends (may wrap past midnight)
  minBalance: number; // stop opening new trades if account balance falls at/below this (real mode)

  // legacy flag kept for migration (no longer surfaced in UI)
  enabled?: boolean;
  selfScan?: boolean;
}

const KEY = "div-iq/bot-settings/v4";
const LEGACY_KEYS = ["div-iq/bot-settings/v3", "div-iq/bot-settings/v2", "div-iq/bot-settings/v1"];

export const MAX_CONCURRENT_TRADES = 500;

export const DEFAULT_BOT: BotSettings = {
  mode: "off",
  accountType: "demo",
  token: "",
  // Mix of synthetics + a major FX pair — gives the bot real volume on
  // any day of the week (R_100/R_75 are 24/7).
  instruments: ["R_100", "R_75", "frxEURUSD"],

  positionSizing: "fixed",
  lotSize: 0.01,
  martingaleBase: 0.01,
  martingaleMultiplier: 2.0,
  martingaleMaxLot: 0.1, // ~10× base by default

  maxOpen: 3,
  cooldownSec: 5,
  durationSec: 180,
  dailyLossCap: 50,

  tpSource: "fixed",
  fixedTpPips: 50,
  scalperTpPips: 30,
  scalperSlPips: 30,

  minScore: 70,
  scanIntervalSec: 30,
  scanTimeframe: "M5",

  allowWeekends: false,
  avoidLowLiquidity: false,
  lowLiqStartUtc: 21, // 21:00 UTC (NY close) …
  lowLiqEndUtc: 23, //  … to 23:00 UTC — thin, wide-spread hours
  minBalance: 0,
};

function migrate(raw: Partial<BotSettings> & Record<string, unknown>): BotSettings {
  const merged = { ...DEFAULT_BOT, ...raw };
  // Map legacy `enabled` + `selfScan` to the new `mode` if `mode` is absent.
  if (!raw.mode) {
    merged.mode = raw.enabled ? "signal" : "off";
  }
  // Clamp max open to the hard limit.
  merged.maxOpen = Math.min(MAX_CONCURRENT_TRADES, Math.max(1, Math.round(merged.maxOpen)));
  return merged;
}

export function loadBot(): BotSettings {
  if (typeof window === "undefined") return DEFAULT_BOT;
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) return migrate(JSON.parse(cur));
    for (const lk of LEGACY_KEYS) {
      const legacy = localStorage.getItem(lk);
      if (legacy) {
        const migrated = migrate(JSON.parse(legacy));
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_BOT;
}

export function saveBot(s: BotSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

// ── Validation ─────────────────────────────────────────────────
export function validateSettings(s: BotSettings): string[] {
  const errors: string[] = [];
  if (s.instruments.length === 0) errors.push("Pick at least one instrument.");

  if (s.positionSizing === "fixed") {
    if (!Number.isFinite(s.lotSize) || s.lotSize < 0.01)
      errors.push("Fixed lot size must be at least 0.01.");
  } else {
    if (!Number.isFinite(s.martingaleBase) || s.martingaleBase < 0.01)
      errors.push("Martingale base lot must be at least 0.01.");
    if (!Number.isFinite(s.martingaleMultiplier) || s.martingaleMultiplier <= 1)
      errors.push("Martingale multiplier must be greater than 1.");
    if (!Number.isFinite(s.martingaleMaxLot) || s.martingaleMaxLot < s.martingaleBase)
      errors.push("Martingale max lot must be ≥ base lot.");
  }

  if (!Number.isFinite(s.maxOpen) || s.maxOpen < 1 || s.maxOpen > MAX_CONCURRENT_TRADES) {
    errors.push(`Max concurrent trades must be between 1 and ${MAX_CONCURRENT_TRADES}.`);
  }

  if (s.tpSource === "fixed" && (!Number.isFinite(s.fixedTpPips) || s.fixedTpPips <= 0)) {
    errors.push("Fixed TP (pips) must be greater than 0.");
  }
  if (s.mode === "scalper") {
    if (!Number.isFinite(s.scalperTpPips) || s.scalperTpPips <= 0)
      errors.push("Scalper TP (pips) must be greater than 0.");
    if (!Number.isFinite(s.scalperSlPips) || s.scalperSlPips <= 0)
      errors.push("Scalper SL (pips) must be greater than 0.");
  }
  if (!Number.isFinite(s.dailyLossCap) || s.dailyLossCap <= 0)
    errors.push("Daily loss cap must be greater than 0.");
  if (!Number.isFinite(s.cooldownSec) || s.cooldownSec < 0)
    errors.push("Cooldown must be 0 or greater.");
  if (!Number.isFinite(s.minBalance) || s.minBalance < 0)
    errors.push("Minimum balance must be 0 or greater.");
  if (s.avoidLowLiquidity) {
    const okHour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
    if (!okHour(s.lowLiqStartUtc) || !okHour(s.lowLiqEndUtc))
      errors.push("Low-liquidity hours must be whole numbers between 0 and 23.");
    if (s.lowLiqStartUtc === s.lowLiqEndUtc)
      errors.push("Low-liquidity start and end hours must differ.");
  }
  return errors;
}

// True when `now` falls inside the configured low-liquidity UTC window.
// The window may wrap past midnight (e.g. 21 → 2).
export function isLowLiquidityHour(s: BotSettings, now: Date = new Date()): boolean {
  if (!s.avoidLowLiquidity) return false;
  const h = now.getUTCHours();
  const { lowLiqStartUtc: start, lowLiqEndUtc: end } = s;
  if (start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

// ── Pip helpers ────────────────────────────────────────────────
// Returns the pip size for a given Deriv symbol so TP/SL in "pips" can be
// converted to absolute price distances.
export function pipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (/JPY$/.test(s)) return 0.01; // JPY forex pairs
  if (/XAU|GOLD/.test(s)) return 0.1; // gold — pip is 0.1, not 0.0001
  if (/XAG|SILVER/.test(s)) return 0.01; // silver
  if (/^FRX/.test(s)) return 0.0001; // standard forex
  if (/^CRY/.test(s)) return 1; // crypto — 1 unit ≈ 1 "pip"
  if (/^R_|HZ|BOOM|CRASH|JD/.test(s)) return 0.1; // synthetics
  return 0.1; // indices / stocks fallback
}

/**
 * USD value of 1 pip for 1.0 lot of the symbol.
 * Forex standard lots are 100k units; metals use their typical contract sizes.
 */
export function pipValuePerLot(symbol: string): number {
  const s = symbol.toUpperCase();
  if (/XAU|GOLD/.test(s)) return 10; // 100 oz × 0.1
  if (/XAG|SILVER/.test(s)) return 50; // 5000 oz × 0.01
  if (/^CRY/.test(s)) return 1; // crypto quoted in USD per unit
  return pipSize(symbol) * 100_000; // fx: e.g. EURUSD → $10/pip/lot
}
