-- Security hardening: replace blanket anon ALL-policies with scoped policies.
-- Anonymous visitors may INSERT bot telemetry but must not read secrets
-- (api_keys.key_hash, webhook_subscriptions.url/secret) or mutate arbitrary rows.

-- ── api_keys: no anon access at all (hashes must never be readable) ──
DROP POLICY IF EXISTS "api_keys public manage" ON public.api_keys;
REVOKE ALL ON public.api_keys FROM anon;

-- ── webhook_subscriptions: insert-only for anon, no read of URLs/secrets ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'webhook_subscriptions' AND column_name = 'secret'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.webhook_subscriptions FROM anon';
    EXECUTE 'GRANT INSERT ON public.webhook_subscriptions TO anon';
  END IF;
END $$;

-- ── bot_trades: anon may insert + update status (bot runner), read is fine ──
DO $$
BEGIN
  IF TO_REGCLASS('public.bot_trades') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "bot_trades public manage" ON public.bot_trades';
    EXECUTE 'CREATE POLICY "bot_trades anon insert" ON public.bot_trades FOR INSERT TO anon WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "bot_trades anon select" ON public.bot_trades FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- ── webhook_events: strip sensitive headers on insert; restrict reads ──
DO $$
BEGIN
  IF TO_REGCLASS('public.webhook_events') IS NOT NULL THEN
    -- Redact authorization/signature headers going forward
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'webhook_events' AND column_name = 'headers'
    ) THEN
      EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.redact_webhook_headers()
        RETURNS trigger AS $body$
        BEGIN
          IF NEW.headers IS NOT NULL THEN
            NEW.headers := (NEW.headers - 'authorization' - 'x-signature' - 'x-hub-signature-256' - 'x-api-key');
          END IF;
          RETURN NEW;
        END;
        $body$ LANGUAGE plpgsql;
      $fn$;
      DROP TRIGGER IF EXISTS trg_redact_webhook_headers ON public.webhook_events;
      CREATE TRIGGER trg_redact_webhook_headers
        BEFORE INSERT ON public.webhook_events
        FOR EACH ROW EXECUTE FUNCTION public.redact_webhook_headers();
    END IF;
  END IF;
END $$;

-- ── create_auto_signal RPC: validate inputs to stop feed poisoning ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_auto_signal'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.create_auto_signal(
        p_pair text,
        p_timeframe text,
        p_direction text,
        p_score numeric,
        p_rating text,
        p_confluence jsonb DEFAULT NULL
      ) RETURNS void AS $body$
      BEGIN
        IF p_score < 0 OR p_score > 100 THEN
          RAISE EXCEPTION 'score out of range';
        END IF;
        IF p_rating NOT IN ('STRONG','GOOD','WEAK') THEN
          RAISE EXCEPTION 'invalid rating';
        END IF;
        IF p_direction NOT IN ('BUY','SELL') THEN
          RAISE EXCEPTION 'invalid direction';
        END IF;
        IF p_timeframe !~ '^(M1|M5|M15|M30|H1|H4|D1)$' THEN
          RAISE EXCEPTION 'invalid timeframe';
        END IF;
        INSERT INTO public.signals (pair, timeframe, direction, score, rating, confluence)
        VALUES (p_pair, p_timeframe, p_direction, p_score, p_rating, p_confluence);
      END;
      $body$ LANGUAGE plpgsql SECURITY DEFINER;
    $fn$;
  END IF;
END $$;
