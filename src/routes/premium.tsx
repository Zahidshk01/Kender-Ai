import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X, Check, Minus, Star, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import ghost from "@/assets/kender-ghost.png";

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

const PLANS: Record<PlanId, { label: string; price: string; per: string; badge?: string; note?: string }> = {
  monthly: { label: "Per Month", price: "₹ 999", per: "₹32.85 / day", note: "Flexible" },
  yearly: { label: "Per Year", price: "₹ 8,999", per: "₹24.65 / day", badge: "25% OFF", note: "Best value" },
};

const FEATURES: { name: string; free: string | null; starred?: boolean }[] = [
  { name: "Better memory", free: null, starred: true },
  { name: "More intelligent", free: null, starred: true },
  { name: "Image generation", free: "1/daily", starred: true },
  { name: "Faster response", free: null },
  { name: "No ads", free: null },
  { name: "Unlimited messages", free: "25/daily" },
];

function PremiumPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanId>("yearly");

  function handleSubscribe() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Welcome to Kender Pro!");
    }, 900);
  }

  return (
    <div className="safe-top relative flex min-h-screen flex-col overflow-hidden bg-background pb-8">
      {/* Subtle ambient glow behind the hero */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          onClick={() => toast("No previous purchases found")}
          className="rounded-full bg-surface/80 px-4 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          Restore
        </button>
      </div>

      {/* Logo + title */}
      <div className="relative z-10 mt-8 flex flex-col items-center px-6 text-center">
        <div className="relative">
          <img src={ghost} alt="Kender" className="h-18 w-18" />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-black shadow-lg">
            PRO
          </div>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Upgrade to Pro</h1>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
          Unlock every premium feature and chat without limits.
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
              className={`relative flex flex-col items-center rounded-3xl border px-4 py-5 text-center transition-all duration-200 active:scale-[0.98] ${
                active
                  ? "border-primary/70 bg-surface shadow-[0_8px_32px_-12px_var(--color-primary)]"
                  : "border-border/40 bg-surface/40 hover:border-border/70 hover:bg-surface/60"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-yellow-400 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-black shadow-lg">
                  {p.badge}
                </span>
              )}
              {active && p.note === "Best value" && !p.badge && (
                <span className="absolute -top-2.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-lg">
                  {p.note}
                </span>
              )}
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {p.label}
              </p>
              <p className={`mt-2 text-3xl font-bold tracking-tight ${active ? "text-primary" : "text-foreground"}`}>
                {p.price}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{p.per}</p>

              <div className={`mt-3 flex h-5 items-center gap-1 text-[10px] font-semibold transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                {active ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Selected
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {p.note}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Features table */}
      <div className="relative z-10 mx-4 mt-7 overflow-hidden rounded-3xl border border-border/40 bg-surface/60">
        <div className="grid grid-cols-[1fr_64px_64px] items-center border-b border-border/30 bg-surface/80 px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Features</span>
          <span className="text-center">Free</span>
          <span className="text-center text-emerald-400">Pro</span>
        </div>
        {FEATURES.map((f, i) => (
          <div
            key={f.name}
            className={`grid grid-cols-[1fr_64px_64px] items-center px-4 py-3.5 text-sm ${
              i !== FEATURES.length - 1 ? "border-b border-border/30" : ""
            }`}
          >
            <span className="flex items-center gap-2 pr-2 font-medium text-foreground/95">
              {f.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
              {f.name}
            </span>
            <div className="flex justify-center text-xs font-medium text-muted-foreground">
              {f.free ?? <Minus className="h-4 w-4" />}
            </div>
            <div className="flex justify-center">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15">
                <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Guarantee / trust */}
      <div className="relative z-10 mt-5 flex items-center justify-center gap-2 px-6 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span>Cancel anytime. No hidden fees.</span>
      </div>

      {/* CTA */}
      <div className="mt-auto px-4 pt-6">
        <p className="text-center text-xs text-muted-foreground">
          {plan === "yearly"
            ? "Auto-renews yearly. Cancel anytime."
            : "Auto-renews monthly. Cancel anytime."}
        </p>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-3 flex w-full items-center justify-center rounded-full bg-white px-6 py-4 text-base font-semibold text-black shadow-lg shadow-white/10 transition-transform active:scale-[0.98] disabled:opacity-60"
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

