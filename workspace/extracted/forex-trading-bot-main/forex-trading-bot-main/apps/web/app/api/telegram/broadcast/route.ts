import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/autonomy';
import { tgSend } from '@/lib/telegram-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Broadcast a trade event to all active subscribers.
 *  Called internally from tick/settlement handlers, or externally via POST.
 */
export async function POST(request: Request) {
  const secret = process.env.HEARTBEAT_SECRET;
  if (secret && request.headers.get('x-heartbeat-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({} as any));
  const message = String(body.message || '').slice(0, 3800);
  const kind = body.kind || 'info';
  if (!message) return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 });

  const emoji = ({ trade_open: '📈', trade_close: '💰', kill: '🛑', warn: '⚠️', info: 'ℹ️', error: '🔥' } as Record<string, string>)[kind] || 'ℹ️';
  const text = `${emoji} <b>${kind}</b>\n${message}`;

  const supabase = createServiceClient();
  const targets: number[] = [];
  if (supabase) {
    const { data } = await supabase.from('bot_subscribers').select('chat_id').eq('active', true).limit(200);
    for (const r of data || []) targets.push(Number(r.chat_id));
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId && !targets.includes(Number(chatId))) targets.push(Number(chatId));

  const results = await Promise.allSettled(targets.map((t) => tgSend(t, text)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ ok: true, sent: ok, targets: targets.length });
}
