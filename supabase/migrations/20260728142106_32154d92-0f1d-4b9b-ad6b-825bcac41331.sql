REVOKE EXECUTE ON FUNCTION public.is_username_available(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO authenticated;