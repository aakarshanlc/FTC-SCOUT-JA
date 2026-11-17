// Mirrors FIRST's official FTC Events API for every event in the region:
// registered teams, the full award list, alliance selection, advancement to
// the next level, ranking tiebreakers and venue details — data FTCScout lacks.
// Requires FTC_API_USER / FTC_API_TOKEN (free: ftc-events.firstinspires.org/services/API).

import { config } from "../config.js";
import { FirstEvent, SyncLog, Team } from "../models/index.js";

const API = "https://ftc-api.firstinspires.org/v2.0";
export const FIRST_API_SEASON = 2019; // first season the FTC Events API covers
const REGION_COUNTRY = { JM: "Jamaica" };

export const firstApiConfigured = () => Boolean(config.firstApiUser && config.firstApiToken);

async function get(path) {
  const auth = Buffer.from(`${config.firstApiUser}:${config.firstApiToken}`).toString("base64");
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401) throw new Error("FIRST API rejected the credentials (check FTC_API_USER / FTC_API_TOKEN)");
  // The API answers 5xx/404 for endpoints an event never used (e.g. advancement at a kickoff).
  if (!res.ok) return null;
  return res.json();
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const ref = (t) => (t ? { team: String(t.teamNumber), name: t.teamName ?? "" } : null);

/** Events in the region for one season (FIRST has no region filter, so filter locally). */
async function regionEvents(season) {
  const data = await get(`${season}/events`);
  const country = REGION_COUNTRY[config.region];
  return (data?.events ?? []).filter((e) => e.regionCode === config.region || (country && e.country === country));
}

async function importEvent(season, e) {
  const code = e.code;
  const [teams, awards, alliances, advancement, rankings] = await Promise.all([
    get(`${season}/teams?eventCode=${code}`),
    get(`${season}/awards/${code}`),
    get(`${season}/alliances/${code}`),
    get(`${season}/advancement/${code}`),
    get(`${season}/rankings/${code}`),
  ]);

  const doc = {
    season,
    code,
    name: e.name,
    typeName: e.typeName,
    venue: e.venue ?? "",
    address: e.address ?? "",
    city: e.city ?? "",
    country: e.country ?? "",
    coordinates: e.coordinates?.coordinates ?? [],
    fieldCount: e.fieldCount ?? null,
    website: e.website ?? null,
    liveStream: e.liveStreamUrl ?? null,
    volunteerUrl: e.volunteerUrl ?? null,
    timezone: e.timezone ?? null,
    start: day(e.dateStart),
    end: day(e.dateEnd),
    teams: (teams?.teams ?? []).map((t) => ({
      team: String(t.teamNumber),
      name: t.nameShort ?? "",
      sponsors: t.nameFull ?? "",
      city: t.displayLocation ?? t.city ?? "",
      country: t.country ?? "",
      robotName: t.robotName ?? null,
      rookieYear: t.rookieYear ?? null,
    })),
    awards: (awards?.awards ?? []).map((a) => ({
      awardId: a.awardId,
      name: a.name,
      series: a.series,
      team: a.teamNumber ? String(a.teamNumber) : null,
      person: a.person ?? null,
      school: a.fullTeamName ?? a.schoolName ?? null,
    })),
    alliances: (alliances?.alliances ?? []).map((a) => ({
      number: a.number,
      name: a.name,
      captain: ref(a.captain),
      picks: [a.round1, a.round2, a.round3].map(ref).filter(Boolean),
      backup: ref(a.backup),
    })),
    advancement: advancement?.advancement
      ? {
          advancesTo: advancement.advancesTo ?? null,
          slots: advancement.slots ?? null,
          teams: advancement.advancement.map((x) => ({
            team: String(x.team),
            slot: x.slot,
            criteria: x.criteria,
            declined: Boolean(x.declined),
            status: x.status ?? null,
          })),
        }
      : null,
    rankings: (rankings?.rankings ?? []).map((r) => ({
      rank: r.rank,
      team: String(r.teamNumber),
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      dq: r.dq,
      played: r.matchesPlayed,
      sortOrders: [r.sortOrder1, r.sortOrder2, r.sortOrder3, r.sortOrder4, r.sortOrder5, r.sortOrder6],
    })),
  };
  await FirstEvent.updateOne({ season, code }, { $set: doc }, { upsert: true });
  return doc;
}

