"use client";

// Sign up for event emails. Double opt-in: we email a confirmation link first.

import Link from "next/link";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { post } from "@/lib/api";
import { Notice, PageHead } from "@/components/ui";

export default function UpdatesPage() {
  const { data: status } = useSWR<{ enabled: boolean }>("/api/updates/status", { refreshInterval: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ message: string }>("/api/updates/subscribe", { email: new FormData(form).get("email") });
      setMsg({ ok: true, text: r.message });
      form.reset();
    } catch (x) {
      setMsg({ ok: false, text: x instanceof Error ? x.message : "That didn't work. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Stay in the loop"
        title="Email updates"
        sub="Get an email a week before each FTC event in Jamaica, another the day before, and the occasional update from the scouting team."
      />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <form className="card" onSubmit={submit}>
          <div className="card-head">
            <h2 className="display">Sign up</h2>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            {status && !status.enabled ? (
              <Notice>Email updates aren&apos;t switched on yet. For now, add the calendar to your phone instead.</Notice>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input id="email" name="email" type="email" className="input" autoComplete="email" required placeholder="you@example.com" />
                </div>
                {msg ? <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice> : null}
                <div>
                  <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Sign me up"}
                  </button>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  We&apos;ll send a link to confirm first. Every email has an unsubscribe link, and we never share your
                  address. See <Link href="/privacy" style={{ color: "var(--signal)", fontWeight: 600 }}>privacy</Link>.
                </p>
              </>
            )}
          </div>
        </form>
        <section className="card">
          <div className="card-head">
            <h2 className="display">Prefer your calendar?</h2>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              Add the FTC Jamaica calendar to Google, Apple or Outlook and every event shows up there, including changes.
            </p>
            <div>
              <Link className="btn" href="/events">
                Add to my calendar
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
