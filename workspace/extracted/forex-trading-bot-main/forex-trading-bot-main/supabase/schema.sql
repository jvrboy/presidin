-- Supabase schema for Forex Trading Bot
-- Run this in the Supabase SQL editor

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Bot control
create table if not exists bot_settings (
  id int primary key default 1 check (id = 1),
  bot_enabled boolean not null default true,
  max_daily_loss numeric not null default 50,
  max_open_positions int not null default 3,
  confidence_threshold numeric not null default 0.65,
  stake_amount numeric not null default 1,
  symbols text[] not null default array['R_100', 'R_75', 'EURUSD', 'GBPUSD'],
  updated_at timestamptz not null default now()
);

insert into bot_settings (id) values (1) on conflict do nothing;

-- Ticks / market data
create table if not exists ticks (
  id bigserial primary key,
  symbol text not null,
  epoch bigint not null,
  quote numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists ticks_symbol_epoch_idx on ticks (symbol, epoch desc);

-- Open / closed trades
create table if not exists trades (
  id uuid primary key default uuid_generate_v4(),
  contract_id text unique,
  symbol text not null,
  direction text not null check (direction in ('BUY', 'SELL')),
  entry_price numeric,
  exit_price numeric,
  stake numeric not null,
  pnl numeric,
  status text not null default 'OPEN' check (status in ('OPEN', 'WON', 'LOST', 'CANCELLED', 'ERROR')),
  confidence numeric,
  signal_source text, -- 'ema', 'model', 'hybrid', etc.
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  raw_response jsonb
);

create index if not exists trades_status_idx on trades (status);
create index if not exists trades_opened_at_idx on trades (opened_at desc);

-- Daily P&L summary
create table if not exists daily_pnl (
  trade_date date primary key,
  realized_pnl numeric not null default 0,
  trades_count int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

-- Logs / events
create table if not exists bot_logs (
  id bigserial primary key,
  level text not null default 'info',
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_logs_created_at_idx on bot_logs (created_at desc);

-- Macro / Manus cache
create table if not exists macro_cache (
  id int primary key default 1 check (id = 1),
  sentiment text, -- 'bullish' | 'bearish' | 'neutral'
  score numeric,
  summary text,
  raw jsonb,
  refreshed_at timestamptz not null default now()
);

insert into macro_cache (id) values (1) on conflict do nothing;

-- RLS policies (service role bypasses; anon can read limited)
alter table bot_settings enable row level security;
alter table ticks enable row level security;
alter table trades enable row level security;
alter table daily_pnl enable row level security;
alter table bot_logs enable row level security;
alter table macro_cache enable row level security;

-- Allow service role full access (already default)
-- For dashboard (anon key) you can add selective select policies later.
