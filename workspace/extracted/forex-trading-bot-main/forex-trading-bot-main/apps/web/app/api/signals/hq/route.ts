import { NextResponse } from 'next/server';
import { DerivClient } from '../../../../lib/deriv-client';
import { HQ_APPROVED, buildHqSignal, MT5_MAP } from '../../../../lib/hq-mtf';
import type { Candle } from '../../../../lib/indicators';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/signals/hq
 * High-quality setups only for manual MT5.
 * ?all=1 to include non-approved symbols
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeAll = url.searchParams.get('all') === '1';
  const symbols = includeAll
    ? [...HQ_APPROVED, 'frxNZDUSD', 'OTC_FCHI', 'OTC_GDAXI']
    : [...HQ_APPROVED];

  const token = process.env.DERIV_TOKEN;
  const appId = process.env.DERIV_APP_ID;
  if (!token || !appId) {
    return NextResponse.json({ ok: false, error: 'Missing Deriv credentials' }, { status: 500 });
  }

  const deriv = new DerivClient({
    token,
    appId,
    accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
  });

  const signals = [];
  const errors: { symbol: string; error: string }[] = [];

  try {
    await deriv.connect();
    for (const symbol of symbols) {
      try {
        const htf: Partial<Record<'1h' | '4h' | '8h', Candle[]>> = {
          '1h': await deriv.getCandlesOHLC(symbol, 120, 3600),
          '4h': await deriv.getCandlesOHLC(symbol, 100, 14400),
          '8h': await deriv.getCandlesOHLC(symbol, 80, 28800),
        };
        const ltf: Partial<Record<'5m' | '15m' | '30m', Candle[]>> = {
          '5m': await deriv.getCandlesOHLC(symbol, 120, 300),
          '15m': await deriv.getCandlesOHLC(symbol, 100, 900),
          '30m': await deriv.getCandlesOHLC(symbol, 80, 1800),
        };
        signals.push(buildHqSignal(symbol, htf, ltf));
      } catch (e: any) {
        errors.push({ symbol, error: e.message || String(e) });
      }
    }
  } finally {
    try {
      await deriv.disconnect();
    } catch {
      /* */
    }
  }

  const actionable = signals.filter((s) => s.actionable);
  return NextResponse.json({
    ok: true,
    mode: 'HQ_MTF_manual_MT5',
    universe: symbols.map((s) => MT5_MAP[s] || s),
    gates: ['HTF_strict', '5m_must_agree', 'gte_2_ltf', 'chop_filter'],
    backtest_note: 'Approved FX pairs ~63% WR on max Deriv history HQ gates',
    scanned: signals.length,
    actionable,
    holds: signals.filter((s) => !s.actionable),
    errors,
    at: new Date().toISOString(),
  });
}
