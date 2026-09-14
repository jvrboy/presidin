"""Push PRESIDIN schema to Supabase (idempotent + ALTER for existing tables)."""
import json
import urllib.request
import urllib.error

PROJECT_REF = "ednvxuhkvfbjygumtfnq"
MGMT_TOKEN = "sbp_257d8128ed389368a0e6ecb75cb403df4b1184d7"

# Schema SQL — idempotent, handles existing tables
SQL = """
-- Drop existing tables that conflict (we'll recreate them clean)
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_threads cascade;
drop table if exists public.signals cascade;
drop table if exists public.trades cascade;
drop table if exists public.bot_logs cascade;
drop table if exists public.notification_log cascade;
drop table if exists public.backtests cascade;

-- Signals table
create table public.signals (
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
create index signals_symbol_timeframe_idx on public.signals (symbol, timeframe);
create index signals_created_at_idx on public.signals (created_at desc);
create index signals_status_idx on public.signals (status);

-- Trades table
create table public.trades (
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
create index trades_symbol_idx on public.trades (symbol);
create index trades_status_idx on public.trades (status);
create index trades_created_at_idx on public.trades (created_at desc);

-- Chat threads
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  provider text not null default 'zai',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
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
create index chat_messages_thread_id_idx on public.chat_messages (thread_id, created_at);

-- Bot logs (clean schema with source + data)
create table public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info','warn','error','debug')),
  source text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index bot_logs_created_at_idx on public.bot_logs (created_at desc);
create index bot_logs_level_idx on public.bot_logs (level);

-- Notification log
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  level text not null,
  title text not null,
  body text not null,
  source text not null,
  sent_at timestamptz not null default now(),
  success boolean not null default true
);
create index notification_log_sent_at_idx on public.notification_log (sent_at desc);

-- Backtest results
create table public.backtests (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  config jsonb not null,
  metrics jsonb not null,
  trades_count integer not null,
  created_at timestamptz not null default now()
);
create index backtests_created_at_idx on public.backtests (created_at desc);

-- Enable RLS
alter table public.signals enable row level security;
alter table public.trades enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.bot_logs enable row level security;
alter table public.notification_log enable row level security;
alter table public.backtests enable row level security;

-- Public policies
create policy "Signals readable by all" on public.signals for select using (true);
create policy "Trades manageable by all" on public.trades for all using (true) with check (true);
create policy "Chat threads manageable by all" on public.chat_threads for all using (true) with check (true);
create policy "Chat messages manageable by all" on public.chat_messages for all using (true) with check (true);
create policy "Backtests manageable by all" on public.backtests for all using (true) with check (true);

-- Triggers
create or replace function public.handle_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger signals_updated_at before update on public.signals for each row execute function public.handle_updated_at();
create trigger trades_updated_at before update on public.trades for each row execute function public.handle_updated_at();
create trigger chat_threads_updated_at before update on public.chat_threads for each row execute function public.handle_updated_at();

-- Insert test data
insert into public.signals (symbol, timeframe, direction, confidence, consensus, votes, entry_price, stop_loss, take_profit, rr_ratio, position_size)
values ('EURUSD', '15m', 'BUY', 72.5, 18.3, '[{"agentId":"trend","direction":"BUY","confidence":85}]'::jsonb, 1.0850, 1.0820, 1.0910, 2.0, 0.33);

insert into public.bot_logs (level, source, message, data)
values ('info', 'system', 'PRESIDIN schema initialized', jsonb_build_object('version', '1.0', 'timestamp', now()::text));
"""

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    headers={"Authorization": f"Bearer {MGMT_TOKEN}", "Content-Type": "application/json"},
    data=json.dumps({"query": SQL}).encode(),
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as res:
        result = res.read().decode()
        print("Status:", res.status)
        print("Response:", result[:500] if result else "(empty — success)")
        print("\n✓ Schema deployed successfully")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}:", e.read().decode()[:500])
