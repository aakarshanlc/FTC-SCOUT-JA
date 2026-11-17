import { Router } from "express";
import { Event, FtcMatch, Participation, Team, TeamSeason } from "../models/index.js";
import { HttpError, ah } from "../lib/util.js";

export const ftc = Router();

// FIRST's award hierarchy, so lists lead with Inspire and the alliances.
const AWARD_ORDER = ["Inspire", "Winner", "Finalist", "Think", "Connect", "Innovate", "Design", "Motivate", "Control", "Reach", "Sustain", "Promote", "Compass", "JudgesChoice", "TopRanked", "DeansListWinner", "DeansListFinalist", "DeansListSemiFinalist"];
const awardOrder = (t) => (AWARD_ORDER.includes(t) ? AWARD_ORDER.indexOf(t) : 99);

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
  const [seasons, parts] = await Promise.all([
    TeamSeason.find({ season }).lean(),
    Participation.find({ season }).lean(),
  ]);
  const names = await teamNames(seasons.map((s) => s.team));
  const byTeam = new Map();
  for (const p of parts) {
    const e = byTeam.get(p.team) ?? { events: 0, wins: 0, losses: 0, ties: 0, awards: 0, best: null };
    e.events += 1;
    e.wins += p.wins ?? 0;
    e.losses += p.losses ?? 0;
    e.ties += p.ties ?? 0;
    e.awards += p.awards?.length ?? 0;
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
    res.json({ seasons: out, awards });
  }),
);

ftc.get(
  "/teams/:number/matches",
  ah(async (req, res) => {
    const team = String(req.params.number);
    const filter = { teams: team };
    if (req.query.season) filter.season = seasonParam(req.query.season);
    const matches = await FtcMatch.find(filter).sort({ season: -1, time: 1, matchId: 1 }).lean();
    res.json(matches);
  }),
);

ftc.get(
  "/events/:season/:code",
  ah(async (req, res) => {
    const season = seasonParam(req.params.season);
    const code = String(req.params.code);
    const [event, parts, matches] = await Promise.all([
      Event.findOne({ key: `ftc-${season}-${code}` }).lean(),
      Participation.find({ season, eventCode: code }).lean(),
      FtcMatch.find({ season, eventCode: code }).sort({ time: 1, matchId: 1 }).lean(),
    ]);
    if (!event && !parts.length) throw new HttpError(404, `No data for ${code} (${season})`);
    const names = await teamNames([...parts.map((p) => p.team), ...matches.flatMap((m) => m.teams)]);
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
    const awards = parts
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
      location: event?.location ?? first?.location ?? "",
      website: event?.website ?? null,
      liveStream: event?.liveStream ?? null,
      url: event?.url ?? null,
      rankings,
      awards,
      matches,
      teamNames: Object.fromEntries([...names].map(([n, t]) => [n, t.name])),
    });
  }),
);
