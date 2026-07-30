import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { billingUserBucket, enforceRateLimits, logSecurityEvent } from "@/lib/api-security";
import { isStillActive, periodEnd, planSchema } from "@/lib/subscription.server";

/**
 * Temporary self-serve activation until the Stripe payment gateway is wired up.
 * Once STRIPE_LINKS are filled in, the UI stops calling these.
 *
 * Security: the subscription row is always keyed on the authenticated
 * `context.userId` — a caller can never activate, cancel or restore another
 * user's plan, even by tampering with the request body.
 */
export const activateProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (await enforceRateLimits([billingUserBucket("activate", context.userId)])) {
      throw new Error("Too many requests. Please try again in a moment.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const end = periodEnd(data.plan);

    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      status: "active",
      plan: data.plan,
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await logSecurityEvent({
      event: "subscription_activated",
      outcome: "success",
      route: "fn/activateProDirect",
      userId: context.userId,
      detail: { plan: data.plan },
    });
    return { ok: true, currentPeriodEnd: end.toISOString() };
  });

/**
 * Turns OFF auto-renewal only. The plan stays active (Pro features keep
 * working) until `current_period_end`, then lapses on its own.
 */
export const cancelProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await enforceRateLimits([billingUserBucket("cancel", context.userId)])) {
      throw new Error("Too many requests. Please try again in a moment.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    const end: string | null = row?.current_period_end ?? null;
    const stillInPeriod = !!end && new Date(end).getTime() > Date.now();

    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      // Keep the plan running until it expires; only stop the renewal.
      status: stillInPeriod ? row?.status ?? "active" : "canceled",
      plan: row?.plan ?? null,
      current_period_end: end,
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await logSecurityEvent({
      event: "subscription_autorenew_off",
      outcome: "success",
      route: "fn/cancelProDirect",
      userId: context.userId,
    });
    return { ok: true, activeUntil: stillInPeriod ? end : null };
  });

/**
 * Restores a plan: re-enables auto-renewal if the plan is still running,
 * or re-activates a previously purchased (expired) plan.
 */
export const restoreProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await enforceRateLimits([billingUserBucket("restore", context.userId)])) {
      throw new Error("Too many requests. Please try again in a moment.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("status, plan, current_period_end, cancel_at_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!row?.plan) return { ok: false as const, reason: "none" as const };

    if (isStillActive(row)) {
      if (row.cancel_at_period_end) {
        const { error } = await (supabaseAdmin as any)
          .from("subscriptions")
          .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
          .eq("user_id", context.userId);
        if (error) throw new Error(error.message);
        await logSecurityEvent({
          event: "subscription_autorenew_on",
          outcome: "success",
          route: "fn/restoreProDirect",
          userId: context.userId,
        });
        return { ok: true as const, reason: "resumed" as const };
      }
      return { ok: true as const, reason: "active" as const };
    }

    const plan: "monthly" | "yearly" = row.plan === "yearly" ? "yearly" : "monthly";
    const end = periodEnd(plan);
    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      status: "active",
      plan,
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await logSecurityEvent({
      event: "subscription_restored",
      outcome: "success",
      route: "fn/restoreProDirect",
      userId: context.userId,
      detail: { plan },
    });
    return { ok: true as const, reason: "restored" as const };
  });
