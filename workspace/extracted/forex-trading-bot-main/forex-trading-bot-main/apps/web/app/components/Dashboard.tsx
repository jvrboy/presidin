'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MarketsPanel from './MarketsPanel';

type DashData = {
  ok: boolean;
  generatedAt: string;
  liveTrades: boolean;
  accountType: string;
  accountId: string | null;
  settings: any;
  openTrades: any[];
  recentTrades: any[];
  dailyPnl: any;
  stats: {
    openCount: number;
    realizedAll: number;
    wins: number;
    losses: number;
    winRate: number | null;
    bySymbol?: Record<string, { n: number; wins: number; losses: number; pnl: number }>;
  };
  logs: any[];
  recentTicks: any[];
  lastDecision?: {
    at?: string;
    message?: string;
    signals?: any[];
    executed?: any[];
    logs?: string[];
    adaptive?: any;
    durationMs?: number;
  } | null;
  performanceLog?: any[];
};

const card: React.CSSProperties = {
  background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: '1.1rem 1.25rem',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
};

const btnBase: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '0.65rem 0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  minHeight: 40,
  touchAction: 'manipulation',
};

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 999,
        background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: ok ? '#4ade80' : '#f87171',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: ok ? '#22c55e' : '#ef4444',
          boxShadow: ok ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
        }}
      />
      {label}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function pnlColor(n: number) {
  if (n > 0) return '#4ade80';
  if (n < 0) return '#f87171';
  return '#94a3b8';
}

function dirColor(d: string) {
  if (d === 'BUY' || d === 'CALL') return '#4ade80';
  if (d === 'SELL' || d === 'PUT') return '#f87171';
  return '#94a3b8';
}

