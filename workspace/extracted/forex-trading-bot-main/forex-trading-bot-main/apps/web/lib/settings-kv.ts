/** Unified settings access.
 *  - Legacy trading row: bot_settings id=1 (bot_enabled, stake, symbols, …)
 *  - KV store: bot_kv key/value (trading_mode, kill_switch, paused_until, …)
 *  Falls back to reading bot_settings(key) if bot_kv missing (compat with prior migration).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

async function fromKvTable(supabase: SupabaseClient, key: string): Promise<{ found: boolean; value?: any }> {
  try {
    const { data, error } = await supabase.from('bot_kv').select('value').eq('key', key).maybeSingle();
    if (!error && data) return { found: true, value: data.value };
  } catch {
    /* table may not exist */
  }
  try {
    const { data, error } = await supabase.from('bot_settings').select('value').eq('key', key).maybeSingle();
    if (!error && data && 'value' in data) return { found: true, value: (data as any).value };
  } catch {
    /* legacy row schema has no key column */
  }
  return { found: false };
}

export async function getKv(supabase: SupabaseClient, key: string): Promise<any> {
  const r = await fromKvTable(supabase, key);
  return r.found ? r.value : undefined;
}

export async function setKv(supabase: SupabaseClient, key: string, value: unknown) {
  const row = { key, value, updated_at: new Date().toISOString() };
  // Prefer bot_kv
  const { error } = await supabase.from('bot_kv').upsert(row, { onConflict: 'key' });
  if (error) {
    // Fallback to bot_settings key schema if present
    await supabase.from('bot_settings').upsert(row, { onConflict: 'key' });
  }
}

export async function isBotEnabled(supabase: SupabaseClient): Promise<boolean> {
  const kv = await getKv(supabase, 'kill_switch');
  if (typeof kv === 'boolean') return !kv;
  const { data } = await supabase.from('bot_settings').select('bot_enabled').eq('id', 1).maybeSingle();
  return data?.bot_enabled !== false;
}

export async function isPaused(supabase: SupabaseClient): Promise<{ paused: boolean; until: number }> {
  const until = Number((await getKv(supabase, 'paused_until')) || 0);
  return { paused: until > Date.now(), until };
}

export async function getTradingModeKv(supabase: SupabaseClient): Promise<string> {
  const v = await getKv(supabase, 'trading_mode');
  if (typeof v === 'string') return v;
  return process.env.TRADING_MODE || (process.env.ENABLE_LIVE_TRADES === 'true' ? 'demo' : 'paper');
}
