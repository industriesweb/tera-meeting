"use client";

import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  error: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let sub: { subscription: { unsubscribe: () => void } } | null = null;
    let cancelled = false;

    async function init() {
      try {
        const { supabase } = await import("@/lib/supabase/client");
        const client = supabase();

        sub = client.auth.onAuthStateChange((event: AuthChangeEvent, s: Session | null) => {
          if (cancelled) return;
          setSession(s);
          if (event === "SIGNED_OUT" && typeof window !== "undefined") {
            if (!window.location.pathname.startsWith("/login")) {
              window.location.href = "/login";
            }
          }
        }).data;

        const { data } = await client.auth.getSession();
        if (!cancelled) {
          setSession(data.session);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Auth initialization failed");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { supabase } = await import("@/lib/supabase/client");
      await supabase().auth.signOut();
    } catch {
      // ignore
    }
  }, []);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, error, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
