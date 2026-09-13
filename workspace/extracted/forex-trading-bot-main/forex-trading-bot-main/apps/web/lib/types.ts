export type Direction = 'BUY' | 'SELL' | 'HOLD';

export interface Tick {
  symbol: string;
  epoch: number;
  quote: number;
}

export interface Signal {
  symbol: string;
  direction: Direction;
  confidence: number;
  source: string;
  reason?: string;
}

export interface BotSettings {
  bot_enabled: boolean;
  max_daily_loss: number;
  max_open_positions: number;
  confidence_threshold: number;
  stake_amount: number;
  symbols: string[];
}

export interface Trade {
  id: string;
  contract_id?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entry_price?: number;
  exit_price?: number;
  stake: number;
  pnl?: number;
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'ERROR';
  confidence?: number;
  signal_source?: string;
  opened_at: string;
  closed_at?: string;
}

export interface MacroSentiment {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  summary?: string;
  refreshed_at: string;
}
