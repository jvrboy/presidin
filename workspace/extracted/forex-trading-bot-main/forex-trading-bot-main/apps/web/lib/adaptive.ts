/** Adaptive controls from recent trade outcomes */

import { createClient } from '@supabase/supabase-js';

export async function getAdaptiveState(supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: recent } = await supabase
    .from('trades')
    .select('symbol, direction, status, pnl, confidence, opened_at')
    .in('status', ['WON', 'LOST'])
    .order('opened_at', { ascending: false })
    .limit(30);

  const rows = recent || [];
  let streakLoss = 0;
  for (const t of rows) {
    if (t.status === 'LOST' || Number(t.pnl) < 0) streakLoss++;
    else break;
  }

  const bySym: Record<string, { w: number; n: number; pnl: number }> = {};
  for (const t of rows) {
    const s = t.symbol || 'UNK';
    if (!bySym[s]) bySym[s] = { w: 0, n: 0, pnl: 0 };
    bySym[s].n++;
    bySym[s].pnl += Number(t.pnl || 0);
    if (t.status === 'WON' || Number(t.pnl) > 0) bySym[s].w++;
  }

  // Prefer symbols with non-negative sample PnL or winrate >= 0.5
  const preferred = Object.entries(bySym)
    .filter(([, v]) => v.n >= 2 && (v.pnl >= 0 || v.w / v.n >= 0.5))
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([s]) => s);

  const avoided = Object.entries(bySym)
    .filter(([, v]) => v.n >= 2 && v.pnl < 0 && v.w / v.n < 0.4)
    .map(([s]) => s);

  // After 2+ consecutive losses: raise confidence and pause briefly
  const confBump = streakLoss >= 3 ? 0.12 : streakLoss >= 2 ? 0.08 : 0;
  const pauseMs = streakLoss >= 3 ? 10 * 60 * 1000 : streakLoss >= 2 ? 5 * 60 * 1000 : 0;

  return {
    streakLoss,
    confBump,
    pauseMs,
    preferred,
    avoided,
    bySym,
  };
}
