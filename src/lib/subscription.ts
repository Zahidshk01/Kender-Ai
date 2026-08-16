import { useEffect, useSyncExternalStore } from "react";
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

/** Appends the signed-in user id so the Stripe webhook can match the payment. */
export function withUserRef(link: string, userId: string | null, plan?: string) {
  if (!link || !userId) return link;
  const sep = link.includes("?") ? "&" : "?";
  const planParam = plan ? `&prefilled_promo_code=&plan=${plan}` : "";
  return `${link}${sep}client_reference_id=${encodeURIComponent(userId)}${planParam}`;
}

export type SubscriptionState = {
  isPro: boolean;
  plan: "monthly" | "yearly" | null;
  status: string;
  currentPeriodEnd: string | null;
  /** Auto-renewal turned off — plan keeps working until currentPeriodEnd. */
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  /** True while we're polling for a just-completed Stripe checkout. */
  syncing: boolean;
};

const EMPTY: SubscriptionState = {
  isPro: false,
  plan: null,
  status: "free",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,
  syncing: false,
};

/* ------------------------------------------------------------------ *
 * Shared store — one fetch + one realtime channel for the whole app.  *
 * ------------------------------------------------------------------ */

let snapshot: SubscriptionState = EMPTY;
const listeners = new Set<() => void>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let currentUid: string | null = null;
let started = false;
let inFlight: Promise<SubscriptionState> | null = null;

function setSnapshot(next: SubscriptionState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribeRealtime(uid: string) {
  if (channel && currentUid === uid) return;
  if (channel) supabase.removeChannel(channel);
  currentUid = uid;
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
      () => {
        void refreshSubscription();
      },
    )
    .subscribe();
}

/** Re-reads the subscription row and pushes it to every subscribed component. */
export async function refreshSubscription(): Promise<SubscriptionState> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;

    if (!uid) {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
        currentUid = null;
      }
      const next = { ...EMPTY, loading: false, syncing: snapshot.syncing };
      setSnapshot(next);
      return next;
    }

    subscribeRealtime(uid);

    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan, current_period_end, cancel_at_period_end")
      .eq("user_id", uid)
      .maybeSingle();

    const status = data?.status ?? "free";
    const end = data?.current_period_end ?? null;
    const isPro =
      (status === "active" || status === "trialing") &&
      (!end || new Date(end).getTime() > Date.now());

    const next: SubscriptionState = {
      isPro,
      plan: (data?.plan as "monthly" | "yearly" | null) ?? null,
      status,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: Boolean((data as any)?.cancel_at_period_end),
      loading: false,
      syncing: snapshot.syncing,
    };
    setSnapshot(next);
    return next;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Poll after returning from Stripe until the webhook flips the plan to Pro.
 * Resolves as soon as Pro is detected, or when the attempts run out (the user
 * simply stays on Free — no manual reload is ever required either way).
 */
export async function pollForProAfterCheckout(
  attempts = 12,
  intervalMs = 2000,
): Promise<boolean> {
  setSnapshot({ ...snapshot, syncing: true });
  try {
    for (let i = 0; i < attempts; i++) {
      const state = await refreshSubscription();
      if (state.isPro) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    const final = await refreshSubscription();
    return final.isPro;
  } finally {
    setSnapshot({ ...snapshot, syncing: false });
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  void refreshSubscription();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) void refreshSubscription();
  });

  // Returning from the Stripe tab/redirect: re-check — but at most once every
  // 20s, so tab switching doesn't fire a burst of identical requests.
  let lastWake = Date.now();
  const wakeRefresh = () => {
    if (Date.now() - lastWake < 20_000) return;
    lastWake = Date.now();
    void refreshSubscription();
  };
  window.addEventListener("focus", wakeRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wakeRefresh();
  });
  window.addEventListener("pageshow", wakeRefresh);
}

export function useSubscription(): SubscriptionState {
  useEffect(() => {
    start();
  }, []);

  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => EMPTY,
  );
}

export function useIsPro(): boolean {
  return useSubscription().isPro;
}

