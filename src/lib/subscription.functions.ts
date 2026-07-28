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
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, currentPeriodEnd: end.toISOString() };
  });

/**
 * Cancels auto-renewal. The plan is remembered so the user can restore it later.
 */
export const cancelProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("plan")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      status: "canceled",
      plan: row?.plan ?? null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Restores a previously purchased (canceled/expired) plan.
 */
export const restoreProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("status, plan, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!row?.plan) return { ok: false as const, reason: "none" as const };

    const stillActive =
      (row.status === "active" || row.status === "trialing") &&
      (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now());
    if (stillActive) return { ok: true as const, reason: "active" as const };

    const plan: "monthly" | "yearly" = row.plan === "yearly" ? "yearly" : "monthly";
    const end = periodEnd(plan);
    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      status: "active",
      plan,
      current_period_end: end.toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, reason: "restored" as const };
  });
