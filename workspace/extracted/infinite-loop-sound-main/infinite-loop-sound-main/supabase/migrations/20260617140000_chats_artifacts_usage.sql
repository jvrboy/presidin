-- Phase 4 — Chat sidebar persistence.
--
-- chats          : a conversation thread (owned by auth.users)
-- chat_messages  : individual messages in a thread
-- chat_artifacts : generated artifacts (json/csv/html/etc.) attached to a chat
-- usage_events   : per-message token usage for the Usage panel
--
-- Each table has RLS so users can only see their own rows.

create table if not exists public.chats (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default 'New chat',
  pinned        boolean not null default false,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists chats_user_updated_idx on public.chats (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  chat_id       uuid not null references public.chats(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('system','user','assistant')),
  content       text not null,
  provider      text,
  created_at    timestamptz not null default now()
);

create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at);

create table if not exists public.chat_artifacts (
  id            uuid primary key default gen_random_uuid(),
  chat_id       uuid not null references public.chats(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('json','csv','html','css','js','ts','py','md','pdf','txt','other')),
  size_bytes    integer not null default 0,
  content       text,                -- inlined when small (<256KB)
  storage_path  text,                -- supabase storage key when larger
  created_at    timestamptz not null default now()
);

create index if not exists chat_artifacts_chat_idx on public.chat_artifacts (chat_id, created_at desc);
create index if not exists chat_artifacts_user_idx on public.chat_artifacts (user_id, created_at desc);

create table if not exists public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  chat_id       uuid references public.chats(id) on delete set null,
  provider      text not null,
  model         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens  integer generated always as (input_tokens + output_tokens) stored,
  created_at    timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

-- RLS
alter table public.chats          enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.chat_artifacts enable row level security;
alter table public.usage_events   enable row level security;

do $$ begin
  create policy "own chats"           on public.chats          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own chat_messages"   on public.chat_messages  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own chat_artifacts"  on public.chat_artifacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own usage_events"    on public.usage_events   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- updated_at trigger for chats
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chats_updated_at on public.chats;
create trigger chats_updated_at before update on public.chats
  for each row execute function public.touch_updated_at();
