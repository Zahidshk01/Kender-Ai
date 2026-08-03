import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

let uid: string | null = null;
let snapshot: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  if (!uid) {
    snapshot = [];
    emit();
    return;
  }
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_target")
    .eq("blocker_id", uid);
  snapshot = (data ?? []).map((r: any) => r.blocked_target);
  emit();
}

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    uid = data.session?.user.id ?? null;
    load();
  });
  supabase.auth.onAuthStateChange((_e, s) => {
    if (!s) return;
    uid = s.user.id;
    load();
  });
}

export function useBlockedTargets(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => [],
  );
}

export function getBlockedTargetsSync(): string[] {
  return snapshot;
}

export async function blockTarget(target: string) {
  if (!uid) return;
  snapshot = Array.from(new Set([...snapshot, target]));
  emit();
  await supabase.from("user_blocks").upsert({ blocker_id: uid, blocked_target: target });
}

export async function unblockTarget(target: string) {
  if (!uid) return;
  snapshot = snapshot.filter((t) => t !== target);
  emit();
  await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", uid)
    .eq("blocked_target", target);
}

export async function reportTarget(target: string, reason: string, details?: string) {
  if (!uid) return;
  await supabase.from("user_reports").insert({
    reporter_id: uid,
    reported_target: target,
    reason,
    details: details ?? null,
  });
}
