/** Broker reconciliation: local trades vs Deriv profit_table + portfolio. */
export interface LocalTradeRow {
  id: string;
  contract_id?: string | number;
  buy_price?: number;
  sell_price?: number;
  profit?: number;
  status: 'open' | 'won' | 'lost' | 'cancelled' | 'unknown' | string;
  entry_epoch: number;
  exit_epoch?: number;
  mode?: string;
}

export interface BrokerRecord {
  contract_id: string | number;
  buy_price: number;
  sell_price: number;
  profit: number;
  purchase_time: number;
  exit_tick_time?: number;
  status: string;
}

export interface ReconciliationReport {
  matched: number;
  mismatched: { id: string; localProfit?: number; brokerProfit: number }[];
  orphanLocal: string[];
  orphanBroker: (string | number)[];
  skippedNonBroker: number;
  toleranceUsd: number;
}

export function isBrokerContractId(id?: string | number | null): boolean {
  if (id == null || id === '') return false;
  const s = String(id);
  if (s.startsWith('shadow-')) return false;
  if (s.startsWith('dry-')) return false;
  return /^\d+$/.test(s);
}

export function reconcile(
  local: LocalTradeRow[],
  broker: BrokerRecord[],
  toleranceUsd = 0.05
): ReconciliationReport {
  const bmap = new Map<string, BrokerRecord>();
  for (const b of broker) bmap.set(String(b.contract_id), b);

  const report: ReconciliationReport = {
    matched: 0,
    mismatched: [],
    orphanLocal: [],
    orphanBroker: [],
    skippedNonBroker: 0,
    toleranceUsd,
  };
  const seenBroker = new Set<string>();

  for (const l of local) {
    if (l.mode === 'shadow' || !isBrokerContractId(l.contract_id)) {
      report.skippedNonBroker++;
      continue;
    }
    const b = bmap.get(String(l.contract_id));
    if (!b) {
      report.orphanLocal.push(l.id);
      continue;
    }
    seenBroker.add(String(l.contract_id));
    const diff = Math.abs((l.profit ?? 0) - b.profit);
    if (diff > toleranceUsd) {
      report.mismatched.push({ id: l.id, localProfit: l.profit, brokerProfit: b.profit });
    } else {
      report.matched++;
    }
  }
  for (const b of broker) {
    if (!seenBroker.has(String(b.contract_id))) report.orphanBroker.push(b.contract_id);
  }
  return report;
}

export function reconciliationHealth(rep: ReconciliationReport): { ok: boolean; reason: string } {
  const comparable = rep.matched + rep.mismatched.length + rep.orphanLocal.length;
  if (comparable === 0) {
    return {
      ok: true,
      reason: rep.skippedNonBroker
        ? `no broker-linked trades (skipped ${rep.skippedNonBroker} shadow/paper)`
        : 'no trades',
    };
  }
  const mismatchRate = rep.mismatched.length / comparable;
  const orphanLocalRate = rep.orphanLocal.length / comparable;
  if (mismatchRate > 0.05) {
    return { ok: false, reason: `mismatch rate ${(mismatchRate * 100).toFixed(1)}% > 5%` };
  }
  // orphan_broker alone is informational (broker history may exceed our sample window)
  if (orphanLocalRate > 0.15) {
    return { ok: false, reason: `local orphan rate ${(orphanLocalRate * 100).toFixed(1)}% > 15%` };
  }
  return {
    ok: true,
    reason: `matched=${rep.matched} mismatched=${rep.mismatched.length} orphanLocal=${rep.orphanLocal.length} orphanBroker=${rep.orphanBroker.length} skipped=${rep.skippedNonBroker}`,
  };
}

/** Map Deriv profit_table rows → BrokerRecord */
export function profitTableToBroker(rows: any[]): BrokerRecord[] {
  const out: BrokerRecord[] = [];
  for (const r of rows || []) {
    const cid = r.contract_id ?? r.transaction_id;
    if (cid == null) continue;
    const buy = Number(r.buy_price ?? r.purchase_price ?? 0);
    const sell = Number(r.sell_price ?? 0);
    // Deriv profit_table often omits `profit`; derive from sell − buy
    let profit = Number(r.profit);
    if (!Number.isFinite(profit)) {
      profit = Number.isFinite(sell) && Number.isFinite(buy) ? sell - buy : Number(r.amount ?? 0);
    }
    out.push({
      contract_id: cid,
      buy_price: buy,
      sell_price: sell,
      profit,
      purchase_time: Number(r.purchase_time ?? r.transaction_time ?? 0),
      exit_tick_time: r.sell_time ? Number(r.sell_time) : undefined,
      status: profit > 0 ? 'won' : profit < 0 ? 'lost' : 'unknown',
    });
  }
  return out;
}
