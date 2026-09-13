import { NextResponse } from 'next/server';
import {
  INSTRUMENTS,
  listInstruments,
  instrumentsByGroup,
  FOREX_SYMBOLS,
  INDEX_SYMBOLS,
  CRASH_BOOM_SYMBOLS,
  DEFAULT_WATCHLIST,
} from '../../../lib/instruments';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const family = url.searchParams.get('family') as any;
  const group = url.searchParams.get('group') || undefined;
  const tradableOnly = url.searchParams.get('tradable') === '1';

  const list = listInstruments({
    family: family || undefined,
    group,
    tradableOnly,
  });

  return NextResponse.json({
    ok: true,
    count: list.length,
    instruments: list,
    byGroup: instrumentsByGroup(),
    forex: FOREX_SYMBOLS.map((s) => ({ symbol: s, ...INSTRUMENTS[s] })),
    indices: INDEX_SYMBOLS.map((s) => ({ symbol: s, ...INSTRUMENTS[s] })),
    crashBoom: CRASH_BOOM_SYMBOLS.map((s) => ({ symbol: s, ...INSTRUMENTS[s] })),
    watchlist: DEFAULT_WATCHLIST,
    driftSwitch: list.filter((x) => x.family === 'drift'),
  });
}
