ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS closed_at timestamptz;
UPDATE public.signals SET expires_at = date_trunc('day', created_at) + interval '1 day' WHERE expires_at IS NULL;
ALTER TABLE public.signals ALTER COLUMN expires_at SET DEFAULT (date_trunc('day', now() at time zone 'utc') + interval '1 day');
CREATE INDEX IF NOT EXISTS idx_signals_expires_at ON public.signals(expires_at);
CREATE INDEX IF NOT EXISTS idx_signals_status ON public.signals(status);

CREATE OR REPLACE FUNCTION public.expire_stale_signals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.signals
     SET status='expired', result=COALESCE(result,'EXPIRED'), closed_at=COALESCE(closed_at, now())
   WHERE expires_at < now()
     AND (status IS NULL OR status IN ('active','pending'))
     AND (result IS NULL OR result='');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;$$;
REVOKE ALL ON FUNCTION public.expire_stale_signals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_signals() TO anon, authenticated, service_role;

GRANT SELECT ON public.signals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
