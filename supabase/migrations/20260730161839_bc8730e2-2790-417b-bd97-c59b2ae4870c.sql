-- chat_rate_limits stores internal abuse-protection counters. It is written
-- exclusively by the SECURITY DEFINER function public.check_chat_rate_limit()
-- called from trusted server code with the service role (which bypasses RLS).
--
-- The table already had RLS enabled with zero policies, which denies every
-- app-user request. That deny was implicit; the policies below make it
-- explicit and self-documenting, so a future permissive policy cannot be
-- added by accident without someone noticing this intent.

ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rate_limits FORCE ROW LEVEL SECURITY;

-- Belt and braces: app-user roles hold no privileges on this table either.
REVOKE ALL ON public.chat_rate_limits FROM anon, authenticated;
GRANT ALL ON public.chat_rate_limits TO service_role;

DROP POLICY IF EXISTS "No client access to rate limit counters" ON public.chat_rate_limits;

-- RESTRICTIVE + `false` => nothing an app user does can ever satisfy it,
-- regardless of any other policy that might be introduced later.
CREATE POLICY "No client access to rate limit counters"
  ON public.chat_rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);