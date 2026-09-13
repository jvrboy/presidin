/** Telegram alert helper */

export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    const body = await res.json();
    if (!body.ok) return { ok: false, error: body.description || 'send failed' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function alertTrade(msg: string) {
  return sendTelegram(`📈 ${msg}`);
}

export async function alertError(msg: string) {
  return sendTelegram(`⚠️ ${msg}`);
}

export async function alertKill(enabled: boolean) {
  return sendTelegram(enabled ? '✅ Bot ENABLED' : '🛑 Bot KILLED (kill-switch)');
}

export async function alertDrawdown(pnl: number, limit: number) {
  return sendTelegram(`📉 Daily PnL ${pnl.toFixed(2)} hit/near limit -${Math.abs(limit)}`);
}


export async function alertSignalPlan(plan: {
  symbol: string;
  label?: string;
  direction: string;
  confidence: number;
  entry?: number;
  tp?: number | null;
  sl?: number | null;
  reason?: string;
}) {
  const dir = plan.direction === 'BUY' ? '▲ BUY' : plan.direction === 'SELL' ? '▼ SELL' : '◆ HOLD';
  const conf = (plan.confidence * 100).toFixed(0);
  const lines = [
    `⚡ SIGNAL ${plan.label || plan.symbol}`,
    `${dir} · ${conf}%`,
    plan.entry != null ? `Entry ${plan.entry}` : '',
    plan.tp != null ? `TP ${plan.tp}` : '',
    plan.sl != null ? `SL ${plan.sl}` : '',
    plan.reason ? String(plan.reason).slice(0, 120) : '',
  ].filter(Boolean);
  return sendTelegram(lines.join('\n'));
}
