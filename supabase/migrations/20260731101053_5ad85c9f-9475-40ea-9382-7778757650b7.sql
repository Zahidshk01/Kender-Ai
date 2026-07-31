CREATE OR REPLACE FUNCTION public.owner_character_chat_total(_owner uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(DISTINCT (m.user_id, m.character_id)), 0)::bigint
  FROM public.chat_messages m
  JOIN public.characters c ON c.id = m.character_id
  WHERE c.owner_id = _owner
    AND _owner = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.owner_character_chat_total(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_character_chat_total(uuid) TO authenticated;