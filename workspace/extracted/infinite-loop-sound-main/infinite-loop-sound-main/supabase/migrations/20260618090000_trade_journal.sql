-- Trade Journal — per-user notes attached to trades or instruments.
--
-- Replaces the in-memory sample data in src/routes/journal.tsx with a real
-- Supabase-backed CRUD surface. RLS ensures each authenticated user only sees
-- their own entries. The route falls back to localStorage when the user is
-- not signed in.

create table if not exists public.trade_journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pair        text not null default 'General',
  note        text not null,
  outcome     text check (outcome in ('win','loss','breakeven','missed','setup','review')),
  rr          numeric,                       -- realised R multiple, optional
  screenshot  text,                          -- URL to an upload (storage bucket)
  tags        text[] not null default '{}',
  trade_id    uuid,                          -- optional FK to bot_trades.id (not enforced)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trade_journal_user_created_idx
  on public.trade_journal (user_id, created_at desc);
create index if not exists trade_journal_pair_idx
  on public.trade_journal (user_id, pair);

alter table public.trade_journal enable row level security;

do $$ begin
  create policy "own journal rows"
    on public.trade_journal
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- updated_at auto-touch (reuses Phase 4 touch_updated_at() if present, else
-- creates a local copy).
do $$ begin
  perform 1 from pg_proc where proname = 'touch_updated_at';
exception when others then null; end $$;

create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trade_journal_updated_at on public.trade_journal;
create trigger trade_journal_updated_at
  before update on public.trade_journal
  for each row execute function public.touch_updated_at();
