-- PRESIDIN Supabase schema
-- Run via Supabase Management API

-- Signals table
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  direction text not null check (direction in ('BUY','SELL','NEUTRAL')),
  confidence double precision not null,
  consensus double precision not null,
  votes jsonb,
  entry_price double precision not null,
  stop_loss double precision not null,
  take_profit double precision not null,
  rr_ratio double precision not null,
  position_size double precision not null default 0,
  status text not null default 'active' check (status in ('active','expired','executed','invalidated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signals_symbol_timeframe_idx on public.signals (symbol, timeframe);
create index if not exists signals_created_at_idx on public.signals (created_at desc);
create index if not exists signals_status_idx on public.signals (status);

-- Trades table
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  broker text not null default 'paper',
  direction text not null check (direction in ('BUY','SELL')),
  quantity double precision not null,
  entry_price double precision not null,
  exit_price double precision,
  entry_time timestamptz not null default now(),
  exit_time timestamptz,
  stop_loss double precision,
  take_profit double precision,
  pnl double precision,
  pnl_pct double precision,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_symbol_idx on public.trades (symbol);
create index if not exists trades_status_idx on public.trades (status);
create index if not exists trades_created_at_idx on public.trades (created_at desc);

-- Chat threads
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  provider text not null default 'zai',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_in integer default 0,
  tokens_out integer default 0,
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_id_idx on public.chat_messages (thread_id, created_at);

-- Bot logs
create table if not exists public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info','warn','error','debug')),
  source text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bot_logs_created_at_idx on public.bot_logs (created_at desc);
create index if not exists bot_logs_level_idx on public.bot_logs (level);

-- Notification log
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  level text not null,
  title text not null,
  body text not null,
  source text not null,
  sent_at timestamptz not null default now(),
  success boolean not null default true
);
create index if not exists notification_log_sent_at_idx on public.notification_log (sent_at desc);

-- Backtest results
create table if not exists public.backtests (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  config jsonb not null,
  metrics jsonb not null,
  trades_count integer not null,
  created_at timestamptz not null default now()
);
create index if not exists backtests_created_at_idx on public.backtests (created_at desc);

-- Enable RLS
alter table public.signals enable row level security;
alter table public.trades enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.bot_logs enable row level security;
alter table public.notification_log enable row level security;
alter table public.backtests enable row level security;

-- Drop existing policies if any (idempotent)
drop policy if exists "Signals are readable by all" on public.signals;
drop policy if exists "Trades manageable by all" on public.trades;
drop policy if exists "Chat threads manageable by all" on public.chat_threads;
drop policy if exists "Chat messages manageable by all" on public.chat_messages;
drop policy if exists "Backtests manageable by all" on public.backtests;

-- Public read for signals
create policy "Signals are readable by all" on public.signals for select using (true);
create policy "Trades manageable by all" on public.trades for all using (true) with check (true);
create policy "Chat threads manageable by all" on public.chat_threads for all using (true) with check (true);
create policy "Chat messages manageable by all" on public.chat_messages for all using (true) with check (true);
create policy "Backtests manageable by all" on public.backtests for all using (true) with check (true);

-- Updated_at triggers
create or replace function public.handle_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists signals_updated_at on public.signals;
create trigger signals_updated_at before update on public.signals for each row execute function public.handle_updated_at();

drop trigger if exists trades_updated_at on public.trades;
create trigger trades_updated_at before update on public.trades for each row execute function public.handle_updated_at();

drop trigger if exists chat_threads_updated_at on public.chat_threads;
create trigger chat_threads_updated_at before update on public.chat_threads for each row execute function public.handle_updated_at();

-- Insert a test signal
insert into public.signals (symbol, timeframe, direction, confidence, consensus, votes, entry_price, stop_loss, take_profit, rr_ratio, position_size)
values ('EURUSD', '15m', 'BUY', 72.5, 18.3, '[{"agentId":"trend","direction":"BUY","confidence":85}]', 1.0850, 1.0820, 1.0910, 2.0, 0.33)
on conflict do nothing;

-- Insert a test log
insert into public.bot_logs (level, source, message, data)
values ('info', 'system', 'PRESIDIN schema initialized', '{"version":"1.0"}')
on conflict do nothing;
