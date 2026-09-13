import { NextResponse } from 'next/server';
import { DerivClient } from '../../../lib/deriv-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') || '').toLowerCase();
  if (!process.env.DERIV_TOKEN || !process.env.DERIV_APP_ID) {
    return NextResponse.json({ ok: false, error: 'no deriv' }, { status: 500 });
  }
  try {
    const deriv = new DerivClient({
      token: process.env.DERIV_TOKEN,
      appId: process.env.DERIV_APP_ID,
      accountId: process.env.DERIV_ACCOUNT_ID || undefined,
      accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
    });
    const anyDeriv = deriv as any;
    const ws = await anyDeriv.connectPublic();
    const res = await anyDeriv.send(ws, { active_symbols: 'brief' });
    const syms = res.active_symbols || [];
    const mapped = syms.map((s: any) => ({
      symbol: s.symbol,
      display: s.display_name,
      market: s.market,
      submarket: s.submarket,
    }));
    let filtered = mapped;
    if (q) {
      filtered = mapped.filter(
        (s: any) =>
          String(s.symbol || '').toLowerCase().includes(q) ||
          String(s.display || '').toLowerCase().includes(q) ||
          String(s.submarket || '').toLowerCase().includes(q)
      );
    }
    await deriv.disconnect?.();
    return NextResponse.json({
      ok: true,
      count: filtered.length,
      total: mapped.length,
      symbols: filtered.slice(0, 300),
      sample: mapped.slice(0, 30),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
