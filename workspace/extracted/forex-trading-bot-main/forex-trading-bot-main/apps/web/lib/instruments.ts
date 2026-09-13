/** Instrument registry: tradeable options vs analysis-only. */

export type InstrumentFamily =
  | 'volatility'
  | 'jump'
  | 'drift'
  | 'hz'
  | 'forex'
  | 'index'
  | 'crash_boom'
  | 'step'
  | 'regime'
  | 'other';

export interface InstrumentMeta {
  label: string;
  family: InstrumentFamily;
  optionsTradable: boolean;
  note?: string;
  group?: string;
  /** Preferred duration unit for options proposals */
  durationUnit?: 't' | 'm' | 'h';
}

export const INSTRUMENTS: Record<string, InstrumentMeta> = {
  R_10: { label: 'Volatility 10', family: 'volatility', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  R_25: { label: 'Volatility 25', family: 'volatility', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  R_50: { label: 'Volatility 50', family: 'volatility', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  R_75: { label: 'Volatility 75', family: 'volatility', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  R_100: { label: 'Volatility 100', family: 'volatility', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },

  JD10: { label: 'Jump 10', family: 'jump', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  JD25: { label: 'Jump 25', family: 'jump', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  JD50: { label: 'Jump 50', family: 'jump', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  JD75: { label: 'Jump 75', family: 'jump', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  JD100: { label: 'Jump 100', family: 'jump', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },

  DSI10: { label: 'Drift Switch Index 10', family: 'drift', optionsTradable: false, group: 'Synthetic', note: 'CFD/MT5 — analysis only' },
  DSI20: { label: 'Drift Switch Index 20', family: 'drift', optionsTradable: false, group: 'Synthetic', note: 'CFD/MT5 — analysis only' },
  DSI30: { label: 'Drift Switch Index 30', family: 'drift', optionsTradable: false, group: 'Synthetic', note: 'CFD/MT5 — analysis only' },

  '1HZ10V': { label: 'Volatility 10 (1s)', family: 'hz', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  '1HZ25V': { label: 'Volatility 25 (1s)', family: 'hz', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  '1HZ50V': { label: 'Volatility 50 (1s)', family: 'hz', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  '1HZ75V': { label: 'Volatility 75 (1s)', family: 'hz', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  '1HZ100V': { label: 'Volatility 100 (1s)', family: 'hz', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },

  frxEURUSD: { label: 'EUR/USD', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm', note: 'CALL/PUT — use minute durations (ticks often rejected)' },
  frxGBPUSD: { label: 'GBP/USD', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },
  frxUSDJPY: { label: 'USD/JPY', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },
  frxUSDCHF: { label: 'USD/CHF', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },
  frxUSDCAD: { label: 'USD/CAD', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },
  frxNZDUSD: { label: 'NZD/USD', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },
  frxAUDUSD: { label: 'AUD/USD', family: 'forex', optionsTradable: true, group: 'Forex', durationUnit: 'm' },

  OTC_FCHI: { label: 'France 40', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },
  OTC_GDAXI: { label: 'Germany 40', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },
  OTC_FTSE: { label: 'UK 100', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },
  OTC_SPC: { label: 'US 500', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },
  OTC_NDX: { label: 'US Tech 100', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },
  OTC_DJI: { label: 'Wall Street 30', family: 'index', optionsTradable: true, group: 'Indices', durationUnit: 'm' },

  // Verified tick history on public Options WS (ACCUMULATOR primary; CALL/PUT limited)
  BOOM500: { label: 'Boom 500', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  BOOM600: { label: 'Boom 600', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  BOOM900: { label: 'Boom 900', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  BOOM1000: { label: 'Boom 1000', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  CRASH500: { label: 'Crash 500', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  CRASH600: { label: 'Crash 600', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  CRASH900: { label: 'Crash 900', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },
  CRASH1000: { label: 'Crash 1000', family: 'crash_boom', optionsTradable: false, group: 'Crash/Boom', note: 'Ticks OK; primarily Accumulator contracts' },

  RDBULL: { label: 'Bull Market Index', family: 'regime', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  RDBEAR: { label: 'Bear Market Index', family: 'regime', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
  stpRNG: { label: 'Step Index 100', family: 'step', optionsTradable: true, group: 'Synthetic', durationUnit: 't' },
};

export function isOptionsTradable(symbol: string): boolean {
  const meta = INSTRUMENTS[symbol];
  if (meta) return meta.optionsTradable;
  return true;
}

export function instrumentLabel(symbol: string): string {
  return INSTRUMENTS[symbol]?.label || symbol;
}

export function preferredDurationUnit(symbol: string): 't' | 'm' | 'h' {
  return INSTRUMENTS[symbol]?.durationUnit || 't';
}

export function instrumentsByGroup(): Record<string, { symbol: string; meta: InstrumentMeta }[]> {
  const out: Record<string, { symbol: string; meta: InstrumentMeta }[]> = {};
  for (const [symbol, meta] of Object.entries(INSTRUMENTS)) {
    const g = meta.group || 'Other';
    if (!out[g]) out[g] = [];
    out[g].push({ symbol, meta });
  }
  return out;
}

export function listInstruments(filter?: {
  family?: InstrumentFamily;
  tradableOnly?: boolean;
  group?: string;
}) {
  return Object.entries(INSTRUMENTS)
    .filter(([_, m]) => {
      if (filter?.family && m.family !== filter.family) return false;
      if (filter?.tradableOnly && !m.optionsTradable) return false;
      if (filter?.group && m.group !== filter.group) return false;
      return true;
    })
    .map(([symbol, meta]) => ({ symbol, ...meta }));
}

export const DEFAULT_WATCHLIST = [
  'R_25',
  'R_50',
  'JD25',
  'frxEURUSD',
  'frxGBPUSD',
  'frxUSDJPY',
  'OTC_SPC',
  'OTC_NDX',
  'OTC_DJI',
];

export const FOREX_SYMBOLS = [
  'frxEURUSD',
  'frxGBPUSD',
  'frxUSDJPY',
  'frxUSDCHF',
  'frxUSDCAD',
  'frxNZDUSD',
  'frxAUDUSD',
];

export const INDEX_SYMBOLS = [
  'OTC_FCHI',
  'OTC_GDAXI',
  'OTC_FTSE',
  'OTC_SPC',
  'OTC_NDX',
  'OTC_DJI',
];

export const CRASH_BOOM_SYMBOLS = [
  'BOOM500',
  'BOOM600',
  'BOOM900',
  'BOOM1000',
  'CRASH500',
  'CRASH600',
  'CRASH900',
  'CRASH1000',
];
