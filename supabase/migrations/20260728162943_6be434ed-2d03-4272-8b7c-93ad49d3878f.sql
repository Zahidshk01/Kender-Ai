REVOKE ALL ON FUNCTION public.consume_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO authenticated, service_role;