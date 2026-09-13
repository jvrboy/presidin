-- Core DivergenceIQ schema
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pair text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry numeric NOT NULL,
  sl numeric NOT NULL,
  tp1 numeric NOT NULL,
  tp2 numeric NOT NULL,
  tp3 numeric NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rating text NOT NULL DEFAULT 'WEAK',
  confluence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  result text,
  source text DEFAULT 'manual'
);

CREATE INDEX idx_signals_created ON public.signals(created_at DESC);
CREATE INDEX idx_signals_pair ON public.signals(pair);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signals public read" ON public.signals FOR SELECT USING (true);

CREATE TABLE public.telegram_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text UNIQUE NOT NULL,
  min_score integer DEFAULT 65,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Telegram public manage" ON public.telegram_subscribers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings public read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Settings public write" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (key, value) VALUES
  ('telegram', '{"configured":false}'::jsonb),
  ('engine', '{"autoScan":false,"intervalMinutes":5,"minScore":65}'::jsonb)
ON CONFLICT (key) DO NOTHING;