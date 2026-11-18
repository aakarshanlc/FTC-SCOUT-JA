"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { API_URL, del, fetcher, type CalEvent, type EventMatch } from "@/lib/api";
import { dateParts, eventTitle, fmtRange, seasonLabel } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Empty, ErrorNotice, Notice, PageHead, SkeletonRows, useToast } from "@/components/ui";
import { IconArrowRight, IconCalendar, IconChevron, IconExternal, IconTrash } from "@/components/icons";

export default function EventsPage() {
  const { data, error, isLoading } = useSWR<{ upcoming: CalEvent[]; past: CalEvent[] }>("/api/events");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const toast = useToast();
  const list = data?.[tab] ?? [];

  const [subscribing, setSubscribing] = useState(false);

  return (
    <>
      <PageHead
        eyebrow="Season calendar"
        title="Events"
        sub="Official events, scrimmages and anything else on the FTC Jamaica calendar."
      >
        <button type="button" className="btn" onClick={() => setSubscribing((o) => !o)} aria-expanded={subscribing}>
          <IconCalendar /> Add to my calendar
        </button>
      </PageHead>
      {subscribing ? <SubscribePanel onClose={() => setSubscribing(false)} onCopied={() => toast.show("Calendar link copied")} /> : null}
      <ErrorNotice error={error} />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Which events">
          <button type="button" aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>
            Upcoming {data ? data.upcoming.length : ""}
          </button>
          <button type="button" aria-pressed={tab === "past"} onClick={() => setTab("past")}>
            Past {data ? data.past.length : ""}
          </button>
        </div>
      </div>
      <div className="card timeline">
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : list.length ? (
          list.map((e) => <EventRow key={e.id} ev={e} past={tab === "past"} onDeleted={() => toast.show("Event removed")} />)
        ) : (
          <Empty title={tab === "upcoming" ? "Nothing scheduled" : "No past events yet"} />
        )}
      </div>
      {toast.node}
    </>
  );
}

function EventRow({ ev, past, onDeleted }: { ev: CalEvent; past: boolean; onDeleted: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();
  const d = dateParts(ev.start);
  const kindClass = ev.kind === "Championship" ? "signal" : ev.kind === "Scrimmage" ? "blue" : "";

  const remove = async () => {
    if (!ev._mongoId || !confirm(`Delete “${eventTitle(ev.name)}”?`)) return;
    await del(`/api/events/${ev._mongoId}`);
    await mutate("/api/events");
    onDeleted();
  };

  return (
    <article className="ev">
      <div className={`datebox${d ? "" : " tbd"}`}>
        <div className="m">{d?.month ?? "DATE"}</div>
        <div className="d">{d?.d ?? "TBD"}</div>
        <div className="y">{d?.y ?? " "}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="ev-title">
          {eventTitle(ev.name)}
          <span className={`badge ${kindClass}`}>{ev.kind}</span>
          {ev.ongoing ? (
            <span className="badge red live">
              <span className="dot" /> Live
            </span>
          ) : null}
        </div>
        <div className="ev-meta">
          {fmtRange(ev.start, ev.end)}
          {ev.season ? ` · ${seasonLabel(ev.season)} season` : ""}
          {ev.location ? ` · ${ev.location}` : ""}
          {ev.entries ? ` · ${ev.entries} scouting reports` : ""}
        </div>
        <div className="ev-actions">
          {ev.code && ev.season && ev.hasMatches ? (
            <Link className="btn sm dark" href={`/events/${ev.season}/${ev.code}`}>
              Results &amp; rankings <IconArrowRight />
            </Link>
          ) : null}
          {ev.code && ev.ongoing ? (
            <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              Live matches <IconChevron style={{ transform: open ? "rotate(180deg)" : undefined }} />
            </button>
          ) : null}
          {ev.googleCalendar && !past ? (
            <a className="btn sm" href={ev.googleCalendar} target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          ) : null}
          {ev.url ? (
            <a className="btn sm ghost" href={ev.url} target="_blank" rel="noreferrer">
              FTCScout <IconExternal />
            </a>
          ) : null}
          {ev.website ? (
            <a className="btn sm ghost" href={ev.website} target="_blank" rel="noreferrer">
              Website <IconExternal />
            </a>
          ) : null}
          {ev.liveStream ? (
            <a className="btn sm ghost" href={ev.liveStream} target="_blank" rel="noreferrer">
              Livestream <IconExternal />
            </a>
          ) : null}
          {ev._mongoId && user ? (
            <button type="button" className="btn sm ghost" onClick={remove} aria-label="Delete event">
              <IconTrash />
            </button>
          ) : null}
        </div>
        {open && ev.code ? <Matches code={ev.code} /> : null}
      </div>
    </article>
  );
}

function Matches({ code }: { code: string }) {
  const { data, error, isLoading } = useSWR<EventMatch[]>(`/api/events/${code}/matches`, fetcher, {
    refreshInterval: 60_000,
  });
  if (error)
    return (
      <div style={{ marginTop: 12 }}>
        <Notice kind="error">{error.message}</Notice>
      </div>
    );
  if (isLoading) return <SkeletonRows rows={3} />;
  if (!data?.length)
    return (
      <div style={{ marginTop: 12 }}>
        <Notice>No match schedule published yet.</Notice>
      </div>
    );
  return (
    <div className="tablewrap" style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
      <table className="data">
        <thead>
          <tr>
            <th>Match</th>
            <th>Time</th>
            <th className="r">Red</th>
            <th className="r">Blue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const r = m.red.score;
            const b = m.blue.score;
            return (
              <tr key={m.id}>
                <td className="num" style={{ fontWeight: 600 }}>
                  {m.label}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {m.time
                    ? new Date(m.time).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "–"}
                </td>
                <td>
                  <span className={`alliance red${r !== null && b !== null && r > b ? " win" : ""}`}>
                    <span className="teams">{m.red.teams.join(" · ") || "–"}</span>
                    <span className="sc">{r ?? "–"}</span>
                  </span>
                </td>
                <td>
                  <span className={`alliance blue${r !== null && b !== null && b > r ? " win" : ""}`}>
                    <span className="teams">{m.blue.teams.join(" · ") || "–"}</span>
                    <span className="sc">{b ?? "–"}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Subscribe links for the live calendar feed. Calendars that subscribe pick up new and changed events on their own. */
function SubscribePanel({ onClose, onCopied }: { onClose: () => void; onCopied: () => void }) {
  const origin = (API_URL && API_URL !== "/" ? API_URL : window.location.origin).replace(/\/$/, "");
  const feed = `${origin}/events.ics`;
  const webcal = feed.replace(/^https?:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent("FTC Jamaica Events")}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feed);
      onCopied();
    } catch {
      window.prompt("Copy this calendar link", feed);
    }
  };
  return (
    <section className="card subscribe-panel">
      <div className="card-head">
        <div>
          <h2 className="display">Add the FTC Jamaica calendar</h2>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Every event on this page shows up in your calendar, and changes come through on their own.
          </div>
        </div>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="card-body subscribe-options">
        <a className="btn primary" href={google} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
        <a className="btn" href={webcal}>
          Apple Calendar
        </a>
        <a className="btn" href={outlook} target="_blank" rel="noreferrer">
          Outlook
        </a>
        <button type="button" className="btn ghost" onClick={copy}>
          Copy link
        </button>
      </div>
      <p className="muted subscribe-foot">
        Want a reminder by email instead? <Link href="/updates">Sign up for email updates</Link>.
      </p>
    </section>
  );
}
