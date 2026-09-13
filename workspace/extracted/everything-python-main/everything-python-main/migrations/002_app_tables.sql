create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  event text not null, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_log_time on activity_log (created_at desc);

-- 002: application tables referenced by the app (idempotent)
create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'fact', key text not null, value text,
  importance int not null default 5, created_at timestamptz not null default now(),
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
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  name text not null, mime_type text, data_base64 text, size bigint,
  created_at timestamptz not null default now()
);
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(), title text not null default 'New chat',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(), thread_id uuid references chat_threads(id) on delete cascade,
  role text not null, content text, created_at timestamptz not null default now()
);
