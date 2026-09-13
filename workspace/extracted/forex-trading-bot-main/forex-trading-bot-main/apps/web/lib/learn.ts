/** Learn from WHAT SIGNAL was wrong — not from direction labels */

import { createClient } from '@supabase/supabase-js';

export interface Lesson {
  symbol: string;
  direction: string;
  reason: string;
  source: string;
  pnl: number;
  fault_signals?: string[];
  dissenting_ignored?: string[];
  gates_that_should_block?: string[];
}

/** After a loss, record the signals that justified the trade (the real cause) */
export async function recordLesson(
  supabaseUrl: string,
  supabaseKey: string,
  lesson: Lesson
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const faults = lesson.fault_signals?.length
    ? lesson.fault_signals
    : String(lesson.source || '')
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);

  await supabase.from('bot_logs').insert({
    level: 'warn',
    message: 'trade_lesson',
    meta: {
      type: 'loss_lesson',
      symbol: lesson.symbol,
      direction: lesson.direction,
      pnl: lesson.pnl,
      source: faults.join('+') || lesson.source,
      fault_signals: faults,
      dissenting_ignored: lesson.dissenting_ignored || [],
      gates_that_should_block: lesson.gates_that_should_block || [],
      lesson:
        lesson.pnl < 0
          ? `Fault signals [${faults.slice(0, 6).join(', ')}] agreed with ${lesson.direction} on ${lesson.symbol} and lost — down-weight those voters`
          : 'win',
      at: new Date().toISOString(),
    },
  });
}

/**
 * Penalties keyed by indicator/strategy/tool NAME.
 * Built from:
 *  1) latest voter_calibration log (deep replay)
 *  2) recent trade_lesson fault_signals counts
 */
export async function loadLossPenalties(
  supabaseUrl: string,
  supabaseKey: string
): Promise<Record<string, number>> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const penalties: Record<string, number> = {};

  // 1) Deep calibration snapshot
  const { data: calibRows } = await supabase
    .from('bot_logs')
    .select('meta')
    .eq('message', 'voter_calibration')
    .order('created_at', { ascending: false })
    .limit(1);

  const calib = calibRows?.[0]?.meta?.penalties || calibRows?.[0]?.meta?.reliability;
  if (calib && typeof calib === 'object') {
    for (const [k, v] of Object.entries(calib)) {
      if (typeof v === 'number') penalties[k] = v;
      else if (v && typeof (v as any).penalty === 'number') penalties[k] = (v as any).penalty;
    }
  }

  // 2) Recent fault_signals from lessons (online learning)
  const { data } = await supabase
    .from('bot_logs')
    .select('meta')
    .eq('message', 'trade_lesson')
    .order('created_at', { ascending: false })
    .limit(60);

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const m = row.meta || {};
    if (Number(m.pnl) >= 0) continue;
    const faults: string[] = Array.isArray(m.fault_signals)
      ? m.fault_signals
      : String(m.source || '')
          .split('+')
          .map((s: string) => s.trim())
          .filter(Boolean);
    for (const f of faults) {
      // strip prefixes strat: tool: agent:
      const name = f.replace(/^(strat|tool|agent):/, '').split('/')[0];
      if (!name || name === 'unknown') continue;
      counts[name] = (counts[name] || 0) + 1;
    }
  }

  for (const [k, n] of Object.entries(counts)) {
    // more times a signal agreed with a loss → stronger penalty
    const p = Math.max(0.40, 1 - n * 0.06);
    penalties[k] = penalties[k] != null ? Math.min(penalties[k], p) : p;
  }

  // Known toxic combo members get a floor penalty from analysis
  const toxic = ['stoch', 'rsi', 'mean_rev', 'bb'];
  for (const t of toxic) {
    if (counts[t] && counts[t] >= 3) {
      penalties[t] = Math.min(penalties[t] ?? 1, 0.55);
    }
  }

  return penalties;
}

/**
 * Detect toxic signal stacks that repeatedly caused losses.
 * Returns true if this vote set looks like a known loss combo.
 */
export function isToxicSignalStack(voterNames: string[]): boolean {
  const set = new Set(
    voterNames.map((n) => n.replace(/^(strat|tool|agent):/, '').split('/')[0])
  );
  // ×7 losses: adx_regime + breakout + ema_cross + macd + trend_follow
  const trendStack = ['adx_regime', 'breakout', 'ema_cross', 'macd', 'trend_follow'];
  if (trendStack.filter((x) => set.has(x)).length >= 4) {
    // only toxic if RSI/stoch mean-rev also not providing counter-signal diversity
    // Actually the combo itself lost 7 times when all agreed — require high agreement caution
    return trendStack.filter((x) => set.has(x)).length >= 5;
  }
  // ×4 losses: bb + mean_rev + rsi + stoch (mean-reversion stack)
  const mrStack = ['bb', 'mean_rev', 'rsi', 'stoch'];
  if (mrStack.filter((x) => set.has(x)).length >= 3) return true;
  return false;
}
