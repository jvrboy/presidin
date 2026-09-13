import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DerivClient } from '../../../lib/deriv-client';
import { liveExecutionAllowed, tradingMode } from '../../../lib/autonomy';
import { isOptionsTradable, instrumentLabel } from '../../../lib/instruments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Manual trade from Telegram / dashboard.
 * Body: { direction: 'BUY'|'SELL', symbol: string, stake?: number, duration?: number }
 * Demo-only unless TRADING_MODE is restricted-live/live AND ENABLE_LIVE_TRADES.
 */
export async function POST(request: Request) {
  const logs: string[] = [];
  try {
    const body = await request.json();
    const direction = String(body.direction || '').toUpperCase();
    const symbol = String(body.symbol || '').toUpperCase();
    const stake = Math.max(0.35, Math.min(5, Number(body.stake) || Number(process.env.DEFAULT_STAKE) || 0.35));
    const duration = Math.max(1, Math.min(10, Number(body.duration) || 5));

    if (!['BUY', 'SELL', 'CALL', 'PUT'].includes(direction) || !symbol) {
      return NextResponse.json({ ok: false, error: 'direction and symbol required' }, { status: 400 });
    }

    if (!isOptionsTradable(symbol)) {
      return NextResponse.json({
        ok: false,
        error: `${instrumentLabel(symbol)} (${symbol}) is not tradable as Options CALL/PUT on this API. It is a CFD/MT5 Drift Switch instrument. Ticks/signals still work; use Deriv MT5 for CFD orders.`,
        symbol,
        optionsTradable: false,
      }, { status: 400 });
    }


    const mode = tradingMode();
    logs.push(`mode=${mode} liveAllowed=${liveExecutionAllowed()}`);

    // Block reckless live unless explicitly allowed
    if (mode === 'live' || mode === 'restricted-live') {
      if (!liveExecutionAllowed()) {
        return NextResponse.json({ ok: false, error: 'Live trading not enabled on server' }, { status: 403 });
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Kill switch
    const { data: kill } = await supabase.from('bot_kv').select('value').eq('key', 'kill_switch').maybeSingle();
    if (kill?.value === true || kill?.value === 'true') {
      return NextResponse.json({ ok: false, error: 'Kill switch is ON' }, { status: 403 });
    }

    if (!process.env.DERIV_TOKEN || !process.env.DERIV_APP_ID) {
      return NextResponse.json({ ok: false, error: 'Deriv not configured' }, { status: 500 });
    }

    const deriv = new DerivClient({
      token: process.env.DERIV_TOKEN,
      appId: process.env.DERIV_APP_ID,
      accountId: process.env.DERIV_ACCOUNT_ID || undefined,
      accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
    });

    const dir = direction === 'BUY' || direction === 'CALL' ? 'BUY' : 'SELL';
    logs.push(`buy ${symbol} ${dir} stake=${stake} dur=${duration}`);

    const buy = await deriv.buyContract({
      symbol,
      direction: dir as 'BUY' | 'SELL',
      amount: stake,
      duration,
      duration_unit: 't',
    });

    const contractId = buy?.buy?.contract_id || buy?.contract_id;
    const buyPrice = buy?.buy?.buy_price || stake;

    const { data: row, error } = await supabase
      .from('trades')
      .insert({
        contract_id: String(contractId || `manual-${Date.now()}`),
        symbol,
        direction: direction === 'CALL' ? 'BUY' : direction === 'PUT' ? 'SELL' : direction,
        stake,
        entry_price: Number(buyPrice) || null,
        status: 'OPEN',
        confidence: 1,
        signal_source: 'telegram_manual',
        mode: mode === 'demo' || liveExecutionAllowed() ? 'demo' : 'manual',
      })
      .select('id, contract_id, status')
      .single();

    if (error) logs.push('db: ' + error.message);

    await deriv.disconnect?.();

    return NextResponse.json({
      ok: true,
      contract_id: contractId,
      status: 'OPEN',
      trade: row,
      logs,
      mode,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 400), logs }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'manual-trade',
    usage: 'POST { direction, symbol, stake?, duration? }',
  });
}
