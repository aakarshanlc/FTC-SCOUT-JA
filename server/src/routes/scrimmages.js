// Scrimmages: one list combining every source, plus a detail view per
// scrimmage with the teams who attended, any matches, and headline numbers.
//
// Sources, merged by name:
//   • scouting reports (sheet "Scrimmages" tab + app entries)  → teams, pit notes, scores
//   • calendar events of kind "Scrimmage" (FTCScout, sheet, app) → date, venue
//   • FTCScout participations at scrimmage events               → rank, record, OPR, matches

import { Router } from "express";
import { Event, FirstEvent, FtcMatch, Participation, Scrimmage, Team } from "../models/index.js";
import { HttpError, ah, cleanPlace, slug, stats, todayISO } from "../lib/util.js";
import { withClips } from "./clips.js";

export const scrimmages = Router();

const NA = /^(n\/?a|none|-|–|)$/i;
const statusOf = (start, end, reports, today = todayISO()) => {
  if (!start) return "undated"; // e.g. sheet scrimmages without an Events-tab date
  if ((end ?? start) < today) return "past";
  if (start > today) return "upcoming";
  return "live";
};

/** Every scrimmage we know about, newest first. */
export async function listScrimmages() {
  const [reportGroups, events, parts] = await Promise.all([
    Scrimmage.aggregate([
      {
        $group: {
          _id: "$event",
          reports: { $sum: 1 },
          teams: { $addToSet: "$team" },
          scored: { $sum: { $cond: [{ $ne: ["$total", null] }, 1, 0] } },
        },
      },
    ]),
    Event.find({ kind: /scrimmage/i }).lean(),
    Participation.aggregate([
      { $match: { eventType: /scrimmage/i } },
      {
        $group: {
          _id: { season: "$season", code: "$eventCode" },
          name: { $first: "$eventName" },
          start: { $first: "$start" },
          end: { $first: "$end" },
          location: { $first: "$location" },
          teams: { $addToSet: "$team" },
        },
      },
    ]),
  ]);

  const byKey = new Map(); // keyed by lower-cased name so sources merge
  const upsert = (name, patch) => {
    const k = name.trim().toLowerCase();
    const cur = byKey.get(k) ?? { name: name.trim(), teams: new Set(), reports: 0, scored: 0, sources: new Set() };
    for (const [key, v] of Object.entries(patch)) {
      if (key === "teams") v.forEach((t) => cur.teams.add(t));
      else if (key === "source") cur.sources.add(v);
      else if (key === "reports" || key === "scored") cur[key] += v;
      else if (v !== null && v !== undefined && v !== "" && cur[key] == null) cur[key] = v;
    }
    byKey.set(k, cur);
  };

  for (const g of reportGroups) upsert(g._id, { teams: g.teams, reports: g.reports, scored: g.scored, source: "scouting" });
  for (const e of events) {
    upsert(e.name, {
      start: e.start,
      end: e.end,
      location: e.location,
      season: e.season ?? null,
      code: e.code ?? null,
      url: e.url ?? null,
      source: e.origin,
    });
  }
  for (const p of parts) {
    upsert(p.name ?? p._id.code, {
      start: p.start,
      end: p.end,
      location: p.location,
      season: p._id.season,
      code: p._id.code,
      teams: p.teams,
      source: "ftcscout",
    });
  }

  const matchCounts = new Map(
    (
      await FtcMatch.aggregate([
        { $match: { $or: [...byKey.values()].filter((s) => s.code).map((s) => ({ season: s.season, eventCode: s.code })) } },
        { $group: { _id: { season: "$season", code: "$eventCode" }, n: { $sum: 1 } } },
      ]).catch(() => [])
    ).map((r) => [`${r._id.season}:${r._id.code}`, r.n]),
  );

  const today = todayISO();
  // Scrimmages held outside Jamaica appear only because a Jamaican team went;
  // flag them and name who went, so they aren't mistaken for local events.
  const names = new Map(
    (await Team.find({ number: { $in: [...new Set([...byKey.values()].flatMap((s) => [...s.teams]))] } }, { number: 1, name: 1 }).lean()).map((t) => [t.number, t.name]),
  );
  return [...byKey.values()]
    .map((s) => ({
      abroad: Boolean(s.location) && !/jamaica/i.test(s.location),
      attendees: Boolean(s.location) && !/jamaica/i.test(s.location) ? [...s.teams].map((n) => `${n} ${names.get(n) ?? ""}`.trim()) : [],
      id: s.code ? `ftc-${s.season}-${s.code}` : `s-${slug(s.name)}`,
      name: s.name,
      start: s.start ?? null,
      end: s.end ?? s.start ?? null,
      location: cleanPlace(s.location),
      season: s.season ?? null,
      code: s.code ?? null,
      url: s.url ?? null,
      teams: s.teams.size,
      reports: s.reports,
      scored: s.scored,
      matches: s.code ? (matchCounts.get(`${s.season}:${s.code}`) ?? 0) : 0,
      sources: [...s.sources],
      status: statusOf(s.start, s.end, s.reports, today),
    }))
    .sort((a, b) => (b.start ?? "9999").localeCompare(a.start ?? "9999") || a.name.localeCompare(b.name));
}

