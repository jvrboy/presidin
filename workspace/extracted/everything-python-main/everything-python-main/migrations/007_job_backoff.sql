-- 007: retry backoff support for the jobs queue.
-- not_before lets claim_job() skip jobs whose retry delay hasn't elapsed.
alter table jobs add column if not exists not_before timestamptz not null default now();

create or replace function claim_job() returns setof jobs language plpgsql as $$
declare j jobs%rowtype;
begin
  select * into j from jobs
  where status = 'queued' and not_before <= now()
  order by not_before, created_at
  for update skip locked limit 1;
  if not found then return; end if;
  update jobs set status='running', started_at=now(), attempts=j.attempts+1 where id=j.id;
  return next (select * from jobs where id = j.id);
  return;
end; $$;
