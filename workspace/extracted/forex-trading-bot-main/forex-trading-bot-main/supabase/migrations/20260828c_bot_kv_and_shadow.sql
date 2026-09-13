-- Safe KV store (does NOT alter legacy bot_settings id=1 row schema)
create table if not exists public.bot_kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

insert into public.bot_kv (key, value) values
  ('trading_mode', to_jsonb('paper'::text)),
  ('kill_switch', to_jsonb(false)),
  ('paused_until', to_jsonb(0))
on conflict (key) do nothing;

-- Optional columns on trades for shadow + review (ignore if already present)
do $$ begin
  alter table public.trades add column if not exists mode text default 'demo';
  alter table public.trades add column if not exists review_label text;
  alter table public.trades add column if not exists review_accept boolean;
  alter table public.trades add column if not exists agreement numeric;
  alter table public.trades add column if not exists features jsonb;
exception when others then null;
end $$;

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

create table if not exists public.keepalive_pings (
  id bigserial primary key,
  worker text not null,
  status text not null,
  latency_ms int,
  meta jsonb,
  created_at timestamptz default now()
);
