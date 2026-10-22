import { SEASON, ftcEventLocation, ftcEventUrl, type FtcEvent } from "./ftcscout";
import { col, type Row } from "./sheet";

// One calendar event regardless of where it came from:
// FTCScout (kickoff, champs…), the sheet's Events tab (anything hand-dated),
// or a scrimmage name from the Scrimmages tab (date optional).
export interface CalendarEvent {
  id: string;
  name: string;
  kind: string; // "Championship", "Kickoff", "Scrimmage", …
  start: string | null; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD, inclusive
  location: string;
  website: string | null;
  liveStream: string | null;
  url: string | null; // where to see schedules/results
  code: string | null; // FTCScout event code (match schedules)
  source: "ftcscout" | "sheet";
  finished: boolean;
  ongoing: boolean;
  hasMatches: boolean;
  teams: number; // scrim entries logged (0 for non-scrimmages)
}

// date helpers — everything is a plain YYYY-MM-DD string so a UTC/local
// mismatch can never shift a date by a day.

export const todayISO = (d = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parse a sheet cell into YYYY-MM-DD, or null if it isn't a usable date. */
export function parseSheetDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); // ISO
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // 2/12/2027 (M/D/YYYY)
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s); // "Feb 12, 2027" etc. — last resort
  return Number.isNaN(t) ? null : iso(new Date(t));
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
};

export const isUpcoming = (e: CalendarEvent, today = todayISO()): boolean => {
  if (e.ongoing) return true;
  if (e.finished) return false;
  if (!e.start) return true; // undated scrimmages stay visible until dated
  return (e.end ?? e.start) >= today;
};

export const fromFtc = (e: FtcEvent, season: number): CalendarEvent => ({
  id: `ftc-${season}-${e.code}`,
  name: e.name,
  kind: e.type,
  start: e.start || null,
  end: e.end || e.start || null,
  location: ftcEventLocation(e),
  website: e.website,
  liveStream: e.liveStreamURL,
  url: ftcEventUrl(season, e.code),
  code: e.code,
  source: "ftcscout",
  finished: e.finished,
  ongoing: e.ongoing,
  hasMatches: e.hasMatches,
  teams: 0,
});

/** Rows of the sheet's optional Events tab: Date, Name, Location, Notes.
 *  Rows without a parseable date or a name are skipped (a stub tab with the
 *  wrong headers therefore yields no events instead of garbage). */
export function fromSheetEvents(rows: Row[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    const name = col(r, "name", "event").trim();
    const start = parseSheetDate(col(r, "date"));
    if (!name || !start) continue;
    const end = parseSheetDate(col(r, "end", "to", "date")) || start;
    out.push({
      id: `sheet-${start}-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      kind: col(r, "type", "kind") || "Event",
      start,
      end: end < start ? start : end,
      location: col(r, "location", "place", "venue"),
      website: col(r, "link", "url", "website") || null,
      liveStream: null,
      url: null,
      code: null,
      source: "sheet",
      finished: end < todayISO(),
      ongoing: false,
      hasMatches: false,
      teams: 0,
    });
  }
  return out;
}

/** Scrimmages as events — FTCScout never lists them. Each name from the
 *  Scrimmages tab becomes an event; the sheet Events tab supplies its date
 *  when a row matches the scrimmage name. */
export function fromScrimmages(
  scrimmages: Row[],
  sheetEvents: CalendarEvent[],
): CalendarEvent[] {
  const byName = new Map<string, { count: number; kind: string; loc: string }>();
  for (const r of scrimmages) {
    const name = col(r, "scrimmage").trim();
    if (!name) continue;
    const e = byName.get(name) ?? { count: 0, kind: "Scrimmage", loc: "" };
    e.count += 1;
    if (!e.loc) e.loc = col(r, "location", "place") || e.loc;
    byName.set(name, e);
  }
  // Any Events-tab row whose name matches a scrimmage supplies its date.
  const dated = new Map<string, CalendarEvent>();
  for (const e of sheetEvents) dated.set(e.name.toLowerCase(), e);
  return [...byName].map(([name, info]) => {
    const match = dated.get(name.toLowerCase());
    return {
      id: `scrim-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      kind: "Scrimmage",
      start: match?.start ?? null,
      end: match?.end ?? null,
      location: match?.location || info.loc,
      website: null,
      liveStream: null,
      url: null,
      code: null,
      source: "sheet",
      finished: match ? isFinished(match) : false,
      ongoing: false,
      hasMatches: false,
      teams: info.count,
    };
  });
}

