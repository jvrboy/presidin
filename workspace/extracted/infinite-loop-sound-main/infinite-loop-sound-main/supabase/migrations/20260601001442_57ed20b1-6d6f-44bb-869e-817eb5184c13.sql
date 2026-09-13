
-- 1) Webhook signing secret + delivery timestamp
ALTER TABLE public.webhook_subscriptions
  ADD COLUMN IF NOT EXISTS secret text,
  ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz;

-- 2) Bot trade reconciliation fields
ALTER TABLE public.bot_trades
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout numeric,
  ADD COLUMN IF NOT EXISTS profit numeric;

-- 3) Daily PnL summary
CREATE TABLE IF NOT EXISTS public.bot_pnl_daily (
  day date PRIMARY KEY,
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bot_pnl_daily TO anon;
GRANT ALL ON public.bot_pnl_daily TO service_role;
ALTER TABLE public.bot_pnl_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pnl public manage" ON public.bot_pnl_daily;
CREATE POLICY "pnl public manage" ON public.bot_pnl_daily FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4) Tighten/complete policies on existing tables (idempotent)
-- signals: allow public insert/update so engine + reconciliation work end-to-end
DROP POLICY IF EXISTS "Signals public insert" ON public.signals;
CREATE POLICY "Signals public insert" ON public.signals FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Signals public update" ON public.signals;
CREATE POLICY "Signals public update" ON public.signals FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- telegram_subscribers had RLS enabled with no policies; add public manage
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tg subs public manage" ON public.telegram_subscribers;
CREATE POLICY "tg subs public manage" ON public.telegram_subscribers FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_subscribers TO anon;

-- app_settings update policy (was read-only)
DROP POLICY IF EXISTS "Settings public update" ON public.app_settings;
CREATE POLICY "Settings public update" ON public.app_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
GRANT UPDATE ON public.app_settings TO anon;
