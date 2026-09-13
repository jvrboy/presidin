-- Telegram remote-control persistence + 24/7 keepalive tables
create table if not exists public.bot_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.bot_subscribers (
  chat_id bigint primary key,
  active boolean default true,
  updated_at timestamptz default now()
);

create table if not exists public.keepalive_pings (
  id bigserial primary key,
  worker text not null,
  status text not null,
  latency_ms int,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists keepalive_pings_worker_time_idx on public.keepalive_pings (worker, created_at desc);

-- Seed defaults so /status has something to read on a fresh install
insert into public.bot_settings (key, value) values ('trading_mode', to_jsonb('paper'::text))
  on conflict (key) do nothing;
insert into public.bot_settings (key, value) values ('kill_switch', to_jsonb(false))
  on conflict (key) do nothing;
insert into public.bot_settings (key, value) values ('paused_until', to_jsonb(0))
  on conflict (key) do nothing;
insert into public.bot_settings (key, value) values ('symbols', jsonb_build_array('R_10','R_25','R_50','R_75','R_100'))
  on conflict (key) do nothing;
