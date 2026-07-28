import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function periodEnd(plan: "monthly" | "yearly") {
  const end = new Date();
  if (plan === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Temporary self-serve activation until the Stripe payment gateway is wired up.
 * Once STRIPE_LINKS are filled in, the UI stops calling these.
 */
export const activateProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plan: "monthly" | "yearly" }) => input)
  .handler(async ({ data, context }) => {
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
    return { ok: true, currentPeriodEnd: end.toISOString() };
  });

/**
 * Turns OFF auto-renewal only. The plan stays active (Pro features keep
 * working) until `current_period_end`, then lapses on its own.
 */
export const cancelProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    return { ok: true, activeUntil: stillInPeriod ? end : null };
  });

/**
 * Restores a plan: re-enables auto-renewal if the plan is still running,
 * or re-activates a previously purchased (expired) plan.
 */
export const restoreProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("status, plan, current_period_end, cancel_at_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!row?.plan) return { ok: false as const, reason: "none" as const };

    const stillActive =
      (row.status === "active" || row.status === "trialing") &&
      (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now());

    if (stillActive) {
      if (row.cancel_at_period_end) {
        const { error } = await (supabaseAdmin as any)
          .from("subscriptions")
          .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
          .eq("user_id", context.userId);
        if (error) throw new Error(error.message);
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
    return { ok: true as const, reason: "restored" as const };
  });
