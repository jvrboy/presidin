CREATE TABLE public.keepalive_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'browser',
  ok boolean NOT NULL DEFAULT false,
  zo_ok boolean,
  zo_status integer,
  zo_error text,
  duration_ms integer,
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keepalive_logs TO anon, authenticated;
GRANT ALL ON public.keepalive_logs TO service_role;
ALTER TABLE public.keepalive_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "keepalive_logs public manage" ON public.keepalive_logs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX keepalive_logs_created_at_idx ON public.keepalive_logs (created_at DESC);