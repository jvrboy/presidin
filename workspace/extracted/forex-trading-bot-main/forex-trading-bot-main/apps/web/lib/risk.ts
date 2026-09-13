import type { BotSettings, Trade, Signal } from './types';
import { GATED_V8, chopAllowed } from './gated-config';

export interface RiskContext {
  tradesToday?: number;
  maxTradesPerDay?: number;
  lastTradeBySymbol?: Record<string, number>; // epoch ms
  cooldownMs?: number;
  openSymbols?: string[];
  /** Choppiness 0-100 — gated_v8 only trades 30-70 */
  chop?: number;
  /** Count of strong agreeing top voters */
  topAgree?: number;
  /** Blender probability if available */
  blenderProb?: number;
  enforceGatedV8?: boolean;
}

const CORRELATED = [
  ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
  ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
  ['JD10', 'JD25', 'JD50', 'JD75', 'JD100'],
  ['DSI10', 'DSI20', 'DSI30'],
  ['frxEURUSD', 'frxGBPUSD', 'frxAUDUSD', 'frxNZDUSD'],
  ['frxUSDJPY', 'frxUSDCHF', 'frxUSDCAD'],
  ['OTC_SPC', 'OTC_NDX', 'OTC_DJI'],
  ['OTC_GDAXI', 'OTC_FTSE', 'OTC_FCHI'],
];

export function canOpenTrade(
  settings: BotSettings,
  openTrades: Trade[],
  dailyPnl: number,
  signal: Signal,
  ctx: RiskContext = {}
): { allowed: boolean; reason?: string } {
  if (!settings.bot_enabled) {
    return { allowed: false, reason: 'Bot is disabled (kill-switch)' };
  }
  if (signal.direction === 'HOLD') {
    return { allowed: false, reason: 'Signal is HOLD' };
  }
  if (signal.confidence < settings.confidence_threshold) {
    return {
      allowed: false,
      reason: `Confidence ${signal.confidence.toFixed(2)} < threshold ${settings.confidence_threshold}`,
    };
  }

  const enforce = ctx.enforceGatedV8 !== false && process.env.COLLECT_MODE !== 'true' && process.env.COLLECT_MODE !== '1';
  if (enforce) {
    if (ctx.chop != null && !chopAllowed(ctx.chop, GATED_V8)) {
      return { allowed: false, reason: `Chop ${ctx.chop.toFixed(1)} outside ${GATED_V8.CHOP_MIN}-${GATED_V8.CHOP_MAX}` };
    }
    if (ctx.topAgree != null && ctx.topAgree < GATED_V8.REQUIRE_TOP) {
      return { allowed: false, reason: `Top agree ${ctx.topAgree} < require ${GATED_V8.REQUIRE_TOP}` };
    }
    if (ctx.blenderProb != null && ctx.blenderProb < GATED_V8.BLENDER_MIN && (ctx.topAgree ?? 0) < GATED_V8.REQUIRE_TOP) {
      return { allowed: false, reason: `Blender ${ctx.blenderProb.toFixed(3)} < ${GATED_V8.BLENDER_MIN}` };
    }
  }
  if (openTrades.length >= settings.max_open_positions) {
    return {
      allowed: false,
      reason: `Max open positions reached (${settings.max_open_positions})`,
    };
  }
  if (dailyPnl <= -Math.abs(settings.max_daily_loss)) {
    return {
      allowed: false,
      reason: `Daily loss limit hit (${dailyPnl.toFixed(2)})`,
    };
  }
  if (openTrades.some((t) => t.symbol === signal.symbol)) {
    return { allowed: false, reason: `Already have open position on ${signal.symbol}` };
  }

  const collect = process.env.COLLECT_MODE === 'true' || process.env.COLLECT_MODE === '1';
  const maxDay = ctx.maxTradesPerDay ?? Number(process.env.MAX_TRADES_PER_DAY || (collect ? 2500 : 30));
  if (ctx.tradesToday != null && ctx.tradesToday >= maxDay) {
    return { allowed: false, reason: `Max trades/day reached (${maxDay})` };
  }

  
  const cooldown = ctx.cooldownMs ?? Number(process.env.SYMBOL_COOLDOWN_MS || (collect ? 12000 : 120000));
  const last = ctx.lastTradeBySymbol?.[signal.symbol];
  if (last && Date.now() - last < cooldown) {
    return { allowed: false, reason: `Cooldown ${signal.symbol} (${Math.ceil((cooldown - (Date.now() - last)) / 1000)}s)` };
  }

  // Correlation cap: at most 2 open in same vol family
  const openSyms = openTrades.map((t) => t.symbol);
  for (const family of CORRELATED) {
    if (!family.includes(signal.symbol)) continue;
    const count = openSyms.filter((s) => family.includes(s)).length;
    if (count >= 2) {
      return { allowed: false, reason: `Correlation cap on volatility family (${count} open)` };
    }
  }

  return { allowed: true };
}

/** Prefer synthetics 24/7; on weekends force R_* only */
export function resolveSymbols(configured: string[]): string[] {
  const day = new Date().getUTCDay(); // 0 Sun … 6 Sat
  const weekend = day === 0 || day === 6;
  const synthetics = configured.filter((s) => s.startsWith('R_') || s.startsWith('1HZ'));
  const fx = configured.filter((s) => !s.startsWith('R_') && !s.startsWith('1HZ'));
  if (weekend) {
    return (synthetics.length ? synthetics : ['R_100', 'R_75', 'R_50']).slice(0, 5);
  }
  // weekdays: allow fx if present, else synthetics
  const mixed = [...synthetics, ...fx];
  return (mixed.length ? mixed : ['R_100', 'R_75', 'R_50']).slice(0, 5);
}

export function pickDuration(confidence: number): { duration: number; duration_unit: 't' | 'm' } {
  if (confidence >= 0.75) return { duration: 10, duration_unit: 't' };
  if (confidence >= 0.65) return { duration: 7, duration_unit: 't' };
  return { duration: 5, duration_unit: 't' };
}
