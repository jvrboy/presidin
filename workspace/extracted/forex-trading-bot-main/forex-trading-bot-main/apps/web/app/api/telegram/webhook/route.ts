import { NextResponse } from 'next/server';
import { handleCommand, handleCallback, isAuthorized, tgSend, tgEdit, tgAnswerCallback, type TgUpdate } from '@/lib/telegram-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST from Telegram. Auth is user-id allowlist (or open if unset). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'telegram-bot',
    hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hasAllowed: Boolean(process.env.TELEGRAM_ALLOWED_IDS || process.env.TELEGRAM_CHAT_ID),
  });
}

export async function POST(request: Request) {
  // Optional secret: only enforce when BOTH env and header present+nonempty.
  // This avoids silent drops when Telegram is registered without secret_token.
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const incoming = (request.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  if (secret && incoming && secret !== incoming) {
    return NextResponse.json({ ok: true, skipped: 'bad-secret' });
  }

  let update: TgUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true, skipped: 'bad-json' });
  }

  const origin = new URL(request.url).origin;

  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      if (!isAuthorized(cb.from.id)) {
        await tgAnswerCallback(cb.id, 'not authorized — send /start first', true);
        return NextResponse.json({ ok: true, skipped: 'unauthorized' });
      }
      const ctx = { chatId: cb.message?.chat.id ?? cb.from.id, userId: cb.from.id, args: [], raw: '' };
      const reply = await handleCallback(ctx, cb.data || '', origin);
      await tgAnswerCallback(cb.id);
      if (cb.message?.message_id) {
        await tgEdit(ctx.chatId, cb.message.message_id, reply.text, reply.markup);
      } else {
        await tgSend(ctx.chatId, reply.text, { markup: reply.markup });
      }
      return NextResponse.json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    if (!msg?.text) return NextResponse.json({ ok: true, skipped: 'no-text' });

    const text = msg.text.trim();
    const userId = msg.from?.id;
    const chatId = msg.chat.id;

    const isBootstrap = /^\/(start|subscribe|help)(@\w+)?(\s|$)/i.test(text);
    if (!isBootstrap && !isAuthorized(userId)) {
      if (text.startsWith('/')) {
        await tgSend(
          chatId,
          'Not authorized. Send /start to register.\nYour Telegram id: <code>' + String(userId) + '</code>'
        );
      }
      return NextResponse.json({ ok: true, skipped: 'unauthorized', userId });
    }

    if (!text.startsWith('/')) return NextResponse.json({ ok: true, skipped: 'not-command' });

    const parts = text.split(/\s+/);
    const ctx = { chatId, userId, args: parts.slice(1), raw: text };
    const reply = await handleCommand(ctx, origin);
    const sendRes = await tgSend(chatId, reply.text, { markup: reply.markup });
    return NextResponse.json({ ok: true, sent: sendRes?.ok === true });
  } catch (e: any) {
    return NextResponse.json({ ok: true, error: String(e).slice(0, 300) });
  }
}
