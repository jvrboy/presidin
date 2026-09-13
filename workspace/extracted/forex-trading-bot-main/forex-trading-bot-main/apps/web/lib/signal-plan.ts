/**
 * Structured trading plan: ENTRY · TP · SL · CONFIDENCE
 * For options contracts TP/SL are analytical price levels (duration still rules execution).
 */

import type { Direction } from './types';
import { instrumentLabel, isOptionsTradable } from './instruments';

export interface TradePlan {
  symbol: string;
  label: string;
  direction: Direction;
  confidence: number;
  entry: number;
  tp: number | null;
  sl: number | null;
  riskReward: number | null;
  atr: number;
  tpMult: number;
  slMult: number;
  optionsTradable: boolean;
  source: string;
  reason: string;
  voters?: number;
  timeframe?: string;
  at: string;
}

export function buildTradePlan(opts: {
  symbol: string;
  direction: Direction;
  confidence: number;
  entry: number;
  atr: number;
  source?: string;
  reason?: string;
  voters?: number;
  timeframe?: string;
  /** ATR multiples — tighter for forex, wider for indices */
  tpMult?: number;
  slMult?: number;
}): TradePlan {
  const entry = opts.entry;
  const atr = Math.max(opts.atr || 0, entry * 0.0001);
  const familyHint = opts.symbol.startsWith('frx')
    ? 'forex'
    : opts.symbol.startsWith('OTC_')
      ? 'index'
      : 'synthetic';

  const tpMult = opts.tpMult ?? (familyHint === 'forex' ? 1.5 : familyHint === 'index' ? 1.8 : 1.2);
  const slMult = opts.slMult ?? (familyHint === 'forex' ? 1.0 : familyHint === 'index' ? 1.2 : 0.9);

  let tp: number | null = null;
  let sl: number | null = null;
  let riskReward: number | null = null;

  if (opts.direction === 'BUY') {
    tp = entry + atr * tpMult;
    sl = entry - atr * slMult;
    riskReward = (tp - entry) / Math.max(entry - sl, 1e-12);
  } else if (opts.direction === 'SELL') {
    tp = entry - atr * tpMult;
    sl = entry + atr * slMult;
    riskReward = (entry - tp) / Math.max(sl - entry, 1e-12);
  }

  return {
    symbol: opts.symbol,
    label: instrumentLabel(opts.symbol),
    direction: opts.direction,
    confidence: Math.round(opts.confidence * 1000) / 1000,
    entry: roundPx(entry, opts.symbol),
    tp: tp != null ? roundPx(tp, opts.symbol) : null,
    sl: sl != null ? roundPx(sl, opts.symbol) : null,
    riskReward: riskReward != null ? Math.round(riskReward * 100) / 100 : null,
    atr: roundPx(atr, opts.symbol),
    tpMult,
    slMult,
    optionsTradable: isOptionsTradable(opts.symbol),
    source: opts.source || 'confluence',
    reason: opts.reason || '',
    voters: opts.voters,
    timeframe: opts.timeframe || '1m',
    at: new Date().toISOString(),
  };
}

function roundPx(x: number, symbol: string): number {
  if (symbol.startsWith('frx') && !symbol.includes('JPY')) return Math.round(x * 1e5) / 1e5;
  if (symbol.includes('JPY')) return Math.round(x * 1e3) / 1e3;
  if (symbol.startsWith('OTC_')) return Math.round(x * 100) / 100;
  return Math.round(x * 100) / 100;
}

/** Telegram-friendly signal card */
export function formatSignalCard(p: TradePlan): string {
  const dir =
    p.direction === 'BUY' ? '▲ BUY / CALL' : p.direction === 'SELL' ? '▼ SELL / PUT' : '◆ HOLD';
  const confBar = confidenceBar(p.confidence);
  const lines = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>${p.label}</b>  <code>${p.symbol}</code>`,
    `${dir}   conf ${confBar} <b>${(p.confidence * 100).toFixed(0)}%</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Entry   <code>${p.entry}</code>`,
    p.tp != null ? `TP      <code>${p.tp}</code>` : `TP      —`,
    p.sl != null ? `SL      <code>${p.sl}</code>` : `SL      —`,
  ];
  if (p.riskReward != null) lines.push(`R:R     <code>${p.riskReward.toFixed(2)}</code>`);
  lines.push(`ATR     <code>${p.atr}</code>  ·  ${p.timeframe}`);
  if (!p.optionsTradable) lines.push(`⚠️ Analysis only (not options-tradable)`);
  if (p.reason) lines.push(`Why: ${escapeHtml(p.reason.slice(0, 120))}`);
  if (p.voters != null) lines.push(`Voters: ${p.voters}`);
  return lines.join('\n');
}

function confidenceBar(c: number): string {
  const n = Math.max(0, Math.min(10, Math.round(c * 10)));
  return '▓'.repeat(n) + '░'.repeat(10 - n);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
