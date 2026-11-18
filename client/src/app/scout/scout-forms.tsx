"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import { post, type ChampRow } from "@/lib/api";
import { Notice, PageHead } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type Kind = "match" | "scrimmage" | "event";

export function ScoutForms() {
  const { user, loading } = useAuth();
  const params = useSearchParams()!;
  const [kind, setKind] = useState<Kind>("match");
  const { data: teams = [] } = useSWR<ChampRow[]>("/api/teams");
  const { data: scrims } = useSWR<{ events: string[] }>("/api/scrimmages");
  const team = params.get("team") ?? "";

  return (
    <>
      <PageHead
        eyebrow="Data entry"
        title="Scout"
        sub="Anything you log here shows up on the site right away."
      />
      {!user ? (
        loading ? null : (
          <div className="card" style={{ maxWidth: 760 }}>
            <div className="empty">
              <strong>Sign in to log data</strong>
              Only invited scouts can add matches, scrimmage reports and events.
              <div style={{ marginTop: 14 }}>
                <Link className="btn primary" href="/login?next=/scout">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        )
      ) : (
        <>
      <div className="seg" role="group" aria-label="What to log" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={kind === "match"} onClick={() => setKind("match")}>
          Match
        </button>
        <button type="button" aria-pressed={kind === "scrimmage"} onClick={() => setKind("scrimmage")}>
          Scrimmage report
        </button>
        <button type="button" aria-pressed={kind === "event"} onClick={() => setKind("event")}>
          Event
        </button>
      </div>

      <datalist id="teams">
        {teams.map((t) => (
          <option key={t.number} value={t.number}>
            {t.name}
          </option>
        ))}
      </datalist>
      <datalist id="scrims">
        {scrims?.events.map((e) => <option key={e} value={e} />)}
      </datalist>

      <div className="card" style={{ maxWidth: 760 }}>
        <div className="card-body" style={{ paddingTop: 18 }}>
          {kind === "match" ? (
            <MatchForm key="m" team={team} teams={teams} />
          ) : kind === "scrimmage" ? (
            <ScrimForm key="s" team={team} />
          ) : (
            <EventForm key="e" />
          )}
        </div>
      </div>
        </>
      )}
    </>
  );
}

function useSubmit(path: string, after: (body: Record<string, string>) => ReactNode) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: ReactNode } | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    setResult(null);
    try {
      await post(path, body);
      await mutate(() => true);
      setResult({ ok: true, msg: after(body) });
      form.querySelectorAll<HTMLInputElement>("[data-clear]").forEach((el) => (el.value = ""));
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, onSubmit };
}

function Result({ result }: { result: { ok: boolean; msg: ReactNode } | null }) {
  if (!result) return null;
  return (
    <div className="full">
      <Notice kind={result.ok ? "ok" : "error"}>{result.msg}</Notice>
    </div>
  );
}

const Field = ({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) => (
  <div className={`field${full ? " full" : ""}`}>
    <label>{label}</label>
    {children}
    {hint ? <span className="hint">{hint}</span> : null}
  </div>
);

function MatchForm({ team, teams }: { team: string; teams: ChampRow[] }) {
  const [num, setNum] = useState(team);
  const known = teams.find((t) => t.number === num.trim());
  const { busy, result, onSubmit } = useSubmit("/api/matches", (b) => (
    <>
      Saved match for team {b.team}.{" "}
      <Link href={`/team/${b.team}`} style={{ fontWeight: 600, textDecoration: "underline" }}>
        View team
      </Link>
    </>
  ));
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Team number" hint={known ? `${known.name || "Unnamed"} · ${known.org || "—"}` : num ? "New team — it'll be added" : ""}>
        <input
          className="input num"
          name="team"
          list="teams"
          inputMode="numeric"
          required
          value={num}
          onChange={(e) => setNum(e.target.value)}
          placeholder="e.g. 3981"
        />
      </Field>
      <Field label="Match label" hint="Optional, like Q4 or Practice 2">
        <input className="input" name="label" data-clear placeholder="Q1" />
      </Field>
      <Field label="Auto points">
        <input className="input num" name="auto" inputMode="decimal" data-clear placeholder="0" />
      </Field>
      <Field label="Teleop points">
        <input className="input num" name="teleop" inputMode="decimal" data-clear placeholder="0" />
      </Field>
      <Field label="Total" hint="Leave blank to use auto + teleop" full>
        <input className="input num" name="total" inputMode="decimal" data-clear />
      </Field>
      <Field label="Notes" full>
        <textarea className="input" name="notes" data-clear placeholder="Strategy, penalties, reliability…" />
      </Field>
      <Result result={result} />
      <div className="full">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save match"}
        </button>
      </div>
    </form>
  );
}

function ScrimForm({ team }: { team: string }) {
  const { busy, result, onSubmit } = useSubmit("/api/scrimmages", (b) => `Saved ${b.event} report for team ${b.team}.`);
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Scrimmage">
        <input className="input" name="event" list="scrims" required placeholder="Operation Pollination" />
      </Field>
      <Field label="Team number">
        <input className="input num" name="team" list="teams" inputMode="numeric" required defaultValue={team} />
      </Field>
      <Field label="Auto points">
        <input className="input num" name="auto" inputMode="decimal" data-clear />
      </Field>
      <Field label="Teleop points">
        <input className="input num" name="teleop" inputMode="decimal" data-clear />
      </Field>
      <Field label="Pit notes" full>
        <textarea className="input" name="notes" data-clear placeholder="Mechanisms, auto routine, driver skill…" />
      </Field>
      <Result result={result} />
      <div className="full">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save report"}
        </button>
      </div>
    </form>
  );
}

function EventForm() {
  const { busy, result, onSubmit } = useSubmit("/api/events", (b) => (
    <>
      Added {b.name}.{" "}
      <Link href="/events" style={{ fontWeight: 600, textDecoration: "underline" }}>
        See calendar
      </Link>
    </>
  ));
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Event name" full>
        <input className="input" name="name" required data-clear placeholder="Kingston Scrimmage" />
      </Field>
      <Field label="Start date">
        <input className="input" type="date" name="start" required />
      </Field>
      <Field label="End date" hint="Optional">
        <input className="input" type="date" name="end" />
      </Field>
      <Field label="Type">
        <select className="select input" name="kind" defaultValue="Scrimmage">
          <option>Scrimmage</option>
          <option>Meet</option>
          <option>Workshop</option>
          <option>Event</option>
        </select>
      </Field>
      <Field label="Location">
        <input className="input" name="location" data-clear placeholder="Venue, city" />
      </Field>
      <Field label="Website" full>
        <input className="input" type="url" name="website" data-clear placeholder="https://" />
      </Field>
      <Result result={result} />
      <div className="full">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add event"}
        </button>
      </div>
    </form>
  );
}
