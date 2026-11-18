// Mirrors FTCScout history for every team in the region into MongoDB:
// per-season quick stats (OPR + world rank), per-event results and awards,
// and every match a regional team played. Past seasons never change, so they
// are imported once; the current and previous season refresh on every run.

import { config } from "../config.js";
import { Event, FtcMatch, Participation, SyncLog, TeamSeason } from "../models/index.js";
import { FTC_API, FTC_WEB } from "./ftcscout.js";
import { cleanPlace } from "../lib/util.js";

export const FIRST_SEASON = 2019; // earliest season FTCScout has data for
const REGION_COUNTRY = { JM: "Jamaica" };

// Union member type names per season (remote formats have no alliances, skipped).
const typeNames = (s) => (s === 2020 || s === 2021 ? [`${s}Trad`] : [`${s}`]);

const statsFragments = (s) =>
  typeNames(s)
    .map(
      (t) => `... on TeamEventStats${t} {
        rank rp wins losses ties qualMatchesPlayed
        opr { autoPoints dcPoints totalPointsNp }
        avg { autoPoints dcPoints totalPointsNp }
        max { totalPointsNp }
      }`,
    )
    .join("\n");

const allianceFields = "autoPoints dcPoints totalPointsNp totalPoints";
const scoreFragments = (s) =>
  typeNames(s)
    .map((t) => `... on MatchScores${t} { red { ${allianceFields} } blue { ${allianceFields} } }`)
    .join("\n");

const seasonQuery = (s) => `
  query ($region: RegionOption) {
    teamsSearch(region: $region, limit: 1000) {
      number
      location { country }
      quickStats(season: ${s}) {
        count
        tot { value rank } auto { value rank } dc { value rank } eg { value rank }
      }
      events(season: ${s}) {
        eventCode
        event { name type start end remote address location { city country } }
        stats { ${statsFragments(s)} }
        awards { type placement personName }
      }
      matches(season: ${s}) {
        match {
          id eventCode matchNum series tournamentLevel hasBeenPlayed
          actualStartTime scheduledStartTime
          event { name }
          teams { teamNumber alliance noShow }
          scores { ${scoreFragments(s)} }
        }
      }
    }
  }
`;

const eventsQuery = `
  query ($season: Int!, $region: RegionOption) {
    eventsSearch(season: $season, region: $region, limit: 200) {
      code name type start end ongoing finished hasMatches
      website liveStreamURL address location { city country }
    }
  }
`;

