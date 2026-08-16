import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/character-images";
import type { Character } from "@/lib/character";

/**
 * One shared, cached characters query for the whole app.
 * Home / Search / Chats reuse the same cache entry, so switching tabs is
 * instant instead of re-hitting the network on every mount.
 */
async function fetchCharacters(publicOnly: boolean): Promise<Character[]> {
  let query = (supabase as any)
    .from("characters")
    .select(
      "id, name, image, creator, chats, category, height, tagline, relation, persona, first_message, owner_id, visibility, sort_order",
    )
    .order("sort_order", { ascending: true });

  if (publicOnly) query = query.eq("visibility", "public");

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Character[]).map((c) => ({
    ...c,
    image: resolveImage(c.id, c.image),
  }));
}

export const charactersQuery = (publicOnly = false) =>
  queryOptions({
    queryKey: ["characters", publicOnly ? "public" : "all"] as const,
    queryFn: () => fetchCharacters(publicOnly),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