function EquityCurve({ trades }: { trades: any[] }) {
  const points = useMemo(() => {
    const closed = [...trades]
      .filter((t) => t.pnl != null && t.status !== 'OPEN')
      .reverse();
    let eq = 0;
    return closed.map((t, i) => {
      eq += Number(t.pnl || 0);
      return { i, eq, pnl: Number(t.pnl || 0) };
    });
  }, [trades]);

  if (points.length < 2) {
    return <div style={{ color: '#64748b', fontSize: 13 }}>Not enough closed trades for curve</div>;
  }
  const min = Math.min(...points.map((p) => p.eq), 0);
  const max = Math.max(...points.map((p) => p.eq), 0.01);
  const w = 640;
  const h = 120;
  const pad = 8;
  const path = points
    .map((p, idx) => {
      const x = pad + (idx / (points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p.eq - min) / (max - min || 1)) * (h - pad * 2);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 120 }}>
        <path d={path} fill="none" stroke={last.eq >= 0 ? '#4ade80' : '#f87171'} strokeWidth="2.2" />
      </svg>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        Equity: <span style={{ color: pnlColor(last.eq), fontWeight: 700 }}>{last.eq.toFixed(2)}</span> · {points.length} closed
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stake, setStake] = useState('0.35');
  const [conf, setConf] = useState('0.5');
  const [maxLoss, setMaxLoss] = useState('5');
  const [intel, setIntel] = useState<any>(null);
  const [sandboxOut, setSandboxOut] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Failed to load');
      setData(j);
      setError(null);
      if (j.settings) {
        setStake(String(j.settings.stake_amount ?? 0.35));
        setConf(String(j.settings.confidence_threshold ?? 0.5));
        setMaxLoss(String(j.settings.max_daily_loss ?? 5));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  async function runAction(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setActionMsg(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runTick() {
    await runAction('tick', async () => {
      const res = await fetch('/api/tick', { method: 'POST' });
      const j = await res.json();
      if (!j.ok && !j.skipped) throw new Error(j.error || 'Tick failed');
      const dirs = (j.signals || []).map((s: any) => `${s.symbol}:${s.direction}`).join(' ');
      setActionMsg(
        j.skipped
          ? `Skipped: ${j.reason}`
          : `Tick OK · ${j.durationMs}ms · ${dirs || 'no signals'} · exec ${j.executed?.length || 0}`
      );
    });
  }

  async function runManage() {
    await runAction('manage', async () => {
      const res = await fetch('/api/manage');
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Manage failed');
      setActionMsg(`Manage OK · open ${j.openCount} · updated ${j.updated?.length || 0}`);
    });
  }

  async function saveSettings() {
    await runAction('settings', async () => {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stake_amount: Number(stake),
          confidence_threshold: Number(conf),
          max_daily_loss: Number(maxLoss),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Settings save failed');
      setActionMsg('Settings saved');
    });
  }

  async function toggleKill(enabled: boolean) {
    await runAction('kill', async () => {
      const res = await fetch('/api/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Kill failed');
      setActionMsg(enabled ? 'Bot ENABLED' : 'Bot KILLED');
    });
  }


  async function runIntelligence() {
    await runAction('intel', async () => {
      const res = await fetch('/api/intelligence?symbol=R_50', { cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Intelligence failed');
      setIntel(j);
      setActionMsg(`Intel ${j.summary?.direction}@${((j.summary?.confidence || 0) * 100).toFixed(0)}% · ${j.summary?.totalVoters || 0} voters`);
    });
  }

  async function runSandbox(snippet = 'smoke') {
    await runAction('sandbox', async () => {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippet }),
      });
      const j = await res.json();
      setSandboxOut(j.skipped ? 'E2B not configured (set E2B_API_KEY)' : j.text || j.error || JSON.stringify(j));
      if (!j.ok && !j.skipped) throw new Error(j.error || 'Sandbox failed');
      setActionMsg(j.skipped ? 'Sandbox skipped — add E2B_API_KEY' : `Sandbox ${snippet} · ${j.durationMs}ms`);
    });
  }

  if (loading && !data) {
    return (
      <main style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem 1.25rem 0' }}><MarketsPanel /></div>
Loading dashboard…</main>
    );
  }

  if (error && !data) {
    return (
      <main style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: '#f87171' }}>{error}</p>
        <button style={{ ...btnBase, background: '#334155', color: '#e2e8f0' }} onClick={load}>
          Retry
        </button>
      </main>
    );
  }

  const s = data!;
  const enabled = s.settings?.bot_enabled !== false;
  const daily = Number(s.dailyPnl?.realized_pnl || 0);
  const last = s.lastDecision;
  const bySym = s.stats?.bySymbol || {};

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: mobile ? '0.75rem 0.75rem 5rem' : '1.5rem 1.25rem 3rem', color: '#e2e8f0', fontFamily: 'ui-sans-serif, system-ui, sans-serif', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: mobile ? 18 : 22, fontWeight: 700 }}>Forex Bot Control</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Updated {s.generatedAt ? new Date(s.generatedAt).toLocaleString() : '—'} · auto-refresh 12s · {s.accountType} {s.accountId || ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Badge ok={enabled} label={enabled ? 'Bot ON' : 'KILLED'} />
          <Badge ok={s.liveTrades} label={s.liveTrades ? 'LIVE TRADES' : 'DRY-RUN'} />
          <Badge ok={daily > -Math.abs(Number(s.settings?.max_daily_loss || 5))} label={`Day PnL ${daily.toFixed(2)}`} />
        </div>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="All-time PnL" value={s.stats.realizedAll.toFixed(2)} sub={`${s.stats.wins}W / ${s.stats.losses}L`} />
        <Stat label="Win rate" value={s.stats.winRate != null ? `${s.stats.winRate}%` : '—'} />
        <Stat label="Open" value={String(s.stats.openCount)} />
        <Stat label="Today PnL" value={daily.toFixed(2)} sub={`${s.dailyPnl?.trades_count || 0} trades`} />
        <Stat label="Stake" value={String(s.settings?.stake_amount ?? '—')} sub={`conf ≥ ${s.settings?.confidence_threshold ?? '—'}`} />
      </div>

      {/* Controls */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 10, alignItems: 'center' }}>
          <button style={{ ...btnBase, background: '#2563eb', color: '#fff' }} onClick={runTick} disabled={!!busy}>
            {busy === 'tick' ? 'Tick…' : 'Force Tick'}
          </button>
          <button style={{ ...btnBase, background: '#0f766e', color: '#fff' }} onClick={runManage} disabled={!!busy}>
            {busy === 'manage' ? 'Manage…' : 'Manage Positions'}
          </button>
          <button style={{ ...btnBase, background: '#7c3aed', color: '#fff' }} onClick={runIntelligence} disabled={!!busy}>
            {busy === 'intel' ? 'Intel…' : 'Intelligence'}
          </button>
          <button style={{ ...btnBase, background: '#c2410c', color: '#fff' }} onClick={() => runSandbox('smoke')} disabled={!!busy}>
            {busy === 'sandbox' ? 'E2B…' : 'E2B Smoke'}
          </button>
          <button style={{ ...btnBase, background: '#9a3412', color: '#fff' }} onClick={() => runSandbox('walkforward_toy')} disabled={!!busy}>
            E2B Walkforward
          </button>
          <button style={{ ...btnBase, background: enabled ? '#b91c1c' : '#16a34a', color: '#fff' }} onClick={() => toggleKill(!enabled)} disabled={!!busy}>
            {enabled ? 'Kill Switch' : 'Enable Bot'}
          </button>
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 12, color: '#94a3b8' }}>
            Stake{' '}
            <input value={stake} onChange={(e) => setStake(e.target.value)} style={{ width: 56, marginLeft: 4, background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '4px 6px' }} />
          </label>
          <label style={{ fontSize: 12, color: '#94a3b8' }}>
            Conf{' '}
            <input value={conf} onChange={(e) => setConf(e.target.value)} style={{ width: 56, marginLeft: 4, background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '4px 6px' }} />
          </label>
          <label style={{ fontSize: 12, color: '#94a3b8' }}>
            Max day loss{' '}
            <input value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} style={{ width: 56, marginLeft: 4, background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '4px 6px' }} />
          </label>
          <button style={{ ...btnBase, background: '#334155', color: '#e2e8f0' }} onClick={saveSettings} disabled={!!busy}>
            Save
          </button>
        </div>
        {actionMsg && <div style={{ marginTop: 10, fontSize: 13, color: actionMsg.startsWith('Error') ? '#f87171' : '#94a3b8' }}>{actionMsg}</div>}
      </div>

      {/* Live Decision Trail */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Live Decision Trail</h2>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
          What the last tick actually evaluated — signals, voters used, and why trades were taken or skipped.
          {last?.at && <> · {new Date(last.at).toLocaleString()}</>}
          {last?.durationMs != null && <> · {last.durationMs}ms</>}
        </p>
        {last?.message && (
          <div style={{ fontSize: 13, marginBottom: 10, color: '#cbd5e1', fontFamily: 'ui-monospace, monospace' }}>{last.message}</div>
        )}
        {(last?.signals || []).length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No decision snapshot yet — wait for next tick or press Force Tick.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {(last?.signals || []).map((sig: any) => (
              <div key={sig.symbol} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 10, alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{sig.symbol}</strong>
                  <span style={{ color: dirColor(sig.direction), fontWeight: 700 }}>{sig.direction}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>conf {(sig.confidence * 100).toFixed(1)}%</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>net {Number(sig.netScore || 0).toFixed(3)}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{sig.voters || 0} voters</span>
                  <span style={{ fontSize: 11, color: '#475569' }}>{sig.source}</span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                  <strong style={{ color: '#cbd5e1' }}>Reason:</strong> {sig.reason || '—'}
                </div>
                {(sig.topVotes || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sig.topVotes.map((v: any, i: number) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'rgba(59,130,246,0.12)',
                          border: '1px solid rgba(59,130,246,0.25)',
                          color: '#93c5fd',
                        }}
                        title={v.why}
                      >
                        {v.name} {(v.conf * 100).toFixed(0)}% w{v.w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {(last?.logs || []).length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', fontFamily: 'ui-monospace, monospace', maxHeight: 120, overflow: 'auto' }}>
            {((last?.logs || []) as string[]).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        {(last?.executed || []).length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#4ade80' }}>
            Executed: {((last?.executed || []) as any[]).map((e: any) => `${e.direction} ${e.symbol}`).join(', ')}
          </div>
        )}
      </div>

      
      {/* Intelligence + E2B */}
      {(intel || sandboxOut) && (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 12 : 16, marginBottom: 16 }}>
          {intel && (
            <div style={card}>
              <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Intelligence Snapshot</h2>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                {intel.symbol} · {intel.summary?.direction} @ {((intel.summary?.confidence || 0) * 100).toFixed(0)}% ·{' '}
                {intel.summary?.totalVoters} voters
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                packs: nexus/priority/alpha · toolsExtra · e2b={String(intel.packs?.e2b)}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(intel.summary?.buckets || {}).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>
                    {k}:{String(v)}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                {(intel.summary?.topVotes || []).slice(0, 8).map((v: any) => (
                  <div key={v.name}>{v.name} {(v.conf * 100).toFixed(0)}% — {v.why}</div>
                ))}
              </div>
            </div>
          )}
          {sandboxOut && (
            <div style={card}>
              <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>E2B Sandbox Output</h2>
              <pre style={{ margin: 0, fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{sandboxOut}</pre>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 12 : 16, marginBottom: 16 }}>
        {/* Equity + by symbol */}
        <div style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Equity Curve</h2>
          <EquityCurve trades={s.recentTrades} />
        </div>
        <div style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Performance by Symbol</h2>
          {Object.keys(bySym).length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>No closed trades yet</div>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '4px 0' }}>Symbol</th>
                  <th>N</th>
                  <th>W/L</th>
                  <th>PnL</th>
                  <th>WR</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bySym)
                  .sort((a, b) => b[1].n - a[1].n)
                  .map(([sym, st]) => (
                    <tr key={sym} style={{ borderTop: '1px solid #1e293b' }}>
                      <td style={{ padding: '6px 0', fontWeight: 600 }}>{sym}</td>
                      <td>{st.n}</td>
                      <td>
                        {st.wins}/{st.losses}
                      </td>
                      <td style={{ color: pnlColor(st.pnl) }}>{st.pnl.toFixed(2)}</td>
                      <td>{st.n ? Math.round((st.wins / st.n) * 100) : 0}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Performance log — what really happened */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Performance Log — what was used & what happened</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
          Closed trades with the signal reason / voters that produced the entry (when recorded).
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Time</th>
                <th>Sym</th>
                <th>Dir</th>
                <th>Status</th>
                <th>PnL</th>
                <th>Conf</th>
                <th>Source</th>
                <th>Reason / Top voters</th>
              </tr>
            </thead>
            <tbody>
              {(s.performanceLog || []).map((t: any) => (
                <tr key={t.id} style={{ borderTop: '1px solid #1e293b' }}>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#64748b' }}>
                    {t.opened_at ? new Date(t.opened_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ color: dirColor(t.direction) }}>{t.direction}</td>
                  <td style={{ color: t.status === 'WON' ? '#4ade80' : t.status === 'LOST' ? '#f87171' : '#94a3b8' }}>{t.status}</td>
                  <td style={{ color: pnlColor(Number(t.pnl || 0)), fontWeight: 600 }}>{t.pnl != null ? Number(t.pnl).toFixed(2) : '—'}</td>
                  <td>{t.confidence != null ? (Number(t.confidence) * 100).toFixed(0) + '%' : '—'}</td>
                  <td style={{ color: '#64748b', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.source || '—'}</td>
                  <td style={{ color: '#94a3b8', maxWidth: 280 }}>
                    {t.raw?.reason || '—'}
                    {t.raw?.topVotes?.length ? (
                      <div style={{ marginTop: 2, fontSize: 11, color: '#64748b' }}>
                        {t.raw.topVotes.slice(0, 5).map((v: any) => v.name).join(', ')}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {(s.performanceLog || []).length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 12, color: '#64748b' }}>
                    No closed trades with detail yet. New trades will record full voter/reason data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open + recent trades */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 12 : 16, marginBottom: 16 }}>
        <div style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Open Positions</h2>
          {(s.openTrades || []).length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>None open</div>
          ) : (
            (s.openTrades || []).map((t: any) => (
              <div key={t.id} style={{ fontSize: 13, marginBottom: 6, display: 'flex', gap: 8 }}>
                <span style={{ color: dirColor(t.direction), fontWeight: 700 }}>{t.direction}</span>
                <span>{t.symbol}</span>
                <span style={{ color: '#64748b' }}>conf {(Number(t.confidence || 0) * 100).toFixed(0)}%</span>
                <span style={{ color: '#475569' }}>{t.contract_id}</span>
              </div>
            ))
          )}
        </div>
        <div style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Recent Ticks</h2>
          <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>
            {(s.recentTicks || []).map((t: any, i: number) => (
              <div key={i}>
                {t.symbol} {Number(t.quote).toFixed(4)} · {t.created_at ? new Date(t.created_at).toLocaleTimeString() : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raw bot logs */}
      <div style={card}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Bot Logs (real-time)</h2>
        <div style={{ maxHeight: mobile ? 220 : 280, overflow: 'auto', fontSize: mobile ? 11 : 12, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
          {(s.logs || []).map((l: any) => (
            <div key={l.id} style={{ marginBottom: 8, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
              <div style={{ color: '#64748b' }}>
                {l.created_at ? new Date(l.created_at).toLocaleString() : ''} · {l.level}
              </div>
              <div style={{ color: '#cbd5e1' }}>{l.message}</div>
              {l.meta?.logs && Array.isArray(l.meta.logs) && (
                <div style={{ color: '#64748b', marginTop: 2 }}>
                  {l.meta.logs.slice(0, 6).map((x: string, i: number) => (
                    <div key={i}>· {x}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
