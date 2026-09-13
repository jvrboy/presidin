/**
 * Signal ledger + voter calibration from actual fault signals.
 */

import { createClient } from '@supabase/supabase-js';

export type VoterWeights = Record<string, number>;

const DEFAULT_WEIGHT = 1;

export async function loadVoterCalibration(
  supabaseUrl: string,
  supabaseKey: string
): Promise<VoterWeights> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const weights: VoterWeights = {};

    // Prefer deep replay calibration
    const { data: calibRows } = await supabase
      .from('bot_logs')
      .select('meta')
      .eq('message', 'voter_calibration')
      .order('created_at', { ascending: false })
      .limit(1);

    const penalties = calibRows?.[0]?.meta?.penalties;
    if (penalties && typeof penalties === 'object') {
      for (const [k, v] of Object.entries(penalties)) {
        if (typeof v === 'number') weights[k] = v;
      }
    }

    // Blend with trade signal_source outcomes
    const { data } = await supabase
      .from('trades')
      .select('status, pnl, signal_source, confidence')
      .in('status', ['WON', 'LOST'])
      .order('opened_at', { ascending: false })
      .limit(100);

    if (data?.length) {
      const stats: Record<string, { w: number; n: number }> = {};
      for (const t of data) {
        const parts = String(t.signal_source || 'unknown')
          .split('+')
          .map((s: string) => s.trim())
          .filter(Boolean);
        const win = t.status === 'WON' || Number(t.pnl) > 0;
        for (const key of parts.slice(0, 8)) {
          const name = key.replace(/^(strat|tool|agent):/, '').split('/')[0];
          if (!stats[name]) stats[name] = { w: 0, n: 0 };
          stats[name].w += win ? 1 : 0;
          stats[name].n += 1;
        }
      }
      for (const [k, v] of Object.entries(stats)) {
        if (v.n < 3) continue;
        const wr = v.w / v.n;
        const w = Math.max(0.45, Math.min(1.35, 0.5 + wr * 0.85));
        weights[k] = weights[k] != null ? Math.min(weights[k], w) : w;
      }
    }
    return weights;
  } catch {
    return {};
  }
}

export function applyCalibration(
  voterName: string,
  baseWeight: number,
  calibration: VoterWeights
): number {
  const bare = voterName.replace(/^(strat|tool|agent):/, '').split('/')[0];
  const keys = [voterName, bare, voterName.split(':')[0]];
  for (const k of keys) {
    if (calibration[k] != null) return baseWeight * calibration[k];
  }
  return baseWeight * DEFAULT_WEIGHT;
}
