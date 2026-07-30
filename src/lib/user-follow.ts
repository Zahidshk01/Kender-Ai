import { supabase } from "@/integrations/supabase/client";
import { baselineFollowCounts } from "@/lib/follow-baseline";
import { isNewAccount } from "@/lib/new-user";

export async function isFollowingUser(targetId: string): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid || uid === targetId) return false;
  const { data } = await (supabase as any)
    .from("user_user_follows")
    .select("follower_id")
    .eq("follower_id", uid)
    .eq("followed_id", targetId)
    .maybeSingle();
  return !!data;
}

async function handleForUser(targetId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("profiles")
    .select("username")
    .eq("id", targetId)
    .maybeSingle();
  const u = data?.username as string | undefined;
  if (!u) return null;
  return u.startsWith("@") ? u : `@${u}`;
}

export async function toggleFollowUser(targetId: string): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid || uid === targetId) return false;
  const currently = await isFollowingUser(targetId);
  const handle = await handleForUser(targetId);
  let result: boolean;
  if (currently) {
    await (supabase as any)
      .from("user_user_follows")
      .delete()
      .eq("follower_id", uid)
      .eq("followed_id", targetId);
    if (handle) {
      await supabase.from("user_follows").delete().eq("user_id", uid).eq("handle", handle);
    }
    result = false;
  } else {
    await (supabase as any)
      .from("user_user_follows")
      .insert({ follower_id: uid, followed_id: targetId });
    if (handle) {
      await supabase.from("user_follows").upsert(
        { user_id: uid, handle },
        { onConflict: "user_id,handle" } as any,
      );
    }
    result = true;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kender:follows-changed"));
  }
  return result;
}

export async function getUserFollowCounts(userId: string) {
  const [{ count: followers }, { count: following }] = await Promise.all([
    (supabase as any)
      .from("user_user_follows")
      .select("*", { count: "exact", head: true })
      .eq("followed_id", userId),
    // Count handle-based follows (mirrored for user-to-user follows too),
    // so following goes up/down whether the target is a real account or a seeded handle.
    (supabase as any)
      .from("user_follows")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const { data: prof } = await (supabase as any)
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();
  // Brand-new accounts start completely empty — no synthetic baseline.
  const base = isNewAccount(prof?.created_at)
    ? { followers: 0, following: 0 }
    : baselineFollowCounts(userId);
  return {
    followers: (followers ?? 0) + base.followers,
    following: (following ?? 0) + base.following,
  };
}

export type FollowListEntry = { id: string; username: string; avatar_url: string | null };

async function fetchProfiles(ids: string[]): Promise<FollowListEntry[]> {
  if (ids.length === 0) return [];
  const { data } = await (supabase as any)
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", ids);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    username: p.username ?? "user",
    avatar_url: p.avatar_url ?? null,
  }));
}

export async function getFollowersOfUser(userId: string): Promise<FollowListEntry[]> {
  const { data } = await (supabase as any)
    .from("user_user_follows")
    .select("follower_id")
    .eq("followed_id", userId);
  return fetchProfiles((data ?? []).map((r: any) => r.follower_id));
}

export async function getFollowingOfUser(userId: string): Promise<FollowListEntry[]> {
  const { data } = await (supabase as any)
    .from("user_user_follows")
    .select("followed_id")
    .eq("follower_id", userId);
  return fetchProfiles((data ?? []).map((r: any) => r.followed_id));
}
