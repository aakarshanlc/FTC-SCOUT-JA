"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/api";
import { Notice } from "@/components/ui";

export function UnsubscribeView() {
  const token = useSearchParams()!.get("token") ?? "";
  const [state, setState] = useState<{ done?: boolean; error?: string; busy?: boolean }>({});

  const unsubscribe = async () => {
    setState({ busy: true });
    try {
      await post("/api/updates/unsubscribe", { token });
      setState({ done: true });
    } catch (x) {
      setState({ error: x instanceof Error ? x.message : "That didn't work" });
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="eyebrow">Email updates</div>
        <h1 className="display">{state.done ? "You're unsubscribed" : "Unsubscribe"}</h1>
        {state.done ? (
          <>
            <p className="muted">We won&apos;t email you again, and your address has been deleted.</p>
            <Link className="btn" href="/">
              Back to FTC Scout
            </Link>
          </>
        ) : (
          <>
            <p className="muted">Stop getting FTC Scout Jamaica emails?</p>
            {state.error ? <Notice kind="error">{state.error}</Notice> : null}
            <button type="button" className="btn primary" onClick={unsubscribe} disabled={state.busy || !token}>
              {state.busy ? "Unsubscribing…" : "Unsubscribe"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