const isFinished = (e: CalendarEvent, today = todayISO()): boolean =>
  Boolean(e.end && e.end < today);

/** Upcoming first (soonest first), past last (most recent first). */
export const byDateAsc = (a: CalendarEvent, b: CalendarEvent): number => {
  if (!a.start) return 1;
  if (!b.start) return -1;
  return a.start < b.start ? -1 : a.start > b.start ? 1 : a.name.localeCompare(b.name);
};

export const splitUpcoming = (
  events: CalendarEvent[],
  today = todayISO(),
): { upcoming: CalendarEvent[]; past: CalendarEvent[] } => ({
  upcoming: events.filter((e) => isUpcoming(e, today)).sort(byDateAsc),
  past: events.filter((e) => !isUpcoming(e, today)).sort((a, b) => -byDateAsc(a, b)),
});

// calendar links

/** Google Calendar "add event" link for a dated event (null when undated). */
export function googleCalendarUrl(e: CalendarEvent): string | null {
  if (!e.start) return null;
  const endExclusive = addDays(e.end ?? e.start, 1);
  const details = [
    e.kind,
    e.teams ? `${e.teams} scrimmage entries logged` : "",
    e.url ? `Details: ${e.url}` : "",
    e.website ? `Website: ${e.website}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${e.start.replace(/-/g, "")}/${endExclusive.replace(/-/g, "")}`,
    location: e.location,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// iCalendar (.ics) — one file for the whole schedule, all-day events.

const icsEscape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Keep each content line at ≤75 octets (RFC 5545 folding). */
const fold = (line: string): string => {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n ");
};

const stamp = (d = new Date()): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

const compact = (date: string): string => date.replace(/-/g, "");

/** Build an .ics document for dated events (undated ones can't be scheduled). */
export function icsFor(events: CalendarEvent[]): string {
  const now = stamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FTC Scouting//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FTC Scouting Events",
    "X-WR-TIMEZONE:America/Jamaica",
  ];
  for (const e of events) {
    if (!e.start) continue;
    const endExclusive = addDays(e.end ?? e.start, 1);
    const description = [
      e.kind,
      e.teams ? `${e.teams} scrimmage entries logged` : "",
      e.url ?? "",
      e.website ?? "",
      e.liveStream ? `Livestream: ${e.liveStream}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@ftc-scouting`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(endExclusive)}`,
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

/** "Feb 12 – 13, 2027" / "Feb 12, 2027" / "Date TBD". */
export function fmtDateRange(start: string | null, end: string | null): string {
  if (!start) return "Date TBD";
  const d = new Date(`${start}T00:00:00`);
  const month = (x: Date) => x.toLocaleDateString("en-US", { month: "short" });
  if (!end || end <= start) return `${month(d)} ${d.getDate()}, ${d.getFullYear()}`;
  const e = new Date(`${end}T00:00:00`);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${month(d)} ${d.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
  return `${month(d)} ${d.getDate()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

/** FTCScout events + hand-dated sheet rows + scrimmages, deduplicated:
 *  a sheet row merges into a scrimmage of the same name, and a sheet row
 *  that duplicates an FTCScout event is dropped in favour of the API data. */
export function buildCalendar(
  ftc: FtcEvent[],
  sheetRows: Row[],
  scrimmages: Row[],
): CalendarEvent[] {
  const sheetEvents = fromSheetEvents(sheetRows);
  const scrims = fromScrimmages(scrimmages, sheetEvents);
  const official = new Set(ftc.map((e) => e.name.toLowerCase()));
  const scrimNames = new Set(scrims.map((s) => s.name.toLowerCase()));
  const handDated = sheetEvents.filter(
    (e) => !official.has(e.name.toLowerCase()) && !scrimNames.has(e.name.toLowerCase()),
  );
  return [...ftc.map((e) => fromFtc(e, SEASON)), ...handDated, ...scrims];
}
