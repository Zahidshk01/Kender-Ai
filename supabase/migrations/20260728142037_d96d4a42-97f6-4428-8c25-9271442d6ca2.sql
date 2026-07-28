CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_username_available(_username text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(trim(both '@' from _username))
      AND id IS DISTINCT FROM _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO authenticated;