import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const listeners = new Set<() => void>();
let uid: string | null = null;
let snapshot: string[] = [];

function emit() {
  listeners.forEach((l) => l());
}

async function loadFromDb() {
  if (!uid) {
    snapshot = [];
    emit();
    return;
  }
  const { data, error } = await supabase
    .from("user_likes")
    .select("character_id")
    .eq("user_id", uid);
  if (error) return;
  snapshot = (data ?? []).map((r) => r.character_id);
  emit();
}

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    uid = data.session?.user.id ?? null;
    loadFromDb();
  });
  supabase.auth.onAuthStateChange((_e, s) => {
    if (!s) return;
    uid = s.user.id;
    loadFromDb();
  });
}

export async function toggleLiked(id: string) {
  if (!uid) return false;
  const isLiked = snapshot.includes(id);
  if (isLiked) {
    snapshot = snapshot.filter((x) => x !== id);
    emit();
    await supabase.from("user_likes").delete().eq("user_id", uid).eq("character_id", id);
    return false;
  } else {
    snapshot = [...snapshot, id];
    emit();
    await supabase.from("user_likes").insert({ user_id: uid, character_id: id });
    return true;
  }
}

export function useLikedIds() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => [],
  );
}

export function useIsLiked(id: string) {
  return useLikedIds().includes(id);
}
