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
    .from("user_saves")
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

export async function toggleSaved(id: string) {
  if (!uid) return false;
  const isSaved = snapshot.includes(id);
  if (isSaved) {
    snapshot = snapshot.filter((x) => x !== id);
    emit();
    await supabase.from("user_saves").delete().eq("user_id", uid).eq("character_id", id);
    return false;
  } else {
    snapshot = [...snapshot, id];
    emit();
    await supabase.from("user_saves").insert({ user_id: uid, character_id: id });
    return true;
  }
}

export function useSavedIds() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => [],
  );
}

export function useIsSaved(id: string) {
  return useSavedIds().includes(id);
}
