"use client";

// Accept an invite (or a password-reset link): set a password and sign in.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { post } from "@/lib/api";
import { Notice, SkeletonRows } from "@/components/ui";

export function InviteView() {
  const { token } = useParams<{ token: string }>()!;
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR<{ email: string; name: string; role: string; reset: boolean }>(`/api/auth/invite/${token}`, {
    refreshInterval: 0,
    shouldRetryOnError: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setErr("The passwords don't match");
    setBusy(true);
    setErr(null);
    try {
      await post(`/api/auth/invite/${token}`, { password: f.get("password"), name: f.get("name") });
      await mutate(() => true);
      router.replace("/scout");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't set your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="eyebrow">{data?.reset ? "Password reset" : "You're invited"}</div>
        <h1 className="display">{data?.reset ? "New password" : "Join the scouts"}</h1>
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : error ? (
          <>
            <Notice kind="error">{error.message}</Notice>
            <p className="muted auth-foot">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </>
        ) : data ? (
          <>
            <p className="muted">
              {data.reset ? "Choose a new password for " : "Set a password to activate "}
              <strong style={{ color: "var(--ink)" }}>{data.email}</strong>
              {data.role === "admin" ? " (admin)" : ""}.
            </p>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" name="name" className="input" defaultValue={data.name} autoComplete="name" required />
              <span className="hint">Shown next to the matches and videos you add.</span>
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required autoFocus />
              <span className="hint">At least 8 characters.</span>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
            </div>
            {err ? <Notice kind="error">{err}</Notice> : null}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : data.reset ? "Save new password" : "Activate account"}
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}
