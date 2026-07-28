import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Free-plan limits. Enforced server-side in src/routes/api/* via the
 * `consume_quota` database function — these values are mirrored here only
 * for display purposes.
 */
export const FREE_LIMITS = {
  messagesPerDay: 25,
  imagesPerDay: 1,
};

/**
 * Stripe links. Replace these with your real Stripe payment / billing portal
 * links — everything else already works.
 */
export const STRIPE_LINKS = {
  monthly: "",
  yearly: "",
  cancel: "",
};

export type SubscriptionState = {
  isPro: boolean;
  plan: "monthly" | "yearly" | null;
  status: string;
  currentPeriodEnd: string | null;
  loading: boolean;
};

const EMPTY: SubscriptionState = {
  isPro: false,
  plan: null,
  status: "free",
  currentPeriodEnd: null,
  loading: true,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(EMPTY);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) {
        if (active) setState({ ...EMPTY, loading: false });
        return;
      }

      const { data } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_end")
        .eq("user_id", uid)
        .maybeSingle();

      if (!active) return;
      const status = data?.status ?? "free";
      const end = data?.current_period_end ?? null;
      const active_ =
        (status === "active" || status === "trialing") &&
        (!end || new Date(end).getTime() > Date.now());

      setState({
        isPro: active_,
        plan: (data?.plan as "monthly" | "yearly" | null) ?? null,
        status,
        currentPeriodEnd: end,
        loading: false,
      });

      channel = supabase
        .channel(`sub-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "subscriptions",
            filter: `user_id=eq.${uid}`,
          },
          () => load(),
        )
        .subscribe();
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return state;
}

export function useIsPro(): boolean {
  return useSubscription().isPro;
}
