create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',   -- queued|running|completed|failed|cancelled
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists idx_jobs_status on jobs (status, created_at);
alter table jobs enable row level security;
