CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'free',
  plan text,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.usage_daily (
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  messages integer NOT NULL DEFAULT 0,
  images integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

GRANT SELECT ON public.usage_daily TO authenticated;
GRANT ALL ON public.usage_daily TO service_role;
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own usage" ON public.usage_daily FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_pro(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.consume_quota(_user_id uuid, _kind text, _free_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pro boolean;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used integer;
BEGIN
  IF _kind NOT IN ('messages', 'images') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;

  _pro := public.is_pro(_user_id);

  INSERT INTO public.usage_daily (user_id, day, messages, images)
  VALUES (_user_id, _today, 0, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT CASE WHEN _kind = 'messages' THEN messages ELSE images END
  INTO _used
  FROM public.usage_daily
  WHERE user_id = _user_id AND day = _today;

  IF NOT _pro AND _used >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'is_pro', false, 'used', _used, 'limit', _free_limit);
  END IF;

  IF _kind = 'messages' THEN
    UPDATE public.usage_daily SET messages = messages + 1
    WHERE user_id = _user_id AND day = _today
    RETURNING messages INTO _used;
  ELSE
    UPDATE public.usage_daily SET images = images + 1
    WHERE user_id = _user_id AND day = _today
    RETURNING images INTO _used;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'is_pro', _pro, 'used', _used, 'limit', _free_limit);
END;
$$;