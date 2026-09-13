CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  ip TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  status_code INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
CREATE INDEX IF NOT EXISTS webhook_events_created_idx ON public.webhook_events (created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.webhook_events TO anon;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events public read" ON public.webhook_events FOR SELECT TO anon USING (true);
CREATE POLICY "webhook_events public insert" ON public.webhook_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "webhook_events public delete" ON public.webhook_events FOR DELETE TO anon USING (true);
