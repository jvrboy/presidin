CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metric text NOT NULL,
  comparator text NOT NULL DEFAULT 'gte',
  threshold numeric NOT NULL DEFAULT 0,
  direction text,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO anon, authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules public manage" ON public.alert_rules FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER alert_rules_touch BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();