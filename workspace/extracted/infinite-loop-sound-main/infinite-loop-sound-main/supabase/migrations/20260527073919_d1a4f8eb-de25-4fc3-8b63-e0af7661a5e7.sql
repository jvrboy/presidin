
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  last4 text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO anon;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys public manage" ON public.api_keys FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE public.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  min_score int NOT NULL DEFAULT 70,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_subscriptions TO anon;
GRANT ALL ON public.webhook_subscriptions TO service_role;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks public manage" ON public.webhook_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE public.bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair text NOT NULL,
  direction text NOT NULL,
  lot numeric NOT NULL,
  entry numeric,
  account_type text NOT NULL DEFAULT 'demo',
  status text NOT NULL DEFAULT 'pending',
  contract_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_trades TO anon;
GRANT ALL ON public.bot_trades TO service_role;
ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_trades public manage" ON public.bot_trades FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE public.system_health (
  id int PRIMARY KEY DEFAULT 1,
  last_ping timestamptz NOT NULL DEFAULT now(),
  ws_ok boolean NOT NULL DEFAULT true,
  notes text,
  CONSTRAINT health_single CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.system_health TO anon;
GRANT ALL ON public.system_health TO service_role;
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health public read" ON public.system_health FOR SELECT TO anon USING (true);
CREATE POLICY "health public write" ON public.system_health FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "health public insert" ON public.system_health FOR INSERT TO anon WITH CHECK (true);

INSERT INTO public.system_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
