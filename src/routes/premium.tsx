import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X, Check, Minus, Star } from "lucide-react";
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

const PLANS: Record<PlanId, { label: string; price: string; per: string; badge?: string }> = {
  monthly: { label: "Per Month", price: "₹ 999", per: "32.85 / day" },
  yearly: { label: "Per Year", price: "₹ 8,999", per: "24.65 / day", badge: "25% OFF" },
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
    <div className="safe-top relative flex min-h-screen flex-col bg-background pb-10">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3">
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface active:bg-surface-2"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          onClick={() => toast("No previous purchases found")}
          className="rounded-full bg-surface px-4 py-2 text-sm font-medium active:bg-surface-2"
        >
          Restore
        </button>
      </div>

      {/* Logo + title */}
      <div className="mt-8 flex flex-col items-center px-6">
        <img src={ghost} alt="Kender" className="h-16 w-16" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Upgrade to Pro</h1>
      </div>

      {/* Plan cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 px-4">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              onClick={() => setPlan(id)}
              className={`relative rounded-3xl border px-4 py-5 text-center transition-colors ${
                active
                  ? "border-primary bg-surface"
                  : "border-border/50 bg-surface/50 active:bg-surface"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-yellow-400 px-2.5 py-0.5 text-[11px] font-bold text-black">
                  {p.badge}
                </span>
              )}
              <p className="text-sm text-muted-foreground">{p.label}</p>
              <p className={`mt-1.5 text-2xl font-bold ${active ? "text-primary" : "text-foreground"}`}>
                {p.price}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{p.per}</p>
            </button>
          );
        })}
      </div>

      {/* Features table */}
      <div className="mx-4 mt-7 overflow-hidden rounded-2xl border border-border/40 bg-surface/60">
        <div className="grid grid-cols-[1fr_64px_64px] items-center px-4 py-3 text-sm">
          <span className="text-muted-foreground">Features</span>
          <span className="text-center text-muted-foreground">Free</span>
          <span className="text-center font-bold text-emerald-400">Pro</span>
        </div>
        <div className="h-px bg-border/40" />
        {FEATURES.map((f, i) => (
          <div
            key={f.name}
            className={`grid grid-cols-[1fr_64px_64px] items-center px-4 py-3.5 text-sm ${
              i !== FEATURES.length - 1 ? "border-b border-border/30" : ""
            }`}
          >
            <span className="flex items-center gap-2 pr-2 text-foreground/95">
              {f.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
              {f.name}
            </span>
            <div className="flex justify-center text-xs text-muted-foreground">
              {f.free ?? <Minus className="h-4 w-4" />}
            </div>
            <div className="flex justify-center">
              <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
            </div>
          </div>
        ))}
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
          className="mt-3 w-full rounded-full bg-white px-6 py-4 text-base font-semibold text-black active:bg-white/90 disabled:opacity-60"
        >
          {loading
            ? "Processing…"
            : `Subscribe for ${PLANS[plan].price}/${plan === "yearly" ? "yr" : "mo"}`}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <button
            onClick={() => navigate({ to: "/terms-of-service" })}
            className="underline-offset-2 hover:underline"
          >
            Terms of Use
          </button>
          <span className="mx-2">•</span>
          <button
            onClick={() => navigate({ to: "/privacy-policy" })}
            className="underline-offset-2 hover:underline"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </div>
  );
}
