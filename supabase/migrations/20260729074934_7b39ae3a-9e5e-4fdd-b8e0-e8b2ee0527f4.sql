-- 1. chat_rate_limits: server-only. Remove any API-role privileges, keep RLS on with no policies.
REVOKE ALL ON TABLE public.chat_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.chat_rate_limits TO service_role;
ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rate_limits FORCE ROW LEVEL SECURITY;

-- 2. SECURITY DEFINER functions must not be callable by app users.
REVOKE ALL ON FUNCTION public.check_chat_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_chat_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.consume_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_username_available(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. subscriptions realtime: billing rows stay owner-only; no anonymous access.
REVOKE ALL ON TABLE public.subscriptions FROM anon;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;