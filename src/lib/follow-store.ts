import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const listeners = new Set<() => void>();
let uid: string | null = null;
let followingSnap: string[] = [];
let followersSnap: string[] = [];

function emit() {
  listeners.forEach((l) => l());
}

function normalize(handle: string) {
  const h = handle.trim();
  return h.startsWith("@") ? h : `@${h}`;
}

async function loadFromDb() {
  if (!uid) {
    followingSnap = [];
    followersSnap = [];
    emit();
    return;
  }
  const [{ data: fList }, { data: followerRows }] = await Promise.all([
    supabase.from("user_follows").select("handle").eq("user_id", uid),
    (supabase as any)
      .from("user_user_follows")
      .select("follower_id")
      .eq("followed_id", uid),
  ]);
  followingSnap = (fList ?? []).map((r: any) => r.handle);

  const followerIds = (followerRows ?? []).map((r: any) => r.follower_id);
  if (followerIds.length > 0) {
    const { data: profs } = await (supabase as any)
      .from("profiles")
      .select("username")
      .in("id", followerIds);
    followersSnap = (profs ?? [])
      .map((p: any) => p.username)
      .filter(Boolean)
      .map((u: string) => (u.startsWith("@") ? u : `@${u}`));
  } else {
    followersSnap = [];
  }
  emit();
}

export async function refreshFollows() {
  await loadFromDb();
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function setupRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!uid) return;
  realtimeChannel = supabase
    .channel(`user_user_follows:${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_user_follows" },
      (payload: any) => {
        const row = payload.new ?? payload.old ?? {};
        if (row.follower_id === uid || row.followed_id === uid) {
          loadFromDb();
          window.dispatchEvent(new CustomEvent("kender:follows-changed"));
        } else {
          // Someone else's follow — still notify count listeners viewing that profile.
          window.dispatchEvent(new CustomEvent("kender:follows-changed"));
        }
      },
    )
    .subscribe();
}

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    uid = data.session?.user.id ?? null;
    loadFromDb();
    setupRealtime();
  });
  supabase.auth.onAuthStateChange((_e, s) => {
    if (!s) return;
    uid = s.user.id;
    loadFromDb();
    setupRealtime();
  });
  window.addEventListener("kender:follows-changed", () => {
    loadFromDb();
  });
}


export async function toggleFollow(rawHandle: string) {
  if (!uid) return false;
  const handle = normalize(rawHandle);
  const bare = handle.replace(/^@/, "");
  const isFollowing = followingSnap.includes(handle);

  // Resolve handle -> real user id (if any) so we can mirror into user_user_follows,
  // which is what drives the target user's followers count.
  const { data: prof } = await (supabase as any)
    .from("profiles")
    .select("id")
    .eq("username", bare)
    .maybeSingle();
  const targetId: string | null = prof?.id ?? null;

  if (isFollowing) {
    followingSnap = followingSnap.filter((x) => x !== handle);
    emit();
    await supabase.from("user_follows").delete().eq("user_id", uid).eq("handle", handle);
    if (targetId && targetId !== uid) {
      await (supabase as any)
        .from("user_user_follows")
        .delete()
        .eq("follower_id", uid)
        .eq("followed_id", targetId);
    }
    return false;
  } else {
    followingSnap = [...followingSnap, handle];
    emit();
    await supabase.from("user_follows").insert({ user_id: uid, handle });
    if (targetId && targetId !== uid) {
      await (supabase as any)
        .from("user_user_follows")
        .insert({ follower_id: uid, followed_id: targetId });
    }
    return true;
  }
}


function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFollowing(): string[] {
  return useSyncExternalStore(subscribe, () => followingSnap, () => []);
}

export function useFollowers(): string[] {
  return useSyncExternalStore(subscribe, () => followersSnap, () => []);
}

export function useIsFollowing(rawHandle: string | null | undefined) {
  const list = useFollowing();
  if (!rawHandle) return false;
  return list.includes(normalize(rawHandle));
}
