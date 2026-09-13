CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('diq-keepalive-1m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'diq-keepalive-1m',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://confluence-divergence-engine.lovable.app/api/public/hooks/keepalive',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtha3N0eG1xdHd4enBzb2NiZXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTYxNTUsImV4cCI6MjA5NDA3MjE1NX0.0vWOTjtq9lFAvUtsxIWXXrNXQtCUpSLkAjZHMfF-OUQ"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  );
  $cron$
);