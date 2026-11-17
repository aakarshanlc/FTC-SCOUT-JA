import { config } from "../config.js";
import { Event, SyncLog } from "../models/index.js";

export const FTC_API = "https://api.ftcscout.org/graphql";
export const FTC_REST = "https://api.ftcscout.org/rest/v1";
export const FTC_WEB = "https://ftcscout.org";

const EVENTS_QUERY = `
  query ($season: Int!, $region: RegionOption, $limit: Int) {
    eventsSearch(season: $season, region: $region, limit: $limit) {
      code name type start end published ongoing finished hasMatches
      timezone website liveStreamURL address
      location { city state country }
    }
  }
`;

const locationOf = (e) => {
  const place = [e.location?.city, e.location?.country].filter(Boolean).join(", ");
  return [e.address, place].filter(Boolean).join(" · ");
};

/** Pull the season's events from FTCScout into MongoDB. */
export async function syncFtcEvents() {
  const started = Date.now();
  const { season, region } = config;
  try {
    const res = await fetch(FTC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: EVENTS_QUERY, variables: { season, region, limit: 100 } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`FTCScout responded HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);
    const events = body.data?.eventsSearch ?? [];

    const ops = events.map((e) => {
      const key = `ftc-${season}-${e.code}`;
      return {
        updateOne: {
          filter: { key },
          update: {
            $set: {
              key,
              name: e.name,
              kind: e.type,
              start: e.start || null,
              end: e.end || e.start || null,
              location: locationOf(e),
              website: e.website,
              liveStream: e.liveStreamURL,
              url: `${FTC_WEB}/events/${season}/${e.code}`,
              code: e.code,
              origin: "ftcscout",
              finished: e.finished,
              ongoing: e.ongoing,
              hasMatches: e.hasMatches,
            },
          },
          upsert: true,
        },
      };
    });
    if (ops.length) await Event.bulkWrite(ops);
    const keep = events.map((e) => `ftc-${season}-${e.code}`);
    await Event.deleteMany({ origin: "ftcscout", key: { $nin: keep } });

    const log = await SyncLog.create({
      kind: "ftcscout",
      ok: true,
      message: `${events.length} events for region ${region}`,
      counts: { events: events.length },
      durationMs: Date.now() - started,
    });
    console.log(`[sync] ftcscout ok: ${events.length} events`);
    return log;
  } catch (err) {
    console.error(`[sync] ftcscout failed: ${err.message}`);
    return SyncLog.create({
      kind: "ftcscout",
      ok: false,
      message: err.message,
      durationMs: Date.now() - started,
    });
  }
}

// Per-event match schedules are proxied live with a short in-memory cache.
const matchCache = new Map();
const MATCH_TTL_MS = 60_000;

const score = (a) => (a ? (a.totalPointsNp ?? a.totalPoints ?? null) : null);
const label = (m) =>
  m.tournamentLevel === "Quals"
    ? `Q${m.id}`
    : `${m.tournamentLevel === "DoubleElim" ? "DE" : m.tournamentLevel || "Match"} ${m.id}`;

export async function eventMatches(code) {
  const key = `${config.season}-${code}`;
  const hit = matchCache.get(key);
  if (hit && Date.now() - hit.at < MATCH_TTL_MS) return hit.data;

  const res = await fetch(`${FTC_REST}/events/${config.season}/${encodeURIComponent(code)}/matches`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FTCScout responded HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("Unexpected matches payload from FTCScout");

  const data = raw.map((m) => {
    const teams = m.teams ?? [];
    const side = (a) => teams.filter((t) => t.alliance === a).map((t) => String(t.teamNumber));
    return {
      id: `${m.tournamentLevel}-${m.id}`,
      label: label(m),
      level: m.tournamentLevel ?? "",
      time: m.actualStartTime || m.scheduledStartTime || null,
      played: Boolean(m.hasBeenPlayed),
      red: { teams: side("Red"), score: score(m.scores?.red) },
      blue: { teams: side("Blue"), score: score(m.scores?.blue) },
    };
  });
  matchCache.set(key, { at: Date.now(), data });
  return data;
}
