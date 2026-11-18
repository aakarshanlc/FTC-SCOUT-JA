import { Router } from "express";
import { Event, FirstEvent, FtcMatch, Participation, Team, TeamSeason } from "../models/index.js";
import { HttpError, ah, cleanPlace } from "../lib/util.js";
import { withClips } from "./clips.js";

export const ftc = Router();

// FIRST's award hierarchy, so lists lead with Inspire and the alliances.
const AWARD_ORDER = ["Inspire", "Winner", "Finalist", "Think", "Connect", "Innovate", "Design", "Motivate", "Control", "Reach", "Sustain", "Promote", "Compass", "JudgesChoice", "TopRanked", "DeansListWinner", "DeansListFinalist", "DeansListSemiFinalist"];
const awardOrder = (t) => (AWARD_ORDER.includes(t) ? AWARD_ORDER.indexOf(t) : 99);

// FIRST names awards in prose ("Inspire Award 2nd Place"); map to a coarse type for styling.
const firstType = (name = "") =>
  /inspire/i.test(name) ? "Inspire"
  : /winning alliance/i.test(name) ? "Winner"
  : /finalist alliance/i.test(name) ? "Finalist"
  : /dean/i.test(name) ? "DeansList"
  : "Other";
const firstAward = (a) => ({
  type: firstType(a.name),
  label: a.name,
  placement: a.series,
  personName: a.person ?? null,
  number: a.team ?? undefined,
  school: a.school ?? null,
});

/** A team's playoff alliance at an event: seed and role. */
function allianceOf(fe, team) {
  for (const a of fe?.alliances ?? []) {
    if (a.captain?.team === team) return { seed: a.number, role: "Captain" };
    const i = (a.picks ?? []).findIndex((p) => p.team === team);
    if (i >= 0) return { seed: a.number, role: `Pick ${i + 1}` };
    if (a.backup?.team === team) return { seed: a.number, role: "Backup" };
  }
  return null;
}

const seasonParam = (v) => {
  const s = Number.parseInt(String(v ?? ""), 10);
  if (Number.isNaN(s) || s < 2000 || s > 2100) throw new HttpError(400, "Invalid season");
  return s;
};

async function teamNames(numbers) {
  const teams = await Team.find({ number: { $in: [...new Set(numbers)] } }, { number: 1, name: 1, org: 1 }).lean();
  return new Map(teams.map((t) => [t.number, t]));
}