scrimmages.get(
  "/",
  ah(async (_req, res) => {
    res.json(await listScrimmages());
  }),
);

scrimmages.get(
  "/:id",
  ah(async (req, res) => {
    const list = await listScrimmages();
    const s = list.find((x) => x.id === req.params.id);
    if (!s) throw new HttpError(404, "Scrimmage not found");

    const [reports, parts, matches, fe] = await Promise.all([
      Scrimmage.find({ event: new RegExp(`^${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean(),
      s.code ? Participation.find({ season: s.season, eventCode: s.code }).lean() : [],
      s.code ? FtcMatch.find({ season: s.season, eventCode: s.code }).sort({ time: 1, matchId: 1 }).lean() : [],
      s.code ? FirstEvent.findOne({ season: s.season, code: s.code }).lean() : null,
    ]);

    // Teams: everyone with a report, a result, a match, or a registration.
    const numbers = new Set([
      ...reports.map((r) => r.team),
      ...parts.map((p) => p.team),
      ...matches.flatMap((m) => m.teams),
      ...(fe?.teams ?? []).map((t) => t.team),
    ]);
    const info = new Map((await Team.find({ number: { $in: [...numbers] } }, { number: 1, name: 1, org: 1 }).lean()).map((t) => [t.number, t]));
    const teams = [...numbers].map((number) => {
      const rs = reports.filter((r) => r.team === number);
      const p = parts.find((x) => x.team === number);
      const observations = {};
      for (const r of rs) Object.assign(observations, r.observations ?? {});
      const last = rs.at(-1);
      return {
        number,
        name: info.get(number)?.name || last?.name || "",
        org: info.get(number)?.org || last?.org || "",
        reports: rs.length,
        observations,
        auto: stats(rs.map((r) => r.auto)).avg,
        teleop: stats(rs.map((r) => r.teleop)).avg,
        avgTotal: stats(rs.map((r) => r.total)).avg,
        rank: p?.rank ?? null,
        wins: p?.wins ?? null,
        losses: p?.losses ?? null,
        ties: p?.ties ?? null,
        opr: p?.opr?.total ?? null,
        max: p?.max ?? null,
      };
    });
    teams.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (b.avgTotal ?? -1) - (a.avgTotal ?? -1) || Number(a.number) - Number(b.number));

    // Capability breakdown from pit notes: { "Teleop": { "Intake": 5, … } }
    const capabilities = {};
    let notRecorded = 0;
    for (const t of teams) {
      for (const [k, v] of Object.entries(t.observations)) {
        if (NA.test(String(v).trim())) {
          notRecorded += 1;
          continue;
        }
        capabilities[k] ??= {};
        capabilities[k][v] = (capabilities[k][v] ?? 0) + 1;
      }
    }

    const played = matches.filter((m) => m.played);
    const alliance = played.flatMap((m) => [
      { score: m.red.score, label: m.label, teams: m.red.teams },
      { score: m.blue.score, label: m.label, teams: m.blue.teams },
    ]).filter((a) => typeof a.score === "number");
    const high = alliance.reduce((best, a) => (!best || a.score > best.score ? a : best), null);
    const scoutedTotals = teams.map((t) => t.avgTotal).filter((x) => x !== null);
    const topOpr = teams.filter((t) => t.opr !== null).sort((a, b) => b.opr - a.opr)[0] ?? null;
    const topScouted = teams.filter((t) => t.avgTotal !== null).sort((a, b) => b.avgTotal - a.avgTotal)[0] ?? null;
    const schools = new Set(teams.map((t) => t.org).filter(Boolean));

    res.json({
      ...s,
      teams,
      matches: await withClips(matches),
      benchmarks: {
        teams: teams.length,
        schools: schools.size,
        reports: reports.length,
        matches: matches.length,
        played: played.length,
        highScore: high ? { score: high.score, match: high.label, teams: high.teams } : null,
        avgAllianceScore: alliance.length ? Math.round((alliance.reduce((a, x) => a + x.score, 0) / alliance.length) * 10) / 10 : null,
        avgScouted: scoutedTotals.length ? Math.round((scoutedTotals.reduce((a, b) => a + b, 0) / scoutedTotals.length) * 10) / 10 : null,
        topOpr: topOpr ? { number: topOpr.number, name: topOpr.name, opr: topOpr.opr } : null,
        topScouted: topScouted ? { number: topScouted.number, name: topScouted.name, avgTotal: topScouted.avgTotal } : null,
        capabilities,
        notRecorded,
      },
    });
  }),
);
