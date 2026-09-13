
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry NUMERIC NOT NULL,
  sl NUMERIC NOT NULL,
  tp1 NUMERIC NOT NULL,
  tp2 NUMERIC NOT NULL,
  tp3 NUMERIC NOT NULL,
  score INT NOT NULL,
  rating TEXT NOT NULL,
  confluence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  result TEXT,
  sent_telegram BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signals_created ON public.signals(created_at DESC);
CREATE INDEX idx_signals_pair ON public.signals(pair);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signals public read" ON public.signals FOR SELECT USING (true);

CREATE TABLE public.telegram_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  min_score INT NOT NULL DEFAULT 70,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;
-- No public policies; backend-only access via service role.

CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  min_score INT NOT NULL DEFAULT 60,
  pairs TEXT[] NOT NULL DEFAULT ARRAY['frxEURUSD','frxGBPUSD','frxUSDJPY','frxAUDUSD','frxUSDCAD','frxUSDCHF','frxNZDUSD','frxEURJPY','frxGBPJPY','frxEURGBP'],
  timeframes TEXT[] NOT NULL DEFAULT ARRAY['M5','M15','M30','H1','H4','D1'],
  auto_telegram BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT singleton CHECK (id = 1)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings public read" ON public.app_settings FOR SELECT USING (true);

INSERT INTO public.app_settings (id) VALUES (1);
