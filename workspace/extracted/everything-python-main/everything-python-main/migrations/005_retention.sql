-- 005: retention policy — prune high-volume tables beyond their window.
-- Schedule with pg_cron (Supabase: Database -> Extensions -> pg_cron), e.g.:
--   select cron.schedule('nightly-retention', '0 3 * * *', 'select run_retention()');
create or replace function run_retention() returns void language plpgsql as $$
begin
  delete from rate_limit_events where created_at < now() - interval '7 days';
  delete from activity_log where created_at < now() - interval '180 days';
  delete from audit_log where created_at < now() - interval '365 days';
  delete from jobs where status in ('completed','failed','cancelled') and finished_at < now() - interval '90 days';
  delete from sessions where expires_at < now() - interval '7 days';
end; $$;
