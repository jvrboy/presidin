-- Broker reconciliation table + shadow-mode trades + model registry
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  direction text not null,
  contract_id text unique,
  buy_price numeric,
  sell_price numeric,
  profit numeric,
  status text default 'open',
  entry_epoch bigint not null,
  exit_epoch bigint,
  mode text not null default 'demo',
  confidence numeric,
  agreement numeric,
  net_score numeric,
  features jsonb,
  agent_votes jsonb,
  model_versions jsonb,
  review_label text,
  review_accept boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists trades_symbol_epoch_idx on public.trades (symbol, entry_epoch desc);
create index if not exists trades_contract_id_idx on public.trades (contract_id);
create index if not exists trades_review_idx on public.trades (review_label) where review_label is not null;

create table if not exists public.reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz default now(),
  matched int,
  mismatched int,
  orphan_local int,
  orphan_broker int,
  health_ok boolean,
  health_reason text,
  raw jsonb
);

create table if not exists public.model_registry (
  id uuid primary key default gen_random_uuid(),
  version text unique not null,
  created_at timestamptz default now(),
  mode text default 'research',
  win_rate numeric,
  profit_factor numeric,
  sharpe numeric,
  sample_size int,
  max_dd_pct numeric,
  parent_version text,
  registry_url text,
  notes text
);

create table if not exists public.model_promotions (
  id uuid primary key default gen_random_uuid(),
  version text references public.model_registry(version) on delete cascade,
  from_mode text,
  to_mode text,
  passed boolean,
  failures jsonb,
  decided_at timestamptz default now(),
  decided_by text
);

create table if not exists public.monte_carlo_results (
  id uuid primary key default gen_random_uuid(),
  version text,
  run_at timestamptz default now(),
  bootstrap_prob_positive numeric,
  bootstrap_mean numeric,
  bootstrap_p05 numeric,
  bootstrap_p95 numeric,
  dd_p05 numeric,
  dd_mean numeric,
  samples int,
  raw jsonb
);
