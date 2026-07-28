import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Temporary self-serve activation until the Stripe payment gateway is wired up.
 * Once STRIPE_LINKS are filled in, the UI stops calling these.
 */
export const activateProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plan: "monthly" | "yearly" }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const end = new Date();
    if (data.plan === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

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

export const cancelProDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("subscriptions").upsert({
      user_id: context.userId,
      status: "free",
      plan: null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
