import { NextResponse } from 'next/server';
import { volumeProfileSnapshot } from '@/lib/volume-profile-advanced';
import { runOrderFlowTools } from '@/lib/tools-orderflow';
import { profileFor, SYMBOL_PROFILES } from '@/lib/symbol-intelligence';
import { classifyDerivError, resolveAppIdList } from '@/lib/deriv-adapter';

// Trade replay endpoint: /api/replay?symbol=R_50
// Returns a snapshot suitable for the trade-replay dashboard: current VP, order-flow, symbol profile,
// weights the aggregator is applying, and last recorded Deriv auth result.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') ?? 'R_50';
  const profile = profileFor(symbol);
  const appIds = resolveAppIdList();
  return NextResponse.json({
    ok: true,
    symbol,
    profile,
    knownProfiles: Object.keys(SYMBOL_PROFILES),
    appIds,
    hint: 'POST /api/replay with { symbol, candles, direction } to score the setup and get shadow-fill projections.',
  });
}

// POST accepts a real candle window plus proposed direction, returns the exact tools we would run
// so the dashboard can visualize what the bot saw at entry.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const candles = body.candles;
    const symbol = body.symbol ?? 'R_50';
    if (!Array.isArray(candles) || candles.length < 40) {
      return NextResponse.json({ ok: false, error: 'candles<40' }, { status: 400 });
    }
    const vp = volumeProfileSnapshot(candles);
    const of = runOrderFlowTools(candles);
    const derivError = body.derivError ? classifyDerivError(body.derivError.code, body.derivError.message) : null;
    return NextResponse.json({ ok: true, symbol, vp, orderFlow: of, derivError });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
