-- 001: core app tables (users, sessions, rate limiting, audit)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  id text primary key,
  user_id uuid references users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_expiry on sessions (expires_at);
create table if not exists rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_limit_key_time on rate_limit_events (key, created_at);
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_time on audit_log (created_at desc);
