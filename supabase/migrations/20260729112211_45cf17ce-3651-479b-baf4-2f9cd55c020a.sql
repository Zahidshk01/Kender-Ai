ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_until timestamptz;

CREATE OR REPLACE FUNCTION public.sync_profile_pro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET is_pro = (NEW.status IN ('active','trialing')
                AND (NEW.current_period_end IS NULL OR NEW.current_period_end > now())),
      pro_until = NEW.current_period_end,
      updated_at = now()
  WHERE p.id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_pro_trg ON public.subscriptions;
CREATE TRIGGER sync_profile_pro_trg
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_pro();

UPDATE public.profiles p
SET is_pro = (s.status IN ('active','trialing')
              AND (s.current_period_end IS NULL OR s.current_period_end > now())),
    pro_until = s.current_period_end
FROM public.subscriptions s
WHERE s.user_id = p.id;