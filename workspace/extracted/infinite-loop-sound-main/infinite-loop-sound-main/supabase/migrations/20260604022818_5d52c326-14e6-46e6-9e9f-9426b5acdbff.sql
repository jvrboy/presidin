
-- 1. Idempotency table for inbound signed webhooks
CREATE TABLE IF NOT EXISTS public.webhook_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  source text NOT NULL,
  signal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.webhook_idempotency TO anon;
GRANT ALL ON public.webhook_idempotency TO service_role;
ALTER TABLE public.webhook_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "idem public manage" ON public.webhook_idempotency FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Dead-letter queue for trade reconciliation failures
CREATE TABLE IF NOT EXISTS public.bot_trades_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL,
  contract_id text,
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_trades_dlq TO anon;
GRANT ALL ON public.bot_trades_dlq TO service_role;
ALTER TABLE public.bot_trades_dlq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dlq public manage" ON public.bot_trades_dlq FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. Admin alerts
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'warn',
  kind text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_alerts TO anon;
GRANT ALL ON public.admin_alerts TO service_role;
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts public manage" ON public.admin_alerts FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. API key expiry
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 5. Bot trade retry metadata
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dlq_pending ON public.bot_trades_dlq (resolved, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON public.admin_alerts (created_at DESC);
