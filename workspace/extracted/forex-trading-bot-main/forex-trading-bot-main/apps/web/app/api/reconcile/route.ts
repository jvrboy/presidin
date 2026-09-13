import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DerivClient } from '../../../lib/deriv-client';
import {
  reconcile,
  reconciliationHealth,
  profitTableToBroker,
  type LocalTradeRow,
  type BrokerRecord,
} from '../../../lib/reconciliation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const logs: string[] = [];

  const { data: localRows } = await supabase
    .from('trades')
    .select('id, contract_id, stake, pnl, status, opened_at, closed_at, entry_price, exit_price, mode')
    .order('opened_at', { ascending: false })
    .limit(200);

  const local: LocalTradeRow[] = (localRows || []).map((t: any) => ({
    id: t.id,
    contract_id: t.contract_id,
    buy_price: Number(t.stake || t.entry_price || 0),
    sell_price: Number(t.exit_price || 0),
    profit: Number(t.pnl || 0),
    status: String(t.status || 'unknown').toLowerCase(),
    entry_epoch: t.opened_at ? Math.floor(new Date(t.opened_at).getTime() / 1000) : 0,
    exit_epoch: t.closed_at ? Math.floor(new Date(t.closed_at).getTime() / 1000) : undefined,
    mode: t.mode || undefined,
  }));

  let broker: BrokerRecord[] = [];

  if (process.env.DERIV_TOKEN && process.env.DERIV_APP_ID) {
    try {
      const deriv = new DerivClient({
        token: process.env.DERIV_TOKEN,
        appId: process.env.DERIV_APP_ID,
        accountId: process.env.DERIV_ACCOUNT_ID || undefined,
        accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
      });

      // Settled history (primary)
      const since = Math.floor(Date.now() / 1000) - 14 * 24 * 3600;
      const pt = await deriv.profitTable({ limit: 100, dateFrom: since });
      broker = profitTableToBroker(pt);
      logs.push(`profit_table rows=${pt.length} mapped=${broker.length}`);
      if (pt[0]) {
        const s = pt[0];
        logs.push(
          `pt_sample keys=${Object.keys(s).join(',')} buy=${s.buy_price} sell=${s.sell_price} profit=${s.profit} cid=${s.contract_id}`
        );
      }

      // Open portfolio still matters for OPEN local rows
      const portfolio = await deriv.portfolio().catch(() => []);
      for (const c of portfolio as any[]) {
        const cid = String(c.contract_id);
        if (broker.some((b) => String(b.contract_id) === cid)) continue;
        broker.push({
          contract_id: c.contract_id,
          buy_price: Number(c.buy_price || c.purchase_price || 0),
          sell_price: Number(c.sell_price || 0),
          profit: Number(c.profit || 0),
          purchase_time: Number(c.purchase_time || 0),
          status: 'open',
        });
      }
      logs.push(`+portfolio open=${(portfolio as any[]).length} brokerTotal=${broker.length}`);
      await deriv.disconnect?.();
    } catch (e: any) {
      logs.push(`broker: ${e.message}`);
    }
  } else {
    logs.push('no Deriv credentials');
  }

  const report = reconcile(local, broker);
  const health = reconciliationHealth(report);

  try {
    await supabase.from('reconciliation_log').insert({
      matched: report.matched,
      mismatched: report.mismatched.length,
      orphan_local: report.orphanLocal.length,
      orphan_broker: report.orphanBroker.length,
      health_ok: health.ok,
      health_reason: health.reason,
      raw: { ...report, logs } as any,
    });
  } catch (e: any) {
    logs.push(`log insert: ${e.message}`);
  }

  return NextResponse.json({
    ok: true,
    health,
    report,
    localCount: local.length,
    brokerCount: broker.length,
    logs,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST() {
  return GET();
}
