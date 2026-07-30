/**
 * Server-only helpers for permanent account deletion.
 *
 * Deleting an account removes every live row the user owns and their auth
 * identity, so signing back in with the same email / Google / Apple account
 * creates a brand-new, empty account. A copy of the account is archived in
 * `deleted_accounts` (service-role only) so the data is retained in the
 * backend for compliance/support.
 */
type Admin = any;

export async function archiveAccount(admin: Admin, userId: string) {
  const [profile, subscription, characters, usage, likes, saves, follows, followers, messages] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("characters").select("*").eq("owner_id", userId),
      admin.from("usage_daily").select("*").eq("user_id", userId),
      admin.from("user_likes").select("character_id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("user_saves").select("character_id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("user_user_follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", userId),
      admin.from("user_user_follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", userId),
      admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

  let email: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  } catch {
    /* ignore */
  }

  await admin.from("deleted_accounts").insert({
    user_id: userId,
    email,
    username: profile.data?.username ?? null,
    profile: profile.data ?? null,
    subscription: subscription.data ?? null,
    characters: characters.data ?? [],
    stats: {
      usage_daily: usage.data ?? [],
      likes: likes.count ?? 0,
      saves: saves.count ?? 0,
      following: follows.count ?? 0,
      followers: followers.count ?? 0,
      messages: messages.count ?? 0,
    },
  });

  return {
    characterCount: characters.data?.length ?? 0,
    hadSubscription: !!subscription.data,
  };
}

/** Remove every live row belonging to the user, then the auth identity. */
export async function purgeAccount(admin: Admin, userId: string) {
  await Promise.all([
    admin.from("chat_messages").delete().eq("user_id", userId),
    admin.from("characters").delete().eq("owner_id", userId),
    admin.from("user_likes").delete().eq("user_id", userId),
    admin.from("user_saves").delete().eq("user_id", userId),
    admin.from("user_follows").delete().eq("user_id", userId),
    admin.from("user_blocks").delete().eq("blocker_id", userId),
    admin.from("user_user_follows").delete().eq("follower_id", userId),
    admin.from("user_user_follows").delete().eq("followed_id", userId),
    admin.from("direct_messages").delete().eq("sender_id", userId),
    admin.from("direct_messages").delete().eq("recipient_id", userId),
    admin.from("push_subscriptions").delete().eq("user_id", userId),
    admin.from("notifications_state").delete().eq("user_id", userId),
    admin.from("usage_daily").delete().eq("user_id", userId),
    admin.from("subscriptions").delete().eq("user_id", userId),
  ]);
  await admin.from("profiles").delete().eq("id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
