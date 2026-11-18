"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { post, type AuthUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Notice } from "@/components/ui";

export function LoginView() {
  const router = useRouter();
  const next = useSearchParams()!.get("next") || "/";
  const { user, setupNeeded } = useAuth();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await post<{ user: AuthUser }>("/api/auth/login", { email: f.get("email"), password: f.get("password") });
      await mutate(() => true); // refresh everything with the new session
      router.replace(next.startsWith("/") ? next : "/");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="eyebrow">Scouts &amp; admins</div>
        <h1 className="display">Sign in</h1>
        <p className="muted">Viewing the site doesn&apos;t need an account. Sign in to log matches, add events and manage match video.</p>
        {user ? (
          <Notice kind="ok">
            <span>
              You&apos;re signed in as <strong>{user.name}</strong>. <Link href="/">Go to the site</Link>
            </span>
          </Notice>
        ) : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        {err ? <Notice kind="error">{err}</Notice> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted auth-foot">
          {setupNeeded ? (
            <>
              No accounts yet? <Link href="/setup">Set up the first admin</Link>
            </>
          ) : (
            "No account? Ask an admin for an invite link. Forgot your password? An admin can send you a new link."
          )}
        </p>
      </form>
    </div>
  );
}
