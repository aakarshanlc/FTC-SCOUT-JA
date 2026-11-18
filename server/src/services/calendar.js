import { Event, Scrimmage } from "../models/index.js";
import { cleanPlace, slug, todayISO } from "../lib/util.js";

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

const shape = (e) => ({
  id: e.key,
  name: e.name,
  kind: e.kind,
  start: e.start,
  end: e.end,
  location: cleanPlace(e.location),
  website: e.website,
  liveStream: e.liveStream,
  url: e.url,
  code: e.code,
  season: e.season ?? null,
  origin: e.origin,
  finished: e.finished,
  ongoing: e.ongoing,
  hasMatches: e.hasMatches,
  entries: 0,
  _mongoId: e.origin === "manual" ? String(e._id) : undefined,
});

/** All events: FTCScout + sheet/manual dated events + one per scrimmage name. */
export async function allEvents() {
  const [events, scrimCounts] = await Promise.all([
    Event.find().lean(),
    Scrimmage.aggregate([{ $group: { _id: "$event", entries: { $sum: 1 } } }]),
  ]);
  const out = events.map(shape);
  const byName = new Map(out.map((e) => [e.name.toLowerCase(), e]));
  for (const { _id: name, entries } of scrimCounts) {
    const existing = byName.get(name.toLowerCase());
    if (existing) {
      // A dated row with the same name gives the scrimmage its date.
      existing.kind = "Scrimmage";
      existing.entries = entries;
      continue;
    }
    out.push({
      id: `scrim-${slug(name)}`,
      name,
      kind: "Scrimmage",
      start: null,
      end: null,
      location: "",
      website: null,
      liveStream: null,
      url: null,
      code: null,
      origin: "sheet",
      finished: false,
      ongoing: false,
      hasMatches: false,
      entries,
    });
  }
  const today = todayISO();
  for (const e of out) {
    if (e.origin !== "ftcscout" && e.end) e.finished = e.end < today;
    e.googleCalendar = googleCalendarUrl(e);
  }
  return out;
}

const isUpcoming = (e, today) => {
  if (e.ongoing) return true;
  if (e.finished) return false;
  if (!e.start) return true;
  return (e.end ?? e.start) >= today;
};

const byDate = (a, b) => {
  if (!a.start) return 1;
  if (!b.start) return -1;
  return a.start.localeCompare(b.start) || a.name.localeCompare(b.name);
};

export function splitUpcoming(events, today = todayISO()) {
  return {
    upcoming: events.filter((e) => isUpcoming(e, today)).sort(byDate),
    past: events.filter((e) => !isUpcoming(e, today)).sort((a, b) => -byDate(a, b)),
  };
}

export function googleCalendarUrl(e) {
  if (!e.start) return null;
  const endExclusive = addDays(e.end ?? e.start, 1);
  const details = [e.kind, e.url ? `Details: ${e.url}` : "", e.website ? `Website: ${e.website}` : ""]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${e.start.replace(/-/g, "")}/${endExclusive.replace(/-/g, "")}`,
    location: e.location ?? "",
    details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const icsEscape = (s) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const fold = (line) => {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n ");
};

const compact = (d) => d.replace(/-/g, "");

export function icsFor(events) {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FTC Scout//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FTC Jamaica Events",
    "X-WR-CALDESC:Events and scrimmages for FTC teams in Jamaica",
    "X-WR-TIMEZONE:America/Jamaica",
    // Ask calendar apps to check for changes every 6 hours.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    if (!e.start) continue;
    const description = [e.kind, e.url, e.website, e.liveStream && `Livestream: ${e.liveStream}`]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@ftc-scout`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(addDays(e.end ?? e.start, 1))}`,
      fold(`SUMMARY:${icsEscape(e.name)}`),
    );
    if (e.location) lines.push(fold(`LOCATION:${icsEscape(e.location)}`));
    if (description) lines.push(fold(`DESCRIPTION:${icsEscape(description)}`));
    if (e.url || e.website) lines.push(fold(`URL:${e.url ?? e.website}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
