import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OwnerProfile = { username: string | null; avatar_url: string | null; is_pro: boolean };

const cache = new Map<string, OwnerProfile>();
const inflight = new Map<string, Promise<OwnerProfile>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function fetchProfile(id: string): Promise<OwnerProfile> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = (async () => {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("username, avatar_url, is_pro, pro_until")
      .eq("id", id)
      .maybeSingle();
    const val: OwnerProfile = {
      username: data?.username ?? null,
      avatar_url: data?.avatar_url ?? null,
      is_pro: Boolean(data?.is_pro) && (!data?.pro_until || new Date(data.pro_until).getTime() > Date.now()),
    };
    cache.set(id, val);
    inflight.delete(id);
    emit();
    return val;
  })();
  inflight.set(id, p);
  return p;
}

/** Notify all subscribers that profile data changed (call after saving). */
export function invalidateOwnerProfiles(ids?: string[]) {
  if (ids && ids.length) {
    ids.forEach((id) => cache.delete(id));
  } else {
    cache.clear();
  }
  // Refetch any currently observed profiles by triggering listeners
  emit();
}

export function useOwnerProfile(ownerId: string | null | undefined): OwnerProfile | null {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    if (!cache.has(ownerId)) {
      void fetchProfile(ownerId);
    }
  }, [ownerId]);

  if (!ownerId) return null;
  return cache.get(ownerId) ?? null;
}
