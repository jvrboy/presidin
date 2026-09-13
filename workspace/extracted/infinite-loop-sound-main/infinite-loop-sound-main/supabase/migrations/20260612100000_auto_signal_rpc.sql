-- RPC for the public scanner hook to insert signals without needing the service role key.
-- Performs server-side dedupe against active signals for the same pair|tf|direction.
CREATE OR REPLACE FUNCTION public.create_auto_signal(
  p_pair text, p_timeframe text, p_direction text,
  p_entry numeric, p_sl numeric, p_tp1 numeric, p_tp2 numeric, p_tp3 numeric,
  p_score integer, p_rating text, p_confluence jsonb,
  p_dedupe_minutes integer DEFAULT 30
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dup_id uuid;
  new_id uuid;
  exp_at timestamptz;
BEGIN
  -- dedupe: same pair|tf|direction still active within window
  SELECT id INTO dup_id FROM public.signals
   WHERE pair = p_pair AND timeframe = p_timeframe AND direction = p_direction
     AND (status IS NULL OR status IN ('active','pending'))
     AND created_at > now() - make_interval(mins => GREATEST(p_dedupe_minutes,1))
   LIMIT 1;
  IF dup_id IS NOT NULL THEN RETURN NULL; END IF;

  exp_at := date_trunc('day', now() at time zone 'utc') + interval '1 day';

  INSERT INTO public.signals(
    pair, timeframe, direction, entry, sl, tp1, tp2, tp3,
    score, rating, confluence, source, status, expires_at
  ) VALUES (
    p_pair, p_timeframe, p_direction, p_entry, p_sl, p_tp1, p_tp2, p_tp3,
    p_score, p_rating, p_confluence, 'auto_scan', 'active', exp_at
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;$$;

REVOKE ALL ON FUNCTION public.create_auto_signal(text,text,text,numeric,numeric,numeric,numeric,numeric,integer,text,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_auto_signal(text,text,text,numeric,numeric,numeric,numeric,numeric,integer,text,jsonb,integer)
  TO anon, authenticated, service_role;