async function gql(query, variables) {
  const res = await fetch(FTC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`FTCScout responded HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

const place = (e) =>
  cleanPlace(
    [e?.address, [e?.location?.city, e?.location?.country].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · "),
  );

const r2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : null);
const pts = (g) => (g ? { auto: r2(g.autoPoints), dc: r2(g.dcPoints), total: r2(g.totalPointsNp) } : null);
const q = (x) => (x ? { value: r2(x.value), rank: x.rank } : null);

const LEVEL = { Quals: "Q", Semis: "SF", Finals: "F", DoubleElim: "DE" };
const matchLabel = (m) => {
  const p = LEVEL[m.tournamentLevel] ?? m.tournamentLevel ?? "M";
  if (m.tournamentLevel === "Quals") return `Q${m.matchNum ?? m.id}`;
  return m.series ? `${p}${m.series}-${m.matchNum}` : `${p}${m.matchNum ?? m.id}`;
};

const alliance = (m, color) => {
  const side = (m.teams ?? []).filter((t) => t.alliance === color);
  const sc = m.scores?.[color.toLowerCase()];
  return {
    teams: side.map((t) => String(t.teamNumber)),
    noShow: side.filter((t) => t.noShow).map((t) => String(t.teamNumber)),
    score: sc?.totalPointsNp ?? null,
    total: sc?.totalPoints ?? null,
    auto: sc?.autoPoints ?? null,
    dc: sc?.dcPoints ?? null,
  };
};

/** Import one season for every regional team. Returns counts. */
export async function importSeason(season) {
  const { region } = config;
  const country = REGION_COUNTRY[region];
  const [teamData, eventData] = await Promise.all([
    gql(seasonQuery(season), { region }),
    gql(eventsQuery, { season, region }),
  ]);
  const teams = (teamData.teamsSearch ?? []).filter((t) => !country || t.location?.country === country);

  const seasonOps = [];
  const partOps = [];
  const matches = new Map();
  for (const t of teams) {
    const team = String(t.number);
    const qs = t.quickStats;
    if (qs) {
      seasonOps.push({
        updateOne: {
          filter: { team, season },
          update: { $set: { team, season, tot: q(qs.tot), auto: q(qs.auto), dc: q(qs.dc), eg: q(qs.eg), worldCount: qs.count } },
          upsert: true,
        },
      });
    }
    for (const p of t.events ?? []) {
      const st = p.stats ?? {};
      partOps.push({
        updateOne: {
          filter: { team, season, eventCode: p.eventCode },
          update: {
            $set: {
              team,
              season,
              eventCode: p.eventCode,
              eventName: p.event?.name ?? p.eventCode,
              eventType: p.event?.type ?? "",
              start: p.event?.start ?? null,
              end: p.event?.end ?? null,
              remote: Boolean(p.event?.remote),
              location: place(p.event),
              rank: st.rank ?? null,
              wins: st.wins ?? null,
              losses: st.losses ?? null,
              ties: st.ties ?? null,
              rp: r2(st.rp),
              qualMatchesPlayed: st.qualMatchesPlayed ?? null,
              opr: pts(st.opr),
              avg: pts(st.avg),
              max: st.max?.totalPointsNp ?? null,
              awards: (p.awards ?? []).map((a) => ({ type: a.type, placement: a.placement, personName: a.personName ?? null })),
            },
          },
          upsert: true,
        },
      });
    }
    for (const { match: m } of t.matches ?? []) {
      if (!m) continue;
      const key = `${m.eventCode}:${m.id}`;
      if (matches.has(key)) continue;
      const red = alliance(m, "Red");
      const blue = alliance(m, "Blue");
      matches.set(key, {
        season,
        eventCode: m.eventCode,
        eventName: m.event?.name ?? m.eventCode,
        matchId: m.id,
        label: matchLabel(m),
        level: m.tournamentLevel ?? "",
        series: m.series ?? null,
        matchNum: m.matchNum ?? null,
        played: Boolean(m.hasBeenPlayed),
        time: m.actualStartTime || m.scheduledStartTime || null,
        red,
        blue,
        teams: [...red.teams, ...blue.teams],
      });
    }
  }

  const matchOps = [...matches.values()].map((doc) => ({
    updateOne: { filter: { season, eventCode: doc.eventCode, matchId: doc.matchId }, update: { $set: doc }, upsert: true },
  }));

  // Regional events of that season (history for the Events page).
  const eventOps = (eventData.eventsSearch ?? []).map((e) => {
    const key = `ftc-${season}-${e.code}`;
    return {
      updateOne: {
        filter: { key },
        update: {
          $set: {
            key,
            season,
            name: e.name,
            kind: e.type,
            start: e.start || null,
            end: e.end || e.start || null,
            location: place(e),
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

  await Promise.all([
    seasonOps.length && TeamSeason.bulkWrite(seasonOps, { ordered: false }),
    partOps.length && Participation.bulkWrite(partOps, { ordered: false }),
    matchOps.length && FtcMatch.bulkWrite(matchOps, { ordered: false }),
    eventOps.length && Event.bulkWrite(eventOps, { ordered: false }),
  ]);
  return { teams: seasonOps.length, events: partOps.length, matches: matchOps.length, regionEvents: eventOps.length };
}

let running = null;
let lastRun = 0;
const MIN_GAP_MS = 10 * 60_000; // the regular sync runs every minute; history is heavier

/**
 * Import missing past seasons plus the two most recent ones. Concurrent calls
 * share a run; unless `force`/`full`, runs at most every 10 minutes.
 */
export function syncFtcHistory({ full = false, force = false } = {}) {
  if (!running && !full && !force && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve(null);
  running ??= doSync(full).finally(() => {
    running = null;
    lastRun = Date.now();
  });
  return running;
}

async function doSync(full) {
  const started = Date.now();
  const have = new Set(await TeamSeason.distinct("season"));
  const seasons = [];
  for (let s = FIRST_SEASON; s <= config.season; s++) {
    if (full || !have.has(s) || s >= config.season - 1) seasons.push(s);
  }
  const counts = { seasons: 0, teamSeasons: 0, participations: 0, matches: 0 };
  const errors = [];
  for (const s of seasons) {
    try {
      const c = await importSeason(s);
      counts.seasons += 1;
      counts.teamSeasons += c.teams;
      counts.participations += c.events;
      counts.matches += c.matches;
      console.log(`[sync] ftcscout ${s}: ${c.teams} team-seasons, ${c.events} event results, ${c.matches} matches`);
    } catch (err) {
      errors.push(`${s}: ${err.message}`);
      console.error(`[sync] ftcscout ${s} failed: ${err.message}`);
    }
  }
  return SyncLog.create({
    kind: "ftcscout",
    ok: errors.length === 0,
    message: errors.length
      ? `History import errors: ${errors.join("; ")}`
      : `History: seasons ${seasons[0]}–${seasons.at(-1)} imported`,
    counts,
    durationMs: Date.now() - started,
  });
}
