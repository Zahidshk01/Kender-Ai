import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X, Check, Minus, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
  monthly: { label: "Per Month", price: "₹999", per: "₹32.85 / day" },
  yearly: { label: "Per Year", price: "₹8,999", per: "₹24.65 / day", badge: "25% OFF" },
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
      {/* Top bar */}
      <div className="relative z-10 flex items-center px-4 pt-4">
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Title */}
      <div className="relative z-10 mt-2 px-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upgrade to Pro</h1>
        <p className="mt-1 text-sm text-muted-foreground">Unlock every premium feature.</p>
      </div>

      {/* Plan cards */}
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 px-4">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              onClick={() => setPlan(id)}
              className={`relative flex flex-col items-center rounded-3xl px-4 py-6 text-center transition-all duration-200 active:scale-[0.98] ${
                active
                  ? "border-2 border-primary bg-surface"
                  : "border border-white/10 bg-surface/60 hover:border-white/20 hover:bg-surface/80"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-[10px] font-bold tracking-wide text-black shadow-lg">
                  {p.badge}
                </span>
              )}
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {p.label}
              </p>
              <p
                className={`mt-3 text-4xl font-bold tracking-tight ${
                  active ? "text-foreground" : "text-foreground/80"
                }`}
              >
                {p.price}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{p.per}</p>
            </button>
          );
        })}
      </div>

      {/* Features table */}
      <div className="relative z-10 mx-4 mt-7 overflow-hidden rounded-3xl border border-white/10 bg-surface">
        <div className="grid grid-cols-[1fr_64px_64px] items-center border-b border-white/10 px-4 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Features</span>
          <span className="text-center">Free</span>
          <span className="text-center text-primary">Pro</span>
        </div>
        {FEATURES.map((f, i) => (
          <div
            key={f.name}
            className={`grid grid-cols-[1fr_64px_64px] items-center px-4 py-4 text-sm ${
              i !== FEATURES.length - 1 ? "border-b border-white/10" : ""
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
              <Check className="h-5 w-5 text-primary" strokeWidth={2.5} />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-auto px-4 pt-6">
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
