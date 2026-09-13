import type { BotSettings, Trade, Signal } from './types';

export function canOpenTrade(
  settings: BotSettings,
  openTrades: Trade[],
  dailyPnl: number,
  signal: Signal
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
  // Simple correlation check: no second trade on same symbol
  if (openTrades.some((t) => t.symbol === signal.symbol)) {
    return { allowed: false, reason: `Already have open position on ${signal.symbol}` };
  }
  return { allowed: true };
}
