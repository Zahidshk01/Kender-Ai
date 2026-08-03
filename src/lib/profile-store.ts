import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOwnerProfiles } from "@/lib/owner-profile";


export type UserProfile = {
  username: string;
  bio: string;
  avatar: string;
  stats: { following: number; followers: number; interactions: number };
};

const DEFAULT_PROFILE: UserProfile = {
  username: "@you",
  bio: "",
  avatar: "",
  stats: { following: 0, followers: 0, interactions: 0 },
};

let uid: string | null = null;
let snapshot: UserProfile = DEFAULT_PROFILE;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function loadFromDb() {
  if (!uid) {
    snapshot = DEFAULT_PROFILE;
    emit();
    return;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio")
    .eq("id", uid)
    .maybeSingle();
  // A wake-up request can briefly fail while the access token is refreshing.
  // Preserve the last known profile instead of making an existing user look
  // like a brand-new account with @you and zero activity.
  if (error) return;
  if (data) {
    const rawName = data.username || "";
    snapshot = {
      username: rawName ? (rawName.startsWith("@") ? rawName : `@${rawName.split(" ")[0].toLowerCase()}`) : "@you",
      avatar: data.avatar_url || "",
      bio: data.bio || "",
      stats: { following: 0, followers: 0, interactions: 0 },
    };
  }
  emit();
}

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    uid = data.session?.user.id ?? null;
    loadFromDb();
  });
  supabase.auth.onAuthStateChange((_e, s) => {
    // Keep the last authenticated snapshot during an automatic token-refresh
    // failure. The root auth provider owns explicit sign-out handling.
    if (!s) return;
    uid = s.user.id;
    loadFromDb();
  });
}

export async function updateProfile(patch: Partial<UserProfile>) {
  snapshot = { ...snapshot, ...patch };
  emit();
  if (!uid) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.username !== undefined) dbPatch.username = patch.username.replace(/^@/, "");
  if (patch.avatar !== undefined) dbPatch.avatar_url = patch.avatar;
  if (patch.bio !== undefined) dbPatch.bio = patch.bio;
  if (Object.keys(dbPatch).length === 0) return;
  await supabase
    .from("profiles")
    .upsert({ id: uid, ...dbPatch, updated_at: new Date().toISOString() });
  invalidateOwnerProfiles([uid]);
}


export function useProfile(): UserProfile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => DEFAULT_PROFILE,
  );
}
