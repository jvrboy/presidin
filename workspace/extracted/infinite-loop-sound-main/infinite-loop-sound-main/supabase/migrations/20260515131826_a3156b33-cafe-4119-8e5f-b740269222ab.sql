-- Manual divergence validations (for accuracy stats)
CREATE TABLE IF NOT EXISTS public.divergence_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair text NOT NULL,
  timeframe text NOT NULL,
  oscillator text NOT NULL,
  div_type text,
  is_valid boolean NOT NULL,
  price_pivots jsonb NOT NULL DEFAULT '[]'::jsonb,
  osc_pivots jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.divergence_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Validations public read" ON public.divergence_validations FOR SELECT USING (true);
CREATE POLICY "Validations public insert" ON public.divergence_validations FOR INSERT WITH CHECK (true);

-- Economic events cache
CREATE TABLE IF NOT EXISTS public.economic_events_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time timestamptz NOT NULL,
  currency text NOT NULL,
  title text NOT NULL,
  impact text NOT NULL DEFAULT 'low',
  forecast text,
  previous text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_econ_event_time ON public.economic_events_cache(event_time);
ALTER TABLE public.economic_events_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Econ public read" ON public.economic_events_cache FOR SELECT USING (true);

-- Add theme + news skip to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'midnight';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS skip_news boolean NOT NULL DEFAULT false;

-- Add validation column to signals for tracking manual marks (links to drawer)
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS user_marked text;