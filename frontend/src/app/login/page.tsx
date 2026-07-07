"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2 } from "lucide-react";
import { loadSupabaseClient } from "@/lib/supabase/load-client";
import { ErrorIcon } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        const { supabase } = await loadSupabaseClient();
        const { data } = await supabase().auth.getSession();
        if (cancelledRef.current) return;
        if (data.session) {
          router.replace("/dashboard");
        } else {
          setChecking(false);
        }
      } catch (e: unknown) {
        if (cancelledRef.current) return;
        setAuthError(e instanceof Error ? e.message : "Failed to check session");
        setChecking(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <ErrorIcon className="h-12 w-12 text-secondary/40 mb-4" />
          <h2 className="font-headline text-xl font-semibold text-on-surface mb-2">Unable to connect</h2>
          <p className="text-sm text-secondary mb-4">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:brightness-110 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { supabase } = await loadSupabaseClient();
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary ring-1 ring-border">
            <Leaf className="h-5 w-5" />
          </span>
          <div>
            <p className="font-headline text-2xl text-primary">Terra Meetings</p>
            <p className="text-xs text-muted-foreground">Rooted in efficiency</p>
          </div>
        </div>

        <h1 className="mt-8 font-headline text-3xl text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to plan meetings and log outcomes.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground/80">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground/80">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground"
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="current-password"
            />
          </label>

          {err && <p className="text-sm text-destructive">{err}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}

          <Link href="/login" onClick={(e) => { e.preventDefault(); loadSupabaseClient().then(({ supabase }) => supabase().auth.resetPasswordForEmail(email)).then(() => setInfo("Check your email for the reset link.")).catch(() => setErr("Failed to send reset email")); }} className="block text-right text-xs text-muted-foreground hover:text-primary">
            Forgot password?
          </Link>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