/** Fold each team's latest registration (robot name, sponsors, home) into Team. */
async function updateTeams(events) {
  const country = REGION_COUNTRY[config.region];
  const latest = new Map();
  for (const ev of [...events].sort((a, b) => a.season - b.season)) {
    for (const t of ev.teams) {
      // Visiting teams stay on event pages but aren't added to the region's team list.
      if (country && t.country && t.country !== country) continue;
      const cur = latest.get(t.team) ?? { robotNames: {} };
      if (t.robotName) cur.robotNames[ev.season] = t.robotName;
      latest.set(t.team, { ...cur, ...t, season: ev.season, robotNames: cur.robotNames });
    }
  }
  const fill = (field, value) => ({
    $cond: [{ $eq: [{ $ifNull: [`$${field}`, ""] }, ""] }, { $literal: value ?? "" }, `$${field}`],
  });
  const ops = [...latest].map(([number, t]) => ({
    updateOne: {
      filter: { number },
      update: [
        {
          $set: {
            number,
            name: fill("name", t.name),
            robot: { $ifNull: ["$robot", {}] },
            ftc: { $ifNull: ["$ftc", null] },
            first: {
              $literal: {
                fullName: t.sponsors,
                robotName: t.robotName ?? Object.values(t.robotNames).at(-1) ?? null,
                city: t.city,
                lastSeason: t.season,
                robotNames: t.robotNames,
              },
            },
            createdAt: { $ifNull: ["$createdAt", "$$NOW"] },
            updatedAt: "$$NOW",
          },
        },
      ],
      upsert: true,
    },
  }));
  if (ops.length) await Team.bulkWrite(ops, { ordered: false });
  return ops.length;
}

let running = null;
let lastRun = 0;
const MIN_GAP_MS = 15 * 60_000;

/**
 * Import past seasons once and the two most recent seasons on each run
 * (at most every 15 minutes unless forced). No-op without API credentials.
 */
export function syncFirst({ full = false, force = false } = {}) {
  if (!firstApiConfigured()) return Promise.resolve(null);
  if (!running && !full && !force && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve(null);
  running ??= doSync(full).finally(() => {
    running = null;
    lastRun = Date.now();
  });
  return running;
}

async function doSync(full) {
  const started = Date.now();
  const have = new Set(await FirstEvent.distinct("season"));
  const counts = { seasons: 0, events: 0, awards: 0, alliances: 0, teams: 0 };
  const errors = [];
  try {
    for (let s = FIRST_API_SEASON; s <= config.season; s++) {
      if (!full && have.has(s) && s < config.season - 1) continue;
      const events = await regionEvents(s);
      for (const e of events) {
        const doc = await importEvent(s, e);
        counts.events += 1;
        counts.awards += doc.awards.length;
        counts.alliances += doc.alliances.length;
      }
      counts.seasons += 1;
      console.log(`[sync] FIRST ${s}: ${events.length} events`);
    }
    counts.teams = await updateTeams(await FirstEvent.find({}, { season: 1, teams: 1 }).lean());
  } catch (err) {
    errors.push(err.message);
    console.error(`[sync] FIRST failed: ${err.message}`);
  }
  return SyncLog.create({
    kind: "first",
    ok: errors.length === 0,
    message: errors.length ? errors.join("; ") : `FIRST API: ${counts.events} events across ${counts.seasons} seasons`,
    counts,
    durationMs: Date.now() - started,
  });
}
