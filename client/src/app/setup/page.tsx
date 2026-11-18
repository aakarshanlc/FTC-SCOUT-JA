"use client";

// One-time page: claim the first admin account with the server's ADMIN_SETUP_CODE.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Notice } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const { setupNeeded, setupEnabled, loading } = useAuth();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setErr("The passwords don't match");
    setBusy(true);
    setErr(null);
    try {
      await post("/api/auth/setup", { code: f.get("code"), name: f.get("name"), email: f.get("email"), password: f.get("password") });
      await mutate(() => true);
      router.replace("/admin");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="eyebrow">First-time setup</div>
        <h1 className="display">Create the admin</h1>
        {loading ? null : !setupNeeded ? (
          <Notice kind="ok">
            <span>
              Setup is already done. <Link href="/login">Sign in</Link>
            </span>
          </Notice>
        ) : !setupEnabled ? (
          <Notice kind="error">
            <span>
              Setup is locked. Add an <code>ADMIN_SETUP_CODE</code> environment variable on the server, redeploy, then come back.
            </span>
          </Notice>
        ) : (
          <>
            <p className="muted">This works once, while the site has no accounts. You&apos;ll be able to invite scouts right after.</p>
            <div className="field">
              <label htmlFor="code">Setup code</label>
              <input id="code" name="code" type="password" className="input" autoComplete="off" required />
              <span className="hint">The ADMIN_SETUP_CODE value set on the server.</span>
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" name="name" className="input" autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
              <span className="hint">At least 8 characters.</span>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
            </div>
            {err ? <Notice kind="error">{err}</Notice> : null}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create admin account"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
