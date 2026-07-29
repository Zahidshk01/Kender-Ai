import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true });

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
      if (event === "SIGNED_OUT") {
        signedOutRef.current = true;
        setSession(null);
        setLoading(false);
        return;
      }
      // Ignore transient null sessions (refresh in-flight / network hiccup):
      // never drop an existing session unless Supabase explicitly signs out.
      if (!s) {
        if (!hasStoredSession()) setLoading(false);
        return;
      }
      signedOutRef.current = false;
      setSession(s);
      setLoading(false);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSession(data.session);
        setLoading(false);
        return;
      }
      // No in-memory session but a stored token exists -> the refresh probably
      // failed transiently. Retry a few times with backoff before giving up.
      if (hasStoredSession()) {
        for (const delay of [0, 1000, 3000]) {
          if (cancelled || signedOutRef.current) break;
          if (delay) await new Promise((r) => setTimeout(r, delay));
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (cancelled) return;
          if (refreshed.session) {
            setSession(refreshed.session);
            setLoading(false);
            return;
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();

    // Re-validate when the tab wakes up so long-idle sessions get refreshed
    // instead of silently expiring.
    const revalidate = async () => {
      if (document.visibilityState !== "visible" || signedOutRef.current) return;
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) setSession(data.session);
      else if (!cancelled && hasStoredSession()) {
        const { data: r } = await supabase.auth.refreshSession();
        if (!cancelled && r.session) setSession(r.session);
      }
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", revalidate);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("online", revalidate);
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
