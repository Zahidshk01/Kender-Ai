import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X, Check, Minus } from "lucide-react";
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

const FEATURES = [
  "Chat without ads",
  "Free Standard model",
  "200+ Ultra replies (20K gems)",
  "Adjustable reply length",
  "15 pinned messages per chat",
  "Characters remember more",
];

function PremiumPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

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
      <div className="mt-16 flex flex-col items-center px-6">
        <img src={ghost} alt="Kender" className="h-20 w-20" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Upgrade to Pro</h1>
      </div>

      {/* Features table */}
      <div className="mx-4 mt-auto overflow-hidden rounded-2xl border border-border/40 bg-surface/60">
        <div className="grid grid-cols-[1fr_60px_60px] items-center px-4 py-3 text-sm">
          <span className="text-muted-foreground">Features</span>
          <span className="text-right text-muted-foreground">Free</span>
          <span className="text-right font-bold text-emerald-400">Pro</span>
        </div>
        <div className="h-px bg-border/40" />
        {FEATURES.map((f, i) => (
          <div
            key={f}
            className={`grid grid-cols-[1fr_60px_60px] items-center px-4 py-3.5 text-sm ${
              i !== FEATURES.length - 1 ? "border-b border-border/30" : ""
            }`}
          >
            <span className="pr-2 text-foreground/95">{f}</span>
            <div className="flex justify-end">
              <Minus className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex justify-end">
              <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-6 px-4">
        <p className="text-center text-xs text-muted-foreground">
          Auto-renews monthly. Cancel anytime.
        </p>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-3 w-full rounded-full bg-white px-6 py-4 text-base font-semibold text-black active:bg-white/90 disabled:opacity-60"
        >
          {loading ? "Processing…" : "Subscribe for ₹ 1,299/mo"}
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
