"use client";

// Confirms the address when the button is pressed (not on page load, so link
// scanners in email apps can't confirm on someone's behalf).

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/api";
import { Notice } from "@/components/ui";

export function ConfirmView() {
  const token = useSearchParams()!.get("token") ?? "";
  const [state, setState] = useState<{ done?: string; error?: string; busy?: boolean }>({});

  const confirm = async () => {
    setState({ busy: true });
    try {
      const r = await post<{ email: string }>("/api/updates/confirm", { token });
      setState({ done: r.email });
    } catch (x) {
      setState({ error: x instanceof Error ? x.message : "That didn't work" });
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="eyebrow">Email updates</div>
        <h1 className="display">{state.done ? "You're signed up" : "Confirm your email"}</h1>
        {state.done ? (
          <>
            <p className="muted">
              We&apos;ll email <strong style={{ color: "var(--ink)" }}>{state.done}</strong> before each event.
            </p>
            <Link className="btn primary" href="/events">
              See upcoming events
            </Link>
          </>
        ) : (
          <>
            <p className="muted">Press the button to start getting FTC event emails.</p>
            {state.error ? <Notice kind="error">{state.error}</Notice> : null}
            <button type="button" className="btn primary" onClick={confirm} disabled={state.busy || !token}>
              {state.busy ? "Confirming…" : "Confirm my email"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
