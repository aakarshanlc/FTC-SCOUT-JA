"use client";

// Team & account: admins invite scouts and manage access; everyone can change
// their own password.

import Link from "next/link";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { patch, post, type AuthUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Notice, PageHead, SkeletonRows, useToast } from "@/components/ui";

interface InviteResult {
  user: AuthUser;
  invitePath: string;
  expires: string;
}

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <SkeletonRows rows={6} />;
  if (!user) {
    return (
      <>
        <PageHead eyebrow="Accounts" title="Team" />
        <div className="card">
          <Empty title="Sign in to manage your account">
            <Link className="btn primary" href="/login?next=/admin" style={{ marginTop: 12 }}>
              Sign in
            </Link>
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={isAdmin ? "Admin" : "Account"}
        title={isAdmin ? "Team" : "Account"}
        sub={isAdmin ? "Invite scouts, change roles or remove access. Nobody needs an account just to view the site." : undefined}
      />
      {isAdmin ? <TeamAdmin me={user} /> : null}
      {isAdmin ? <EmailUpdates /> : null}
      <ChangePassword me={user} />
    </>
  );
}

function TeamAdmin({ me }: { me: AuthUser }) {
  const { data: users, error, mutate } = useSWR<AuthUser[]>("/api/auth/users", { refreshInterval: 0 });
  const [link, setLink] = useState<{ name: string; url: string; expires: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const showLink = (r: InviteResult) => setLink({ name: r.user.name, url: `${window.location.origin}${r.invitePath}`, expires: r.expires });

  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setErr(null);
    try {
      const r = await post<InviteResult>("/api/auth/users", { name: f.get("name"), email: f.get("email"), role: f.get("role") });
      showLink(r);
      form.reset();
      mutate();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't create the invite");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      await mutate();
      toast.show(done);
    } catch (x) {
      toast.show(x instanceof Error ? x.message : "That didn't work");
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.show("Invite link copied");
    } catch {
      toast.show("Select the link and copy it");
    }
  };

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2 className="display">Invite a scout</h2>
        </div>
        <form className="card-body form-grid" onSubmit={invite}>
          <div className="field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" name="name" className="input" required placeholder="Jordan Smith" />
          </div>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" name="email" type="email" className="input" required placeholder="jordan@example.com" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" className="select input" defaultValue="scout">
              <option value="scout">Scout: logs matches, events and video</option>
              <option value="admin">Admin: also manages the team</option>
            </select>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" type="submit" disabled={busy} style={{ height: 42 }}>
              {busy ? "Creating…" : "Create invite link"}
            </button>
          </div>
          {err ? (
            <div className="full">
              <Notice kind="error">{err}</Notice>
            </div>
          ) : null}
          {link ? (
            <div className="full invite-link">
              <div style={{ fontWeight: 600 }}>Send this link to {link.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                It works once and expires {when(link.expires)}. Send it privately, since anyone with the link can claim the account.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input className="input num" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
                <button type="button" className="btn dark" onClick={copy}>
                  Copy
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="display">Members</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {users ? `${users.filter((u) => u.active).length} with access` : ""}
          </span>
        </div>
        {error ? (
          <div className="card-body">
            <Notice kind="error">{error.message}</Notice>
          </div>
        ) : !users ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th className="hide-sm">Status</th>
                  <th className="hide-sm">Last sign-in</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                      <td>
                        <div className="teamcell">
                          <span className="nm">
                            {u.name}
                            {self ? <span className="muted"> (you)</span> : null}
                          </span>
                          <span className="n" style={{ fontFamily: "var(--ff-body)", fontWeight: 400 }}>
                            {u.email}
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          className="select input"
                          style={{ height: 32, width: "auto", padding: "0 8px" }}
                          value={u.role}
                          disabled={self || !u.active}
                          aria-label={`Role for ${u.name}`}
                          onChange={(e) => act(() => patch(`/api/auth/users/${u.id}`, { role: e.target.value }), `${u.name} is now ${e.target.value === "admin" ? "an admin" : "a scout"}`)}
                        >
                          <option value="scout">Scout</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="hide-sm">
                        {!u.active ? (
                          <span className="badge">Removed</span>
                        ) : u.pending ? (
                          <span className="badge signal">Invited</span>
                        ) : (
                          <span className="badge good">Active</span>
                        )}
                      </td>
                      <td className="hide-sm muted">{when(u.lastLoginAt)}</td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        {u.active ? (
                          <>
                            <button
                              type="button"
                              className="btn sm ghost"
                              title={u.pending ? "Make a fresh invite link" : "Make a link to set a new password"}
                              onClick={() => act(async () => showLink(await post<InviteResult>(`/api/auth/users/${u.id}/invite`)), "New link ready above")}
                            >
                              {u.pending ? "New link" : "Reset"}
                            </button>
                            {!self ? (
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => confirm(`Remove ${u.name}'s access? They'll be signed out everywhere.`) && act(() => patch(`/api/auth/users/${u.id}`, { active: false }), `${u.name} removed`)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button type="button" className="btn sm ghost" onClick={() => act(() => patch(`/api/auth/users/${u.id}`, { active: true }), `${u.name} restored`)}>
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {toast.node}
    </>
  );
}

function ChangePassword({ me }: { me: AuthUser }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("next") !== f.get("confirm")) return setMsg({ ok: false, text: "The new passwords don't match" });
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/auth/password", { current: f.get("current"), next: f.get("next") });
      form.reset();
      setMsg({ ok: true, text: "Password changed. Your other devices were signed out." });
    } catch (x) {
      setMsg({ ok: false, text: x instanceof Error ? x.message : "Couldn't change the password" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 16, maxWidth: 560 }}>
      <div className="card-head">
        <div>
          <h2 className="display">Your password</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Signed in as {me.name} · {me.email}
          </div>
        </div>
      </div>
      <form className="card-body form-grid" onSubmit={submit}>
        <div className="field full">
          <label htmlFor="pw-current">Current password</label>
          <input id="pw-current" name="current" type="password" className="input" autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="pw-next">New password</label>
          <input id="pw-next" name="next" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        {msg ? (
          <div className="full">
            <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>
          </div>
        ) : null}
        <div className="full">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface UpdatesStatus {
  enabled: boolean;
  smtp?: boolean;
  subscribers?: number;
  pending?: number;
  recent?: { kind: "reminder" | "update"; subject: string; sent: number; failed: number; at: string; by: string | null }[];
}

function EmailUpdates() {
  const { data, mutate } = useSWR<UpdatesStatus>("/api/updates/status", { refreshInterval: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const n = data?.subscribers ?? 0;
    if (!confirm(`Send this to ${n} ${n === 1 ? "person" : "people"}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ sent: number; failed: number }>("/api/updates/send", { subject: f.get("subject"), message: f.get("message") });
      setMsg({ ok: !r.failed, text: `Sent to ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}.` });
      form.reset();
      mutate();
    } catch (x) {
      setMsg({ ok: false, text: x instanceof Error ? x.message : "Couldn't send" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div>
          <h2 className="display">Email updates</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {data?.subscribers !== undefined
              ? `${data.subscribers} signed up${data.pending ? ` · ${data.pending} waiting to confirm` : ""}. Reminders go out a week and a day before each event.`
              : ""}
          </div>
        </div>
      </div>
      {data && !data.smtp ? (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Notice>
            Sending is off until SMTP_URL and MAIL_FROM are set on the server. A Gmail account with an app password works.
          </Notice>
        </div>
      ) : null}
      <form className="card-body form-grid" onSubmit={send}>
        <div className="field full">
          <label htmlFor="up-subject">Subject</label>
          <input id="up-subject" name="subject" className="input" required maxLength={150} placeholder="Kickoff is this Saturday" />
        </div>
        <div className="field full">
          <label htmlFor="up-message">Message</label>
          <textarea id="up-message" name="message" className="input" required rows={5} maxLength={5000} style={{ height: "auto", padding: 12 }} />
          <span className="hint">Leave a blank line between paragraphs.</span>
        </div>
        {msg ? (
          <div className="full">
            <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>
          </div>
        ) : null}
        <div className="full">
          <button className="btn primary" type="submit" disabled={busy || !data?.subscribers}>
            {busy ? "Sending…" : "Send to everyone"}
          </button>
        </div>
      </form>
      {data?.recent?.length ? (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Subject</th>
                <th className="r">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((m, i) => (
                <tr key={i}>
                  <td className="muted">{when(m.at)}</td>
                  <td>
                    {m.subject}
                    <span className="muted"> · {m.kind === "reminder" ? "reminder" : (m.by ?? "update")}</span>
                  </td>
                  <td className="r num">
                    {m.sent}
                    {m.failed ? ` (${m.failed} failed)` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