/** Seasons that have FTCScout data, newest first. */
export async function ftcSeasons() {
  const rows = await TeamSeason.aggregate([
    { $group: { _id: "$season", teams: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);
  const matchCounts = new Map(
    (await FtcMatch.aggregate([{ $group: { _id: "$season", n: { $sum: 1 } } }])).map((r) => [r._id, r.n]),
  );
  return rows.map((r) => ({ season: r._id, teams: r.teams, matches: matchCounts.get(r._id) ?? 0 }));
}

/** Region leaderboard for a season from FTCScout OPR + event records. */
export async function ftcRankings(season) {
  const [seasons, parts, firstEvents] = await Promise.all([
    TeamSeason.find({ season }).lean(),
    Participation.find({ season }).lean(),
    FirstEvent.find({ season, "awards.0": { $exists: true } }, { code: 1, awards: 1 }).lean(),
  ]);
  const names = await teamNames(seasons.map((s) => s.team));
  // FIRST's official award list wins over FTCScout's (which can be missing,
  // e.g. no 2025–26 awards) — same rule as the team and event pages.
  const firstAwards = new Map(firstEvents.map((f) => [f.code, f.awards]));
  const byTeam = new Map();
  for (const p of parts) {
    const e = byTeam.get(p.team) ?? { events: 0, wins: 0, losses: 0, ties: 0, awards: 0, best: null };
    e.events += 1;
    e.wins += p.wins ?? 0;
    e.losses += p.losses ?? 0;
    e.ties += p.ties ?? 0;
    const official = firstAwards.get(p.eventCode);
    e.awards += official ? official.filter((a) => a.team === p.team).length : (p.awards?.length ?? 0);
    if (p.max !== null && p.max !== undefined) e.best = Math.max(e.best ?? 0, p.max);
    byTeam.set(p.team, e);
  }
  const rows = seasons
    .filter((s) => s.tot?.value !== null && s.tot?.value !== undefined)
    .map((s) => {
      const e = byTeam.get(s.team) ?? {};
      return {
        number: s.team,
        name: names.get(s.team)?.name ?? "",
        org: names.get(s.team)?.org ?? "",
        opr: s.tot?.value ?? null,
        auto: s.auto?.value ?? null,
        dc: s.dc?.value ?? null,
        eg: s.eg?.value ?? null,
        worldRank: s.tot?.rank ?? null,
        worldCount: s.worldCount ?? null,
        events: e.events ?? 0,
        wins: e.wins ?? 0,
        losses: e.losses ?? 0,
        ties: e.ties ?? 0,
        best: e.best ?? null,
        awards: e.awards ?? 0,
        rank: null,
      };
    })
    .sort((a, b) => b.opr - a.opr);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

ftc.get(
  "/seasons",
  ah(async (_req, res) => {
    res.json(await ftcSeasons());
  }),
);

ftc.get(
  "/rankings",
  ah(async (req, res) => {
    const seasons = await ftcSeasons();
    const season = req.query.season ? seasonParam(req.query.season) : seasons[0]?.season;
    if (!season) return res.json({ season: null, seasons, rows: [] });
    res.json({ season, seasons, rows: await ftcRankings(season) });
  }),
);

ftc.get(
  "/teams/:number",
  ah(async (req, res) => {
    const team = String(req.params.number);
    const [seasons, parts, regional] = await Promise.all([
      TeamSeason.find({ team }).sort({ season: -1 }).lean(),
      Participation.find({ team }).sort({ season: -1, start: -1 }).lean(),
      Promise.all(
        (await TeamSeason.distinct("season", { team })).map(async (s) => [s, (await ftcRankings(s)).find((r) => r.number === team)?.rank ?? null]),
      ),
    ]);
    const firstEvents = await FirstEvent.find({ $or: [{ "teams.team": team }, { "awards.team": team }] }).lean();
    const firstBy = new Map(firstEvents.map((f) => [`${f.season}:${f.code}`, f]));
    for (const p of parts) {
      const fe = firstBy.get(`${p.season}:${p.eventCode}`);
      if (!fe) continue;
      // FIRST's award list is the official, complete one — prefer it.
      if (fe.awards?.length) p.awards = fe.awards.filter((a) => a.team === team).map(firstAward);
      p.alliance = allianceOf(fe, team);
      const adv = fe.advancement?.teams?.find((t) => t.team === team);
      p.advanced = adv ? { criteria: adv.criteria, to: fe.advancement.advancesTo, declined: adv.declined } : null;
    }
    const regionRank = new Map(regional);
    const regionSize = new Map(
      (await TeamSeason.aggregate([{ $match: { "tot.value": { $ne: null } } }, { $group: { _id: "$season", n: { $sum: 1 } } }])).map((r) => [r._id, r.n]),
    );
    const out = seasons.map((s) => ({
      season: s.season,
      opr: s.tot ?? null,
      auto: s.auto ?? null,
      dc: s.dc ?? null,
      eg: s.eg ?? null,
      worldCount: s.worldCount ?? null,
      regionRank: regionRank.get(s.season) ?? null,
      regionCount: regionSize.get(s.season) ?? null,
      events: parts.filter((p) => p.season === s.season),
    }));
    // Seasons with events but no quick stats (rare) still get listed.
    for (const p of parts) {
      if (!out.some((o) => o.season === p.season)) {
        out.push({ season: p.season, opr: null, auto: null, dc: null, eg: null, worldCount: null, regionRank: null, regionCount: null, events: parts.filter((x) => x.season === p.season) });
      }
    }
    out.sort((a, b) => b.season - a.season);
    const awards = parts
      .flatMap((p) => (p.awards ?? []).map((a) => ({ ...a, season: p.season, eventCode: p.eventCode, eventName: p.eventName })))
      .sort((a, b) => b.season - a.season || awardOrder(a.type) - awardOrder(b.type) || a.placement - b.placement);
    const latest = firstEvents.flatMap((f) => (f.teams ?? []).filter((t) => t.team === team).map((t) => ({ ...t, season: f.season }))).sort((a, b) => b.season - a.season)[0];
    // Events the team registered for with FIRST, flagged when no results exist
    // (e.g. registered but didn't compete, or results never published).
    const registrations = firstEvents
      .filter((f) => (f.teams ?? []).some((t) => t.team === team))
      .map((f) => ({
        season: f.season,
        code: f.code,
        name: f.name,
        start: f.start ?? null,
        competed: parts.some((p) => p.season === f.season && p.eventCode === f.code),
      }))
      .sort((a, b) => b.season - a.season);
    res.json({ seasons: out, awards, sponsors: latest?.sponsors ?? null, registrations });
  }),
);

ftc.get(
  "/teams/:number/matches",
  ah(async (req, res) => {
    const team = String(req.params.number);
    const filter = { teams: team };
    if (req.query.season) filter.season = seasonParam(req.query.season);
    const matches = await FtcMatch.find(filter).sort({ season: -1, time: 1, matchId: 1 }).lean();
    res.json(await withClips(matches));
  }),
);

ftc.get(
  "/events/:season/:code",
  ah(async (req, res) => {
    const season = seasonParam(req.params.season);
    const code = String(req.params.code);
    const [event, parts, matches, fe] = await Promise.all([
      Event.findOne({ key: `ftc-${season}-${code}` }).lean(),
      Participation.find({ season, eventCode: code }).lean(),
      FtcMatch.find({ season, eventCode: code }).sort({ time: 1, matchId: 1 }).lean(),
      FirstEvent.findOne({ season, code }).lean(),
    ]);
    if (!event && !parts.length && !fe) throw new HttpError(404, `No data for ${code} (${season})`);
    const names = await teamNames([
      ...parts.map((p) => p.team),
      ...matches.flatMap((m) => m.teams),
      ...(fe?.teams ?? []).map((t) => t.team),
    ]);
    // Visiting teams aren't in our Team collection; use FIRST's registration name.
    for (const t of fe?.teams ?? []) if (!names.has(t.team)) names.set(t.team, { number: t.team, name: t.name });
    const named = (n) => ({ number: n, name: names.get(n)?.name ?? "" });
    const rankings = parts
      .map((p) => ({
        ...named(p.team),
        rank: p.rank,
        wins: p.wins,
        losses: p.losses,
        ties: p.ties,
        rp: p.rp,
        played: p.qualMatchesPlayed,
        opr: p.opr?.total ?? null,
        oprAuto: p.opr?.auto ?? null,
        oprDc: p.opr?.dc ?? null,
        avg: p.avg?.total ?? null,
        max: p.max,
      }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    const awards = fe?.awards?.length
      ? fe.awards.map((a) => ({ ...firstAward(a), name: a.team ? names.get(a.team)?.name ?? "" : undefined }))
      : parts
      .flatMap((p) => (p.awards ?? []).map((a) => ({ ...a, ...named(p.team) })))
      .sort((a, b) => awardOrder(a.type) - awardOrder(b.type) || a.placement - b.placement);
    const first = parts[0];
    res.json({
      season,
      code,
      name: event?.name ?? first?.eventName ?? code,
      kind: event?.kind ?? first?.eventType ?? "",
      start: event?.start ?? first?.start ?? null,
      end: event?.end ?? first?.end ?? null,
      location: cleanPlace(event?.location ?? first?.location ?? ""),
      website: event?.website ?? null,
      liveStream: event?.liveStream ?? null,
      url: event?.url ?? null,
      rankings,
      awards,
      matches: await withClips(matches),
      venue: fe?.venue || null,
      address: fe ? cleanPlace([fe.address, fe.city, fe.country].filter(Boolean).join(", ")) : null,
      coordinates: fe?.coordinates?.length === 2 ? { lng: fe.coordinates[0], lat: fe.coordinates[1] } : null,
      fieldCount: fe?.fieldCount ?? null,
      volunteerUrl: fe?.volunteerUrl ?? null,
      alliances: (fe?.alliances ?? []).map((a) => ({
        ...a,
        result: a.captain && awards.some((w) => w.type === "Winner" && w.number === a.captain.team)
          ? "Winner"
          : a.captain && awards.some((w) => w.type === "Finalist" && w.number === a.captain.team)
            ? "Finalist"
            : null,
      })),
      advancement: fe?.advancement?.teams?.length
        ? { ...fe.advancement, teams: fe.advancement.teams.map((t) => ({ ...t, name: names.get(t.team)?.name ?? "" })) }
        : null,
      registered: (fe?.teams ?? []).map((t) => ({ number: t.team, name: t.name, city: t.city, robotName: t.robotName, played: parts.some((p) => p.team === t.team) })),
      teamNames: Object.fromEntries([...names].map(([n, t]) => [n, t.name])),
    });
  }),
);
