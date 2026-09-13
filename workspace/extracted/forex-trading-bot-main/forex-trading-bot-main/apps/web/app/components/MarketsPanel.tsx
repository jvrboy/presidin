'use client';

import { useCallback, useEffect, useState } from 'react';

type Plan = {
  symbol: string;
  label: string;
  direction: string;
  confidence: number;
  entry: number;
  tp: number | null;
  sl: number | null;
  riskReward: number | null;
  atr: number;
  optionsTradable: boolean;
  reason?: string;
};

const card: React.CSSProperties = {
  background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: '1rem 1.1rem',
};

export default function MarketsPanel() {
  const [group, setGroup] = useState('forex');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<any>(null);

  const loadRegistry = useCallback(async () => {
    try {
      const r = await fetch('/api/instruments', { cache: 'no-store' });
      setRegistry(await r.json());
    } catch {
      /* */
    }
  }, []);

  const scan = useCallback(async (g: string) => {
    setLoading(true);
    setError(null);
    setGroup(g);
    try {
      const r = await fetch(`/api/signals?group=${g}&limit=10`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'scan failed');
      setPlans(j.plans || []);
      if (j.errors?.length) setError(j.errors.map((e: any) => `${e.symbol}: ${e.error}`).slice(0, 3).join(' · '));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const dirColor = (d: string) =>
    d === 'BUY' ? '#4ade80' : d === 'SELL' ? '#f87171' : '#94a3b8';

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#e2e8f0', marginRight: 8 }}>Markets & signals</h2>
        {['forex', 'indices', 'synthetic', 'watchlist'].map((g) => (
          <button
            key={g}
            onClick={() => scan(g)}
            style={{
              border: '1px solid #334155',
              background: group === g ? '#1d4ed8' : '#0f172a',
              color: '#e2e8f0',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {g}
          </button>
        ))}
        {loading && <span style={{ color: '#94a3b8', fontSize: 12 }}>Scanning…</span>}
      </div>

      {registry && (
        <div style={{ ...card, marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>
          Registry <b style={{ color: '#e2e8f0' }}>{registry.count}</b> instruments · Forex{' '}
          {registry.forex?.length} · Indices {registry.indices?.length} · Crash/Boom{' '}
          {registry.crashBoom?.length} (analysis-only)
        </div>
      )}

      {error && (
        <div style={{ ...card, marginBottom: 12, borderColor: '#7f1d1d', color: '#fca5a5', fontSize: 12 }}>{error}</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {plans.map((p) => (
          <div key={p.symbol} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>{p.symbol}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: dirColor(p.direction), fontWeight: 700 }}>{p.direction}</div>
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>{(p.confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 4,
                background: '#1e293b',
                overflow: 'hidden',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, p.confidence * 100)}%`,
                  height: '100%',
                  background: dirColor(p.direction),
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: '#64748b' }}>Entry</div>
                <div style={{ fontFamily: 'ui-monospace, monospace' }}>{p.entry}</div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>TP</div>
                <div style={{ fontFamily: 'ui-monospace, monospace', color: '#4ade80' }}>{p.tp ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>SL</div>
                <div style={{ fontFamily: 'ui-monospace, monospace', color: '#f87171' }}>{p.sl ?? '—'}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
              ATR {p.atr}
              {p.riskReward != null ? ` · R:R ${p.riskReward}` : ''}
              {!p.optionsTradable ? ' · analysis only' : ''}
            </div>
            {p.reason && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{p.reason.slice(0, 80)}</div>
            )}
          </div>
        ))}
        {!loading && plans.length === 0 && (
          <div style={{ ...card, color: '#64748b', fontSize: 13 }}>Pick a market group to scan signals</div>
        )}
      </div>
    </section>
  );
}
