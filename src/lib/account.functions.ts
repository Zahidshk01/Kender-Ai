import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { billingUserBucket, enforceRateLimits, logSecurityEvent } from "@/lib/api-security";
import { archiveAccount, purgeAccount } from "@/lib/account.server";

/** Summary shown in the final delete confirmation dialog. */
export const getDeletionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("characters")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId);

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    const active =
      !!sub &&
      (sub.status === "active" || sub.status === "trialing") &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());

    return {
      characterCount: count ?? 0,
      isPro: active,
      plan: (sub?.plan as string | null) ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
    };
  });

/**
 * Permanently deletes the signed-in user's account.
 * The account is archived to `deleted_accounts` (backend-only) first, then all
 * live rows and the auth identity are removed, so signing up again with the
 * same email / Google / Apple account starts from zero history.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await enforceRateLimits([billingUserBucket("delete-account", context.userId)])) {
      throw new Error("Too many requests. Please try again in a moment.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const archived = await archiveAccount(supabaseAdmin, context.userId);
    await purgeAccount(supabaseAdmin, context.userId);

    await logSecurityEvent({
      event: "account_deleted",
      outcome: "success",
      route: "fn/deleteMyAccount",
      userId: context.userId,
      detail: archived,
    });

    return { ok: true as const };
  });
