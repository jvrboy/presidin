/** Telegram remote-control bot (long-lived webhook + polling fallback).
 *  Full-featured command surface so operators can run the bot from Telegram alone.
 *
 *  Security: every command checks the sender.id against TELEGRAM_ALLOWED_IDS
 *  (comma-separated env var, falls back to TELEGRAM_CHAT_ID). Unauthorized
 *  updates are silently dropped with a 200 (so we don't leak existence).
 */

import { createServiceClient } from './autonomy';
import { getKv, setKv, isBotEnabled, isPaused, getTradingModeKv } from './settings-kv';

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  edited_message?: TgMessage;
}
export interface TgMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}
export interface TgCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: TgMessage;
  data?: string;
}

const API = (t: string) => `https://api.telegram.org/bot${t}`;

function allowedIds(): Set<number> {
  const raw = process.env.TELEGRAM_ALLOWED_IDS || process.env.TELEGRAM_CHAT_ID || '';
  const ids = raw.split(/[,\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n !== 0);
  return new Set(ids);
}

export function isAuthorized(userId?: number): boolean {
  if (!userId) return false;
  const set = allowedIds();
  return set.size === 0 ? true : set.has(userId); // if unset, allow (dev), but env is required in prod
}

export async function tgApi(method: string, payload: Record<string, unknown>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'no_token' };
  try {
    const res = await fetch(`${API(token)}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export async function tgSend(chatId: number | string, text: string, opts?: { markup?: any; parseMode?: 'HTML' | 'MarkdownV2' }): Promise<any> {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    parse_mode: opts?.parseMode || 'HTML',
    reply_markup: opts?.markup,
    disable_web_page_preview: true,
  });
}

export async function tgEdit(chatId: number | string, messageId: number, text: string, markup?: any): Promise<any> {
  return tgApi('editMessageText', {
    chat_id: chatId, message_id: messageId,
    text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup,
  });
}

export async function tgAnswerCallback(id: string, text?: string, alert = false): Promise<any> {
  return tgApi('answerCallbackQuery', { callback_query_id: id, text: text?.slice(0, 190), show_alert: alert });
}

// ---- Menu keyboards ----
export const KB_MAIN = {
  inline_keyboard: [
    [{ text: '⚡ SIGNALS LIVE', callback_data: 'signals_hub' }],
    [{ text: 'Status', callback_data: 'status' }, { text: 'Positions', callback_data: 'positions' }],
    [{ text: 'PnL', callback_data: 'pnl_today' }, { text: 'Drawdown', callback_data: 'drawdown' }],
    [{ text: 'Markets', callback_data: 'markets' }, { text: 'History', callback_data: 'history' }],
    [{ text: 'Mode', callback_data: 'mode_menu' }, { text: 'Risk', callback_data: 'risk_menu' }],
    [{ text: 'Symbols', callback_data: 'symbols' }, { text: 'AI', callback_data: 'ai_menu' }],
    [{ text: 'Health', callback_data: 'health' }, { text: 'Kill switch', callback_data: 'kill_confirm' }],
  ],
};

export const KB_SIGNALS = {
  inline_keyboard: [
    [{ text: '⚡ SCAN ALL INSTRUMENTS', callback_data: 'sig:every' }],
    [{ text: '🎯 Top setups only', callback_data: 'sig:top' }],
    [{ text: 'Forex', callback_data: 'sig:forex' }, { text: 'Indices', callback_data: 'sig:indices' }],
    [{ text: 'Synthetic', callback_data: 'sig:synthetic' }, { text: 'Crash/Boom', callback_data: 'sig:crashboom' }],
    [{ text: 'EURUSD', callback_data: 'an:frxEURUSD' }, { text: 'GBPUSD', callback_data: 'an:frxGBPUSD' }],
    [{ text: 'USDJPY', callback_data: 'an:frxUSDJPY' }, { text: 'US500', callback_data: 'an:OTC_SPC' }],
    [{ text: 'NAS100', callback_data: 'an:OTC_NDX' }, { text: 'R_50', callback_data: 'an:R_50' }],
    [{ text: 'JD25', callback_data: 'an:JD25' }, { text: 'BOOM1000', callback_data: 'an:BOOM1000' }],
    [{ text: 'Main menu', callback_data: 'main' }],
  ],
};

export const KB_MARKETS = {
  inline_keyboard: [
    [{ text: '⚡ Live signals', callback_data: 'signals_hub' }],
    [{ text: 'Forex majors', callback_data: 'sig:forex' }, { text: 'Stock indices', callback_data: 'sig:indices' }],
    [{ text: 'Volatility / Jump', callback_data: 'sig:synthetic' }, { text: 'Crash / Boom', callback_data: 'sig:crashboom' }],
    [{ text: 'Scan everything', callback_data: 'sig:every' }],
    [{ text: 'Instrument list', callback_data: 'instruments' }],
    [{ text: 'Main menu', callback_data: 'main' }],
  ],
};

export const KB_MODE = {
  inline_keyboard: [
    [{ text: '🔬 Research', callback_data: 'mode:research' }, { text: '📝 Paper', callback_data: 'mode:paper' }],
    [{ text: '👥 Shadow', callback_data: 'mode:shadow' }, { text: '🎮 Demo', callback_data: 'mode:demo' }],
    [{ text: '🎯 Restricted-live', callback_data: 'mode:restricted-live' }, { text: '🚀 Live', callback_data: 'mode:live' }],
    [{ text: '🚨 Emergency stop', callback_data: 'mode:emergency-stop' }],
    [{ text: 'Back', callback_data: 'main' }],
  ],
};

export const KB_KILL_CONFIRM = {
  inline_keyboard: [
    [{ text: '🛑 YES kill now', callback_data: 'kill:on' }, { text: '❌ Cancel', callback_data: 'main' }],
  ],
};

export const KB_BACK = { inline_keyboard: [[{ text: 'Main menu', callback_data: 'main' }]] };

// ---- Command surface ----
export interface CommandContext {
  chatId: number;
  userId?: number;
  args: string[];
  raw: string;
}

const HELP = `<b>🤖 Forex Bot Remote Control</b>

<b>Menu commands:</b>
/menu — open the main control panel
/status — full system snapshot
/positions — open contracts
/pnl [today|week|month] — realized P&amp;L window
/history [n] — last n settled trades (default 10)
/signals — open SIGNALS hub (realtime)
/signals every|forex|indices|synthetic|crashboom|top — group scan
/analyze &lt;symbol&gt; — deep single-instrument signal
/markets — market groups
/instruments — full registry
/replay &lt;trade_id&gt; — trade replay with agent votes
/health — infra + provider health

<b>Controls:</b>
/mode [research|paper|shadow|demo|restricted-live|live|emergency-stop] — set trading mode
/kill — toggle kill switch (asks for confirmation)
/pause &lt;minutes&gt; — pause trading for N minutes
/resume — resume trading
/risk max_daily_loss=&lt;pct&gt; max_trades=&lt;n&gt; symbol_cooldown_ms=&lt;n&gt; — update risk caps
/symbols enable=R_50,R_75  disable=JD25 — watchlist edit
/setweight &lt;source&gt; &lt;multiplier&gt; — per-signal weight override
/ai &lt;prompt&gt; — ask AI committee (Gemini→OpenRouter→Ollama)
/train — kick off Kaggle training job now (async)
/rerun_backtest — trigger walk-forward on latest weights

<b>Info:</b>
/help — this text
/version — commit + deploy id
/subscribe — get real-time trade notifications
/unsubscribe — stop notifications`;

async function fetchStatus(origin: string): Promise<any> {
  try {
    const r = await fetch(`${origin}/api/health`);
    return await r.json();
  } catch {
    return { status: 'unreachable' };
  }
}

async function fetchProvidersStatus(origin: string): Promise<any> {
  try {
    const r = await fetch(`${origin}/api/ai`);
    return await r.json();
  } catch {
    return { ok: false };
  }
}

async function readTradingMode(): Promise<string> {
  const supabase = createServiceClient();
  if (!supabase) return process.env.TRADING_MODE || 'paper';
  return (await getTradingModeKv(supabase)) || process.env.TRADING_MODE || 'paper';
}

async function writeTradingMode(mode: string): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;
  await setKv(supabase, 'trading_mode', mode);
  return true;
}

async function readKill(): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;
  const v = await getKv(supabase, 'kill_switch');
  return v === true || v === 'true';
}

async function writeKill(enabled: boolean): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;
  await setKv(supabase, 'kill_switch', enabled);
  return true;
}

async function readPause(): Promise<{ pausedUntil: number | null }> {
  const supabase = createServiceClient();
  if (!supabase) return { pausedUntil: null };
  const v = Number(await getKv(supabase, 'paused_until'));
  return { pausedUntil: Number.isFinite(v) ? v : null };
}

async function writePause(minutes: number): Promise<number> {
  const supabase = createServiceClient();
  const until = Date.now() + minutes * 60_000;
  if (!supabase) return until;
  await setKv(supabase, 'paused_until', until);
  return until;
}

async function positionsSnapshot(): Promise<{ open: any[]; count: number }> {
  const supabase = createServiceClient();
  if (!supabase) return { open: [], count: 0 };
  const { data } = await supabase.from('trades').select('id,symbol,direction,contract_id,buy_price,entry_epoch,confidence').eq('status', 'open').order('entry_epoch', { ascending: false }).limit(20);
  return { open: data || [], count: data?.length || 0 };
}

async function pnlWindow(days: number): Promise<{ trades: number; wins: number; pnl: number; winRate: number }> {
  const supabase = createServiceClient();
  if (!supabase) return { trades: 0, wins: 0, pnl: 0, winRate: 0 };
  const from = Math.floor((Date.now() - days * 86400_000) / 1000);
  const { data } = await supabase.from('trades').select('profit,status').gte('entry_epoch', from).neq('status', 'open');
  const rows = data || [];
  const wins = rows.filter((r: any) => (r.profit ?? 0) > 0).length;
  const pnl = rows.reduce((a: number, r: any) => a + (Number(r.profit) || 0), 0);
  return { trades: rows.length, wins, pnl, winRate: rows.length ? wins / rows.length : 0 };
}

async function history(n: number): Promise<any[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];
  const { data } = await supabase.from('trades').select('id,symbol,direction,contract_id,buy_price,sell_price,profit,entry_epoch,exit_epoch,status,review_label').neq('status', 'open').order('entry_epoch', { ascending: false }).limit(n);
  return data || [];
}

function fmtPnl(x: number): string {
  const s = x > 0 ? '🟢 +' : x < 0 ? '🔴 ' : '⚪ ';
  return `${s}${x.toFixed(2)}`;
}

function fmtEpoch(ep: number): string {
  return new Date(ep * 1000).toISOString().replace('T', ' ').slice(0, 16);
}


async function fetchSignalBoard(
  origin: string,
  group: string,
  symbol?: string
): Promise<{ text: string; markup?: any }> {
  try {
    let path = '';
    if (group === 'symbol' && symbol) {
      path = `/api/signals?symbol=${encodeURIComponent(symbol)}&limit=1`;
    } else if (group === 'top') {
      path = `/api/signals?group=every&limit=20&actionable=1&min_conf=0.48`;
    } else if (group === 'every' || group === 'all' || group === 'live') {
      path = `/api/signals?group=every&limit=22`;
    } else {
      path = `/api/signals?group=${encodeURIComponent(group)}&limit=12`;
    }
    const r = await fetch(`${origin}${path}`, { cache: 'no-store', headers: { 'x-telegram-probe': '1' } });
    const j = await r.json();
    if (!j.ok) return { text: `Signals error: ${j.error || 'unknown'}`, markup: KB_SIGNALS };

    const plans = j.plans || [];
    if (!plans.length) {
      const errs = (j.errors || []).slice(0, 4).map((e: any) => `• ${e.symbol}: ${e.error}`).join('\n');
      return { text: `No signals returned (${j.scanned || 0} scanned).\n${errs || ''}`, markup: KB_SIGNALS };
    }

    const actionable = plans.filter((p: any) => p.direction !== 'HOLD');
    const holds = plans.length - actionable.length;
    const lines: string[] = [
      `<b>⚡ LIVE SIGNALS</b> · <code>${group}${symbol ? ':' + symbol : ''}</code>`,
      `Scanned <b>${j.scanned}</b> in ${j.durationMs || '?'}ms · Setups <b>${actionable.length}</b> · Hold ${holds}`,
      `Tools: ${(j.tools || []).slice(0, 6).join(' · ')}`,
      ``,
    ];

    const show = (actionable.length ? actionable : plans).slice(0, 10);
    for (const p of show) {
      const dir = p.direction === 'BUY' ? '▲ BUY / CALL' : p.direction === 'SELL' ? '▼ SELL / PUT' : '◆ HOLD';
      const confPct = (Number(p.confidence) * 100).toFixed(0);
      const barN = Math.max(0, Math.min(10, Math.round(Number(p.confidence) * 10)));
      const bar = '▓'.repeat(barN) + '░'.repeat(10 - barN);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`<b>${p.label || p.symbol}</b>  <code>${p.symbol}</code>`);
      lines.push(`${dir}`);
      lines.push(`Conf ${bar} <b>${confPct}%</b>`);
      lines.push(`Entry <code>${p.entry}</code>`);
      lines.push(`TP    <code>${p.tp ?? '—'}</code>`);
      lines.push(`SL    <code>${p.sl ?? '—'}</code>`);
      if (p.riskReward != null) lines.push(`R:R   <code>${p.riskReward}</code> · ATR <code>${p.atr}</code>`);
      if (p.voters != null) lines.push(`Voters <code>${p.voters}</code>${p.quality != null ? ` · Q ${p.quality}` : ''}`);
      if (p.optionsTradable === false) lines.push(`⚠️ Analysis only`);
      if (p.reason) lines.push(`<i>${String(p.reason).slice(0, 110)}</i>`);
      lines.push('');
    }

    if (actionable.length === 0) {
      lines.push(`No high-conviction directional setups right now — market mixed / filters holding.`);
    }

    return { text: lines.join('\n').slice(0, 3900), markup: KB_SIGNALS };
  } catch (e: any) {
    return { text: `Signals failed: ${String(e).slice(0, 240)}`, markup: KB_SIGNALS };
  }
}

// ---- Router ----
export async function handleCommand(ctx: CommandContext, origin: string): Promise<{ text: string; markup?: any }> {
  const cmd = (ctx.raw.split(' ')[0] || '').toLowerCase().replace(/^\//, '').split('@')[0];
  const args = ctx.args;

  switch (cmd) {
    case 'start':
    case 'menu': {
      try {
        const supabase = createServiceClient();
        if (supabase && ctx.chatId) {
          await supabase.from('bot_subscribers').upsert(
            { chat_id: ctx.chatId, active: true, updated_at: new Date().toISOString() },
            { onConflict: 'chat_id' }
          );
          await setKv(supabase, 'last_telegram_chat_id', ctx.chatId);
        }
      } catch { /* non-fatal */ }
      return {
        text: `<b>Forex Bot Control</b>\n\nRegistered chat <code>${ctx.chatId}</code>\nUse the menu or /help.`,
        markup: KB_MAIN,
      };
    }

    case 'help':
      return { text: HELP };

    case 'status': {
      const [health, providers, mode, kill, pause, positions, today] = await Promise.all([
        fetchStatus(origin), fetchProvidersStatus(origin), readTradingMode(), readKill(), readPause(), positionsSnapshot(), pnlWindow(1),
      ]);
      const provTotal = ['gemini', 'openrouter', 'ollama'].reduce((a, p) => a + ((providers?.providers?.[p]?.keys) || 0), 0);
      const pauseTxt = pause.pausedUntil && pause.pausedUntil > Date.now() ? `⏸ paused ${Math.round((pause.pausedUntil - Date.now()) / 60000)}m` : '▶️ active';
      return {
        text: `<b>📊 System Status</b>\n\n` +
          `Mode: <b>${mode}</b>\nKill switch: ${kill ? '🛑 ON' : '✅ off'}\nState: ${pauseTxt}\n` +
          `Health: <b>${health?.status ?? 'unknown'}</b>\nAI providers: <b>${provTotal}</b> keys\n\n` +
          `Open positions: <b>${positions.count}</b>\n` +
          `Today: <b>${today.trades}</b> trades · WR <b>${(today.winRate * 100).toFixed(1)}%</b> · PnL ${fmtPnl(today.pnl)}`,
        markup: KB_MAIN,
      };
    }

    case 'positions': {
      const { open, count } = await positionsSnapshot();
      if (!count) return { text: '📭 No open positions.', markup: KB_BACK };
      const lines = open.map((p: any) => `• <b>${p.symbol}</b> ${p.direction} · buy ${p.buy_price ?? '-'} · conf ${(p.confidence * 100).toFixed(1)}% · id ${p.contract_id ?? p.id}`);
      return { text: `💼 <b>Open positions (${count})</b>\n\n${lines.join('\n')}`, markup: KB_BACK };
    }

    case 'pnl':
    case 'pnl_today': {
      const scope = (args[0] || 'today').toLowerCase();
      const days = scope === 'week' ? 7 : scope === 'month' ? 30 : 1;
      const p = await pnlWindow(days);
      return {
        text: `<b>${scope === 'today' ? 'Today' : scope.charAt(0).toUpperCase() + scope.slice(1)}</b>\n\n` +
          `Trades: <b>${p.trades}</b>\nWins: <b>${p.wins}</b>\nWin rate: <b>${(p.winRate * 100).toFixed(1)}%</b>\nPnL: ${fmtPnl(p.pnl)}`,
        markup: KB_BACK,
      };
    }

    case 'drawdown': {
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      const { data } = await supabase.from('trades').select('profit,entry_epoch').neq('status', 'open').order('entry_epoch', { ascending: true }).limit(500);
      const rows = data || [];
      let running = 0, peak = 0, mdd = 0;
      for (const r of rows) { const v = Number(r.profit) || 0; running += v; if (running > peak) peak = running; if (running - peak < mdd) mdd = running - peak; }
      return { text: `📉 <b>Drawdown (last 500)</b>\n\nCurrent PnL: ${fmtPnl(running)}\nPeak: ${fmtPnl(peak)}\nMax DD: ${fmtPnl(mdd)}`, markup: KB_BACK };
    }

    case 'history': {
      const n = Math.min(Number(args[0] || 10), 30);
      const rows = await history(n);
      if (!rows.length) return { text: '📭 No settled trades yet.', markup: KB_BACK };
      const lines = rows.map((r: any) => {
        const pnl = Number(r.profit) || 0;
        const flag = pnl > 0 ? '🟢' : pnl < 0 ? '🔴' : '⚪';
        const label = r.review_label ? ` [${r.review_label}]` : '';
        return `${flag} <b>${r.symbol}</b> ${r.direction} ${fmtPnl(pnl)}${label}\n   <code>${fmtEpoch(r.entry_epoch)}</code> id=${r.contract_id ?? r.id}`;
      });
      return { text: `📜 <b>Last ${rows.length} trades</b>\n\n${lines.join('\n\n')}`, markup: KB_BACK };
    }

    case 'signals':
    case 'signals_hub': {
      if (cmd === 'signals_hub' || !args[0]) {
        return {
          text:
            `<b>⚡ SIGNALS HUB</b>\n\n` +
            `Realtime confluence using <b>all tools</b>:\n` +
            `indicators · strategies · agents · orderflow tools · ML · neural · MTF 1m/5m\n\n` +
            `Each card: <b>Entry · TP · SL · Confidence</b>\n\n` +
            `Tap <b>SCAN ALL</b> for every instrument, or pick a market / pair.`,
          markup: KB_SIGNALS,
        };
      }
      const group = (args[0] || 'every').toLowerCase();
      return await fetchSignalBoard(origin, group);
    }

    case 'analyze': {
      const sym = args[0];
      if (!sym) return { text: 'Usage: /analyze frxEURUSD', markup: KB_SIGNALS };
      return await fetchSignalBoard(origin, 'symbol', sym);
    }

    case 'markets': {
      return {
        text: `<b>Markets</b>\n\nForex · Indices · Synthetic volatility\nCrash/Boom registered as analysis-only (CFD).\n\nPick a group for ENTRY / TP / SL / CONF cards:`,
        markup: KB_MARKETS,
      };
    }

    case 'instruments': {
      try {
        const r = await fetch(`${origin}/api/instruments`, { cache: 'no-store' });
        const j = await r.json();
        const groups = j.byGroup || {};
        const lines = [`<b>Instrument registry</b> · ${j.count} symbols`, ''];
        for (const [g, items] of Object.entries(groups) as any) {
          lines.push(`<b>${g}</b>`);
          for (const it of items.slice(0, 12)) {
            const flag = it.meta?.optionsTradable === false || it.optionsTradable === false ? '· analysis' : '· trade';
            const label = it.meta?.label || it.label || it.symbol;
            const sym = it.symbol;
            lines.push(`  <code>${sym}</code> ${label} ${flag}`);
          }
          lines.push('');
        }
        return { text: lines.join('\n').slice(0, 3900), markup: KB_MARKETS };
      } catch (e: any) {
        return { text: `Instruments failed: ${String(e).slice(0, 200)}`, markup: KB_BACK };
      }
    }

    case 'replay': {
      const id = args[0];
      if (!id) return { text: 'Usage: /replay &lt;trade_id&gt;', markup: KB_BACK };
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      const { data } = await supabase.from('trades').select('*').or(`id.eq.${id},contract_id.eq.${id}`).limit(1).maybeSingle();
      if (!data) return { text: `Trade ${id} not found.`, markup: KB_BACK };
      const votes = Array.isArray(data.agent_votes) ? data.agent_votes.slice(0, 8) : [];
      const vlines = votes.map((v: any) => `• ${v.name} → ${v.direction} (${(v.confidence * 100).toFixed(0)}%)`).join('\n');
      return {
        text: `🔎 <b>Trade Replay</b>\n\n<b>${data.symbol}</b> ${data.direction} · conf ${((data.confidence || 0) * 100).toFixed(1)}%\n` +
          `Entry ${data.buy_price ?? '-'} · Exit ${data.sell_price ?? 'open'}\nPnL ${fmtPnl(Number(data.profit) || 0)}\n` +
          `Label: ${data.review_label || '—'}\nWhen: ${fmtEpoch(data.entry_epoch)}\n\n` +
          `<b>Top agents:</b>\n${vlines || '—'}`,
        markup: KB_BACK,
      };
    }

    case 'health': {
      const [health, providers, kill, mode] = await Promise.all([fetchStatus(origin), fetchProvidersStatus(origin), readKill(), readTradingMode()]);
      const prov = providers?.providers || {};
      return {
        text: `🩺 <b>Health</b>\n\nAPI: <b>${health?.status ?? '?'}</b>\nMode: <b>${mode}</b>\nKill: ${kill ? '🛑' : '✅'}\n\n` +
          `<b>AI providers</b>\n` +
          `• Gemini keys: ${prov.gemini?.keys || 0}\n• OpenRouter keys: ${prov.openrouter?.keys || 0}\n• Ollama keys: ${prov.ollama?.keys || 0}`,
        markup: KB_BACK,
      };
    }

    case 'mode':
    case 'mode_menu': {
      if (args[0]) {
        const target = args[0].toLowerCase();
        const valid = ['research', 'paper', 'shadow', 'demo', 'restricted-live', 'live', 'emergency-stop'];
        if (!valid.includes(target)) return { text: `Invalid mode. Use one of: ${valid.join(', ')}`, markup: KB_MODE };
        const ok = await writeTradingMode(target);
        return { text: ok ? `✅ Mode set to <b>${target}</b>` : '⚠️ Failed to persist mode.', markup: KB_MAIN };
      }
      const current = await readTradingMode();
      return { text: `<b>⚙️ Trading mode</b>\n\nCurrent: <b>${current}</b>\n\nChoose target mode:`, markup: KB_MODE };
    }

    case 'kill':
    case 'kill_confirm': {
      const state = await readKill();
      if (state) {
        const ok = await writeKill(false);
        return { text: ok ? '✅ Kill switch OFF — trading resumed.' : '⚠️ Failed.', markup: KB_MAIN };
      }
      return { text: `🛑 <b>Kill switch is currently OFF.</b>\n\nEnable it? All new trades will be blocked.`, markup: KB_KILL_CONFIRM };
    }

    case 'pause': {
      const min = Number(args[0] || 30);
      const until = await writePause(min);
      return { text: `⏸ Paused for ${min} min (until <code>${new Date(until).toISOString().slice(11, 19)}Z</code>).`, markup: KB_BACK };
    }

    case 'resume': {
      await writePause(0);
      return { text: '▶️ Resumed.', markup: KB_BACK };
    }

    case 'risk': {
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      const kv: Record<string, any> = {};
      for (const a of args) { const [k, v] = a.split('='); if (k && v) kv[k.trim()] = v.trim(); }
      if (!Object.keys(kv).length) return { text: 'Usage: /risk max_daily_loss=0.03 max_trades=30 symbol_cooldown_ms=300000', markup: KB_BACK };
      for (const [k, v] of Object.entries(kv)) {
        await setKv(supabase, `risk.${k}`, v);
      }
      return { text: `🛡️ Risk updated:\n<code>${JSON.stringify(kv, null, 2)}</code>`, markup: KB_BACK };
    }

    case 'symbols': {
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      const kv: Record<string, string[]> = {};
      for (const a of args) { const [k, v] = a.split('='); if (k && v) kv[k.trim()] = v.split(',').map((s) => s.trim()).filter(Boolean); }
      if (!kv.enable && !kv.disable) {
        const data = { value: await getKv(supabase, 'symbols') };
        return { text: `🔁 Watchlist: <code>${JSON.stringify(data?.value ?? '[]')}</code>\n\nUsage: /symbols enable=R_50,R_75 disable=JD25`, markup: KB_BACK };
      }
      const data = { value: await getKv(supabase, 'symbols') };
      let list: string[] = Array.isArray(data?.value) ? (data!.value as string[]) : [];
      if (kv.enable) list = Array.from(new Set([...list, ...kv.enable]));
      if (kv.disable) list = list.filter((s) => !kv.disable.includes(s));
      await setKv(supabase, 'symbols', list);
      return { text: `🔁 Watchlist updated: <code>${JSON.stringify(list)}</code>`, markup: KB_BACK };
    }

    case 'setweight': {
      const [source, mult] = [args[0], Number(args[1])];
      if (!source || !Number.isFinite(mult)) return { text: 'Usage: /setweight &lt;source&gt; &lt;multiplier&gt;', markup: KB_BACK };
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      await setKv(supabase, `weight.${source}`, mult);
      return { text: `⚖️ Weight override: <b>${source}</b> = ${mult}`, markup: KB_BACK };
    }

    case 'ai': {
      const prompt = args.join(' ').trim();
      if (!prompt) return { text: 'Usage: /ai &lt;prompt&gt;', markup: KB_BACK };
      try {
        const r = await fetch(`${origin}/api/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const j = await r.json();
        return { text: `🤖 <b>${j.provider ?? '?'}</b> (${j.latencyMs ?? 0}ms)\n\n${String(j.text || j.error || '').slice(0, 3500)}`, markup: KB_BACK };
      } catch (e: any) {
        return { text: `⚠️ AI call failed: ${String(e).slice(0, 200)}`, markup: KB_BACK };
      }
    }

    case 'train': {
      const gh = process.env.GITHUB_TOKEN;
      if (!gh) return { text: 'GITHUB_TOKEN not set — cannot trigger training.', markup: KB_BACK };
      try {
        const r = await fetch('https://api.github.com/repos/jvrboy/forex-trading-bot/actions/workflows/export-ticks.yml/dispatches', {
          method: 'POST', headers: { 'Authorization': `Bearer ${gh}`, 'Accept': 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }),
        });
        return { text: r.ok ? '🎓 Training job dispatched.' : `⚠️ Dispatch failed HTTP ${r.status}`, markup: KB_BACK };
      } catch (e: any) {
        return { text: `⚠️ ${String(e).slice(0, 200)}`, markup: KB_BACK };
      }
    }

    case 'version': {
      const sha = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
      const dep = process.env.VERCEL_DEPLOYMENT_ID || 'unknown';
      return { text: `<b>Version</b>\n\nCommit: <code>${sha.slice(0, 12)}</code>\nDeployment: <code>${dep}</code>`, markup: KB_BACK };
    }

    case 'subscribe':
    case 'unsubscribe': {
      const supabase = createServiceClient();
      if (!supabase) return { text: 'Supabase not configured.', markup: KB_BACK };
      const sub = cmd === 'subscribe';
      await supabase.from('bot_subscribers').upsert({ chat_id: ctx.chatId, active: sub, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
      return { text: sub ? '🔔 Subscribed to live trade notifications.' : '🔕 Unsubscribed.', markup: KB_BACK };
    }

    default:
      return { text: `Unknown command <code>/${cmd}</code>. Try /help.`, markup: KB_BACK };
  }
}

