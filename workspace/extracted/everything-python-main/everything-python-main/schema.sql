-- Python clone tables (run once in Supabase SQL editor or via Management API)
create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'fact',
  key text not null,
  value text,
  importance int not null default 5,
  created_at timestamptz not null default now(),
  unique(kind, key)
);
create table if not exists signal_predictions (
  id uuid primary key default gen_random_uuid(),
  instrument text not null, bias text, entry double precision, tp double precision, sl double precision,
  confidence int, strategies text, status text not null default 'open', exit_price double precision,
  created_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists strategy_weights (
  strategy text primary key, wins int not null default 0, total int not null default 0,
  accuracy double precision, updated_at timestamptz not null default now()
);
