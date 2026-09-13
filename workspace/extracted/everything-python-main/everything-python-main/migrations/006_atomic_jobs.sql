-- 006: atomic job claiming + activity_log safety
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  event text not null, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table activity_log enable row level security;

-- Atomic claim: one worker takes one queued job, no double-execution.
create or replace function claim_job() returns setof jobs language plpgsql as $$
declare j jobs%rowtype;
begin
  select * into j from jobs where status = 'queued'
  order by created_at for update skip locked limit 1;
  if not found then return; end if;
  update jobs set status='running', started_at=now(), attempts=j.attempts+1 where id=j.id;
  return next (select * from jobs where id = j.id);
  return;
end; $$;
