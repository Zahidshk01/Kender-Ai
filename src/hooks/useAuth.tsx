import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** A stored token exists and the user never signed out explicitly. */
  maybeSignedIn: boolean;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  maybeSignedIn: false,
});


// True if a Supabase auth token blob is still sitting in localStorage.
// Used to avoid bouncing the user to /auth while a token refresh is in flight
// (e.g. app opened after being closed overnight, or opened while offline).
function hasStoredSession() {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token") && localStorage.getItem(k)) {
        return true;
      }
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const signedOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      // Only an explicit sign-out clears the session. Everything else that
      // reports "no session" is treated as transient (refresh in flight,
      // offline, tab waking up) so the user is never bounced to /auth.
      if (event === "SIGNED_OUT") {
        signedOutRef.current = true;
        setSession(null);
        setLoading(false);
        return;
      }
      if (!s) {
        if (!hasStoredSession()) setLoading(false);
        return;
      }
      signedOutRef.current = false;
      setSession(s);
      setLoading(false);
    });

    // getSession() already refreshes an expired token internally and it
    // de-duplicates with the client's own auto-refresh timer. Calling
    // refreshSession() ourselves in parallel rotated the refresh token twice,
    // which Supabase treats as token reuse -> forced sign-out after a few
    // hours/days offline. So we never call refreshSession() manually.
    const load = async () => {
      if (signedOutRef.current) return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          signedOutRef.current = false;
          setSession(data.session);
        } else if (error && hasStoredSession()) {
          // Network/refresh hiccup: keep whatever we already have and retry
          // on the next wake-up instead of dropping the user.
          return;
        }
      } catch {
        /* offline: keep current state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    // Re-validate when the tab wakes up or connectivity returns, so a
    // long-idle session gets a fresh token instead of silently expiring.
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", () => void load());
    window.addEventListener("focus", revalidate);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
      sub.subscription.unsubscribe();
    };
  }, []);


  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