export async function handleCallback(ctx: CommandContext, data: string, origin: string): Promise<{ text: string; markup?: any }> {
  const [prefix, arg] = data.split(':');
  switch (prefix) {
    case 'main': return handleCommand({ ...ctx, raw: '/menu', args: [] }, origin);
    case 'status': return handleCommand({ ...ctx, raw: '/status', args: [] }, origin);
    case 'positions': return handleCommand({ ...ctx, raw: '/positions', args: [] }, origin);
    case 'pnl_today': return handleCommand({ ...ctx, raw: '/pnl today', args: ['today'] }, origin);
    case 'drawdown': return handleCommand({ ...ctx, raw: '/drawdown', args: [] }, origin);
    case 'signals':
    case 'signals_hub':
      return handleCommand({ ...ctx, raw: '/signals', args: [] }, origin);
    case 'markets': return handleCommand({ ...ctx, raw: '/markets', args: [] }, origin);
    case 'instruments': return handleCommand({ ...ctx, raw: '/instruments', args: [] }, origin);
    case 'sig': return handleCommand({ ...ctx, raw: `/signals ${arg}`, args: [arg || 'every'] }, origin);
    case 'an': return handleCommand({ ...ctx, raw: `/analyze ${arg}`, args: [arg] }, origin);
    case 'history': return handleCommand({ ...ctx, raw: '/history 10', args: ['10'] }, origin);
    case 'health': return handleCommand({ ...ctx, raw: '/health', args: [] }, origin);
    case 'symbols': return handleCommand({ ...ctx, raw: '/symbols', args: [] }, origin);
    case 'risk_menu': return { text: `🛡️ <b>Risk controls</b>\n\nSend: /risk max_daily_loss=0.03 max_trades=30 symbol_cooldown_ms=300000`, markup: KB_BACK };
    case 'ai_menu': return { text: `🤖 <b>AI committee</b>\n\nSend: /ai &lt;your prompt&gt;`, markup: KB_BACK };
    case 'mode_menu': return handleCommand({ ...ctx, raw: '/mode', args: [] }, origin);
    case 'mode': return handleCommand({ ...ctx, raw: `/mode ${arg}`, args: [arg] }, origin);
    case 'kill_confirm': return handleCommand({ ...ctx, raw: '/kill', args: [] }, origin);
    case 'kill': {
      if (arg === 'on') { await writeKill(true); return { text: '🛑 Kill switch <b>ENABLED</b>. All new trades blocked.', markup: KB_MAIN }; }
      return { text: 'cancelled.', markup: KB_MAIN };
    }
    default: return { text: 'Unknown action.', markup: KB_MAIN };
  }
}
