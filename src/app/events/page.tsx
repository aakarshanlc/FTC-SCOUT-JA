"use client";

import { useMemo, useState } from "react";
import { useScout } from "@/components/ScoutProvider";
import { Banner } from "@/components/ui";
import {
  SEASON,
  allianceScore,
  fetchEventMatches,
  matchLabel,
  type FtcMatch,
} from "@/lib/ftcscout";
import {
  buildCalendar,
  fmtDateRange,
  googleCalendarUrl,
  splitUpcoming,
  type CalendarEvent,
} from "@/lib/events";

export default function EventsPage() {
  const { ftcEvents, sheetEvents, scrimmages, eventsBanner, reportApi } = useScout();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [matchCache, setMatchCache] = useState<Record<string, FtcMatch[]>>({});
  const [matchErr, setMatchErr] = useState<Record<string, string>>({});

  const all = useMemo(
    () => buildCalendar(ftcEvents, sheetEvents, scrimmages),
    [ftcEvents, sheetEvents, scrimmages],
  );
  const { upcoming, past } = useMemo(() => splitUpcoming(all), [all]);

  const toggleMatches = async (ev: CalendarEvent) => {
    if (expanded === ev.id) {
      setExpanded(null);
      return;
    }
    setExpanded(ev.id);
    if (!ev.code || matchCache[ev.id] || matchErr[ev.id]) return;
    try {
      const m = await fetchEventMatches(SEASON, ev.code);
      setMatchCache((c) => ({ ...c, [ev.id]: m }));
      reportApi(`matches:${ev.id}`, {
        text: `FTCScout: ${m.length} matches loaded for ${ev.code}`,
        error: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMatchErr((e) => ({ ...e, [ev.id]: msg }));
      reportApi(`matches:${ev.id}`, {
        text: `FTCScout matches (${ev.code}): ${msg} — schedule unavailable.`,
        error: true,
      });
    }
  };

  return (
    <>
      <Banner status={eventsBanner.status} error={eventsBanner.error} />
      <div className="pagehead">
        <h1>Events</h1>
        <span className="muted">
          {upcoming.length} upcoming · {past.length} past
        </span>
      </div>

      <div className="card">
        <div className="ev-head">
          <h3>Upcoming</h3>
        </div>
        {upcoming.length ? (
          upcoming.map((ev) => (
            <EventRow
              key={ev.id}
              ev={ev}
              expanded={expanded === ev.id}
              onToggle={() => toggleMatches(ev)}
              matches={matchCache[ev.id]}
              error={matchErr[ev.id]}
            />
          ))
        ) : (
          <p className="empty">Nothing scheduled yet.</p>
        )}
      </div>

      {past.length ? (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="ev-head">
            <h3>Past</h3>
          </div>
          {past.map((ev) => (
            <EventRow
              key={ev.id}
              ev={ev}
              expanded={expanded === ev.id}
              onToggle={() => toggleMatches(ev)}
              matches={matchCache[ev.id]}
              error={matchErr[ev.id]}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function EventRow({
  ev,
  expanded,
  onToggle,
  matches,
  error,
}: {
  ev: CalendarEvent;
  expanded: boolean;
  onToggle: () => void;
  matches?: FtcMatch[];
  error?: string;
}) {
  const gcal = googleCalendarUrl(ev);
  const details = ev.url ?? ev.website;

  return (
    <div className="ev">
      <div className="ev-when">
        {fmtDateRange(ev.start, ev.end)}
        {ev.ongoing ? <span className="ev-live">Live</span> : null}
      </div>
      <div className="ev-main">
        <div className="ev-title">
          {ev.name}
          <span className="pill kind">{ev.kind}</span>
          {ev.teams ? <span className="muted">· {ev.teams} teams</span> : null}
        </div>
        {ev.location ? <div className="ev-meta">{ev.location}</div> : null}
        <div className="ev-links">
          {gcal ? (
            <a href={gcal} target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          ) : null}
          {ev.code ? (
            <button type="button" onClick={onToggle}>
              {expanded ? "Hide matches" : "Match info"}
            </button>
          ) : null}
          {details ? (
            <a href={details} target="_blank" rel="noreferrer">
              {ev.url ? "FTCScout" : "Website"}
            </a>
          ) : null}
        </div>
        {expanded ? (
          <MatchList matches={matches} error={error} hasCode={Boolean(ev.code)} />
        ) : null}
      </div>
    </div>
  );
}

function MatchList({
  matches,
  error,
  hasCode,
}: {
  matches?: FtcMatch[];
  error?: string;
  hasCode: boolean;
}) {
  if (error) return <p className="empty ev-note">Matches: {error}</p>;
  if (!matches) return <p className="empty ev-note">Loading match schedule…</p>;
  if (!matches.length)
    return (
      <p className="empty ev-note">
        {hasCode
          ? "No match results yet — the schedule isn't published."
          : "No matches for this event."}
      </p>
    );

  return (
    <div className="ev-matches tablewrap">
      <table>
        <thead>
          <tr>
            <th>Match</th>
            <th>Time</th>
            <th className="num">Red</th>
            <th className="num">Blue</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const redTeams = (m.teams ?? [])
              .filter((t) => t.alliance === "Red")
              .map((t) => String(t.teamNumber));
            const blueTeams = (m.teams ?? [])
              .filter((t) => t.alliance === "Blue")
              .map((t) => String(t.teamNumber));
            const when = m.actualStartTime || m.scheduledStartTime;
            return (
              <tr key={`${m.tournamentLevel}-${m.id}`}>
                <td>
                  <strong>{matchLabel(m)}</strong>
                  <div className="ev-teams">{m.tournamentLevel || ""}</div>
                </td>
                <td>
                  {when
                    ? new Date(when).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "–"}
                </td>
                <td className="num">
                  <strong>{fmtScore(allianceScore(m.scores?.red))}</strong>
                  <div className="ev-teams">{redTeams.join(", ") || "–"}</div>
                </td>
                <td className="num">
                  <strong>{fmtScore(allianceScore(m.scores?.blue))}</strong>
                  <div className="ev-teams">{blueTeams.join(", ") || "–"}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmtScore = (v: number | null): string => (v === null ? "–" : String(v));
