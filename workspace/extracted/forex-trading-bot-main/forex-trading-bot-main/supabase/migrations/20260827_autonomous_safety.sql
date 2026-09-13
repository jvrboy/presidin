-- Autonomous trading safety primitives. Apply through Supabase MCP before enabling execution.
create table if not exists public.bot_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  worker_id text not null,
  request_id text not null unique,
  status text not null default 'RUNNING',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  lease_expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists bot_runs_active_type_idx on public.bot_runs(run_type) where status = 'RUNNING';
create table if not exists public.trade_events (
  id uuid primary key default gen_random_uuid(), trade_id uuid references public.trades(id) on delete set null,
  event_type text not null, request_id text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists trade_events_trade_idx on public.trade_events(trade_id, created_at desc);
create table if not exists public.health_snapshots (
  id uuid primary key default gen_random_uuid(), worker_id text not null, status text not null,
  heartbeat_at timestamptz not null default now(), latency_ms integer, checks jsonb not null default '{}'::jsonb
);
create table if not exists public.model_registry (
  id uuid primary key default gen_random_uuid(), name text not null, version text not null,
  status text not null default 'SHADOW', metrics jsonb not null default '{}'::jsonb,
  feature_hash text, approved_at timestamptz, created_at timestamptz not null default now(), unique(name, version)
);
create table if not exists public.trade_lessons (
  id uuid primary key default gen_random_uuid(), trade_id uuid references public.trades(id) on delete set null,
  symbol text not null, label text not null, lesson text, features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(), status text not null, open_local integer not null default 0,
  open_broker integer not null default 0, anomalies jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
alter table public.bot_runs enable row level security;
alter table public.trade_events enable row level security;
alter table public.health_snapshots enable row level security;
alter table public.model_registry enable row level security;
alter table public.trade_lessons enable row level security;
alter table public.reconciliation_runs enable row level security;
revoke all on public.bot_runs, public.trade_events, public.health_snapshots, public.model_registry, public.trade_lessons, public.reconciliation_runs from anon, authenticated;
create or replace function public.acquire_bot_lease(p_run_type text, p_worker_id text, p_request_id text, p_lease_seconds integer default 90)
returns boolean language plpgsql security invoker set search_path = public as $$
declare acquired boolean;
begin
  update public.bot_runs set status='EXPIRED', finished_at=now() where run_type=p_run_type and status='RUNNING' and lease_expires_at < now();
  insert into public.bot_runs(run_type, worker_id, request_id, lease_expires_at)
  values(p_run_type,p_worker_id,p_request_id,now()+make_interval(secs=>p_lease_seconds))
  on conflict (request_id) do nothing;
  get diagnostics acquired = row_count;
  return acquired;
exception when unique_violation then return false;
end; $$;
create or replace function public.release_bot_lease(p_request_id text, p_status text default 'SUCCEEDED')
returns void language sql security invoker set search_path = public as $$
update public.bot_runs set status=p_status, finished_at=now() where request_id=p_request_id and status='RUNNING';
$$;
