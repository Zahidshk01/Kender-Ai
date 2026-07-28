import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Check, Minus, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ghost from "@/assets/kender-ghost.png";
import {
  STRIPE_LINKS,
  pollForProAfterCheckout,
  refreshSubscription,
  useSubscription,
  withUserRef,
} from "@/lib/subscription";
import { supabase } from "@/integrations/supabase/client";

const CHECKOUT_FLAG = "kender:checkout-pending";




export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { title: "Upgrade to Pro · Kender" },
      { name: "description", content: "Unlock everything Kender Pro has to offer." },
    ],
  }),
  component: PremiumPage,
});

type PlanId = "monthly" | "yearly";

const PLANS: Record<PlanId, { label: string; price: string; per: string; badge?: string }> = {
  monthly: { label: "Per Month", price: "₹ 999", per: "₹32.85 / day" },
  yearly: { label: "Per Year", price: "₹ 8,999", per: "₹24.65 / day", badge: "25% OFF" },
};

const FEATURES: { name: string; free: string | null }[] = [
  { name: "Better memory", free: null },
  { name: "More intelligent", free: null },
  { name: "Image generation", free: "1/daily" },
  { name: "Faster response", free: null },
  { name: "No ads", free: null },
  { name: "Unlimited messages", free: "25/daily" },
];

function PremiumPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanId>("yearly");
  const { isPro, plan: activePlan, currentPeriodEnd } = useSubscription();

  async function handleSubscribe() {
    const link = STRIPE_LINKS[plan];
    if (!link) {
      toast("Payment link coming soon — add your Stripe link to enable checkout.");
      return;
    }
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    window.location.href = withUserRef(link, data.session?.user.id ?? null, plan);
  }


  function handleCancel() {
    if (!STRIPE_LINKS.cancel) {
      toast("Cancellation link coming soon — add your Stripe billing portal link.");
      return;
    }
    window.location.href = STRIPE_LINKS.cancel;
  }

  return (
    <div className="safe-top relative flex min-h-screen flex-col overflow-hidden bg-background pb-8">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => navigate({ to: "/" })}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => toast("No previous purchases found")}
          className="rounded-full bg-surface/80 px-4 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          Restore
        </button>
      </div>

      {isPro && (
        <div className="relative z-10 mx-4 mt-4 rounded-3xl border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-center">
          <p className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            Congratulations for KENDER PRO
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activePlan === "yearly" ? "Yearly plan" : "Monthly plan"} active
            {currentPeriodEnd
              ? ` · renews ${new Date(currentPeriodEnd).toLocaleDateString()}`
              : ""}
          </p>
        </div>
      )}

      {/* Logo + title */}
      <div className="relative z-10 mt-4 flex flex-col items-center px-6 text-center">
        <img src={ghost} alt="Kender" className="h-14 w-14" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {isPro ? "Your Pro plan" : "Upgrade to Pro"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPro ? "You have every premium feature unlocked." : "Unlock every premium feature."}
        </p>
      </div>


      {/* Plan cards */}
      <div className="relative z-10 mt-8 grid grid-cols-2 gap-3 px-4">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              onClick={() => setPlan(id)}
              className={`relative flex flex-col items-start rounded-3xl px-4 py-4 text-left transition-all duration-200 active:scale-[0.98] ${
                active
                  ? "border-2 border-white/80 bg-surface"
                  : "border border-white/10 bg-surface/60 hover:border-white/20"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground shadow-lg">
                  {p.badge}
                </span>
              )}
              <p className="text-[15px] font-semibold text-foreground">{p.label}</p>
              <div className="mt-2 flex w-full items-center justify-between gap-2">
                <div>
                  <p className="text-xl font-bold tracking-tight text-foreground">{p.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.per}</p>
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-foreground bg-foreground" : "border-white/25"
                  }`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-background" />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Features table */}
      <div className="relative z-10 mx-4 mt-7 overflow-hidden rounded-3xl bg-surface px-4 py-2">
        <div className="grid grid-cols-[1fr_56px_56px] items-center py-3 text-sm font-medium text-muted-foreground">
          <span>Features</span>
          <span className="text-center">Free</span>
          <span className="text-center text-primary">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.name}
            className="grid grid-cols-[1fr_56px_56px] items-center py-3.5 text-sm"
          >
            <span className="flex items-center pr-2 text-foreground/95">{f.name}</span>
            <div className="flex justify-center text-xs font-medium text-muted-foreground">
              {f.free ?? <Minus className="h-4 w-4" strokeWidth={3} />}
            </div>
            <div className="flex justify-center">
              <Check className="h-5 w-5 text-primary" strokeWidth={3} />
            </div>
          </div>
        ))}
      </div>


      {/* Auto-renew note */}
      <p className="relative z-10 mt-5 text-center text-xs text-muted-foreground">
        Auto-renews {plan === "yearly" ? "yearly" : "monthly"}. Cancel anytime.
      </p>

      {/* CTA */}
      <div className="mt-auto px-4 pt-4">
        {isPro ? (
          <button
            onClick={handleCancel}
            className="flex w-full items-center justify-center rounded-full bg-surface px-6 py-4 text-base font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            Cancel plan
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="flex w-full items-center justify-center rounded-full bg-white px-6 py-4 text-base font-semibold text-black shadow-lg shadow-white/10 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                Processing…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Subscribe for {PLANS[plan].price}/{plan === "yearly" ? "yr" : "mo"}
              </span>
            )}
          </button>
        )}

        <p className="mt-3 text-center text-xs text-muted-foreground">
          <button
            onClick={() => navigate({ to: "/terms-of-service" })}
            className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Terms of Use
          </button>
          <span className="mx-2">•</span>
          <button
            onClick={() => navigate({ to: "/privacy-policy" })}
            className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </div>
  );
}
