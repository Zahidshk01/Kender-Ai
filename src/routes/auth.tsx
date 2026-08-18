import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import ghost from "@/assets/kender-ghost.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in · Kender" }, { name: "description", content: "Chat with AI Characters on Kender." }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<null | "apple" | "google">(null);

  // If already signed in, bounce home. Also listen for sign-in events.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        navigate({ to: "/", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Starfield
  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
      })),
    [],
  );

  /** Audit trail + per-IP throttling for sign-in attempts. Never blocks on failure. */
  const reportAuth = async (
    event: "sign_in_attempt" | "sign_in_failed" | "sign_in_success",
    provider: "google" | "apple",
    reason?: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, provider, reason }),
      });
      return res.status !== 429;
    } catch {
      return true;
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    if (!confirmed) {
      toast("Please confirm you are 18 or older");
      return;
    }
    setBusy(provider);
    const allowed = await reportAuth("sign_in_attempt", provider);
    if (!allowed) {
      toast.error("Too many sign-in attempts. Please try again in a few minutes.");
      setBusy(null);
      return;
    }
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
      extraParams: provider === "google" ? { prompt: "select_account" } : {},
    });
    if (result.error) {
      void reportAuth("sign_in_failed", provider, result.error.message);
      toast.error(result.error.message ?? "Sign in failed");
      setBusy(null);
      return;
    }
    if (result.redirected) return; // browser is navigating away
    // Popup flow: tokens set, go home
    void reportAuth("sign_in_success", provider);
    navigate({ to: "/", replace: true });
  };


  const disabled = !confirmed;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black px-6 pb-10 pt-16 text-white">
      {/* Starfield */}
      <div className="pointer-events-none absolute inset-0">
        {stars.map((s) => (
          <span
            key={s.id}
            className="absolute rounded-full bg-white"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: s.opacity,
            }}
          />
        ))}
      </div>

      {/* Logo + brand */}
      <div className="relative z-10 mt-16 flex flex-1 flex-col items-center">
        <img src={ghost} alt="Kender" width={120} height={120} className="h-28 w-28 object-contain" />
        <h1 className="mt-3 text-6xl font-extrabold tracking-tight lowercase">kender</h1>
        <p className="mt-2 text-lg text-white/60">Chat with AI</p>
      </div>

      {/* Actions */}
      <div className="relative z-10 space-y-3">
        <button
          type="button"
          onClick={() => setConfirmed((v) => !v)}
          className="flex w-full items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 py-4 text-left text-sm text-white/90 backdrop-blur"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border ${
              confirmed ? "border-primary bg-primary text-primary-foreground" : "border-white/40"
            }`}
          >
            {confirmed && <Check className="h-4 w-4" strokeWidth={3} />}
          </span>
          <span>I confirm I am 18 years of age or older</span>
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={disabled || busy !== null}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-base font-semibold text-black disabled:opacity-40"
        >
          {busy === "apple" ? <Loader2 className="h-5 w-5 animate-spin" /> : <AppleIcon />}
          Continue with Apple
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={disabled || busy !== null}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-base font-semibold text-black disabled:opacity-40"
        >
          {busy === "google" ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </button>

        <p className="pt-3 text-center text-xs leading-relaxed text-white/50">
          Companion chatbots may not be suitable for some minors.
          <br />
          By continuing, you confirm you are 18 years of age or older and agree to our{" "}
          <button
            type="button"
            onClick={() => navigate({ to: "/terms-of-service" })}
            className="inline underline"
          >
            Terms of Service
          </button>{" "}
          and{" "}
          <button
            type="button"
            onClick={() => navigate({ to: "/privacy-policy" })}
            className="inline underline"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M17.05 12.54c-.02-2.2 1.79-3.26 1.87-3.31-1.02-1.49-2.6-1.7-3.16-1.72-1.35-.14-2.63.79-3.31.79-.69 0-1.74-.77-2.86-.75-1.47.02-2.83.86-3.59 2.17-1.53 2.66-.39 6.59 1.1 8.75.73 1.05 1.6 2.23 2.75 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.95-1.08 2.68-2.14.84-1.22 1.19-2.4 1.21-2.46-.03-.01-2.32-.89-2.34-3.53zM14.88 5.9c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.3-.56.64-1.04 1.68-.91 2.67.97.08 1.95-.49 2.55-1.21z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44c-.28 1.48-1.12 2.73-2.39 3.57v2.97h3.86c2.26-2.09 3.58-5.16 3.58-8.78z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.94l-3.86-2.97c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29A11.99 11.99 0 0 0 0 12c0 1.94.47 3.77 1.29 5.37l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
