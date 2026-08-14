CREATE OR REPLACE FUNCTION public.character_stats(_ids text[])
RETURNS TABLE (character_id text, likes bigint, saves bigint, chats bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS character_id,
    (SELECT COUNT(*) FROM public.user_likes l WHERE l.character_id = c.id)::bigint AS likes,
    (SELECT COUNT(*) FROM public.user_saves s WHERE s.character_id = c.id)::bigint AS saves,
    (SELECT COUNT(DISTINCT m.user_id) FROM public.chat_messages m WHERE m.character_id = c.id)::bigint AS chats
  FROM public.characters c
  WHERE c.id = ANY(_ids)
    AND (c.visibility = 'public' OR c.owner_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.character_stats(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.character_stats(text[]) TO anon, authenticated;