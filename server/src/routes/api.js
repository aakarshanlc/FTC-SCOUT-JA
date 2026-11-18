import { Router } from "express";
import mongoose from "mongoose";
import { Event, Match, Scrimmage, SyncLog, Team } from "../models/index.js";
import { HttpError, ah, slug, toNum } from "../lib/util.js";
import { championshipRows, scrimmageRows, teamDetail } from "../services/stats.js";
import { allEvents, splitUpcoming } from "../services/calendar.js";
import { eventMatches } from "../services/ftcscout.js";
import { syncAll } from "../services/sync.js";
import { dbState } from "../db.js";
import { config } from "../config.js";
import { requireUser, stamp } from "../services/auth.js";
import { FtcMatch, Participation } from "../models/index.js";
import { ftcRankings, ftcSeasons } from "./ftc.js";

export const api = Router();

const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : toNum(v));
const teamNumber = (v) => {
  const n = str(v, 10);
  if (!/^\d{1,6}$/.test(n)) throw new HttpError(400, "Team number must be 1–6 digits");
  return n;
};
const objectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  return id;
};
const matchesQuery = (q) => {
  const s = q.toLowerCase();
  return (r) =>
    r.number.includes(s) || r.name.toLowerCase().includes(s) || r.org.toLowerCase().includes(s);
};

api.get(
  "/health",
  ah(async (_req, res) => {
    res.json({ ok: dbState() === "connected", db: dbState(), season: config.season, region: config.region });
  }),
);

// Dashboard summary for the home page
api.get(
  "/overview",
  ah(async (_req, res) => {
    const [champ, scrims, events, lastSheet, lastFtc] = await Promise.all([
      championshipRows(),
      scrimmageRows(),
      allEvents(),
      SyncLog.findOne({ kind: "sheet" }).sort({ createdAt: -1 }).lean(),
      SyncLog.findOne({ kind: "ftcscout" }).sort({ createdAt: -1 }).lean(),
    ]);
    const { upcoming, past } = splitUpcoming(events);
    const ranked = champ.filter((r) => r.rank !== null).sort((a, b) => a.rank - b.rank);
    const [matchCount, scrimCount, seasons] = await Promise.all([
      Match.countDocuments(),
      Scrimmage.countDocuments(),
      ftcSeasons(),
    ]);
    const ftcSeason = seasons[0]?.season ?? null;
    const [ftcTop, allTeams, ftcMatches, activeTeams, ftcEvents] = await Promise.all([
      ftcSeason ? ftcRankings(ftcSeason).then((r) => r.slice(0, 5)) : [],
      Team.countDocuments(),
      ftcSeason ? FtcMatch.countDocuments({ season: ftcSeason, played: { $ne: false } }) : 0,
      ftcSeason ? Participation.distinct("team", { season: ftcSeason }).then((t) => t.length) : 0,
      ftcSeason ? Participation.distinct("eventCode", { season: ftcSeason }).then((e) => e.length) : 0,
    ]);
    res.json({
      counts: {
        teams: champ.length,
        rankedTeams: ranked.length,
        matches: matchCount,
        scrimmageEntries: scrimCount,
        scrimmages: new Set(scrims.flatMap((s) => s.events)).size,
        upcomingEvents: upcoming.length,
        pastEvents: past.length,
        allTeams,
        ftcMatches,
        activeTeams,
        ftcEvents,
      },
      topTeams: ranked.slice(0, 5),
      ftc: { season: ftcSeason, top: ftcTop, seasons },
      nextEvents: upcoming.slice(0, 3),
      recentScrimmageTeams: scrims.slice(0, 8),
      sync: { sheet: lastSheet, ftcscout: lastFtc },
      season: config.season,
      region: config.region,
    });
  }),
);

// Teams
api.get(
  "/teams",
  ah(async (req, res) => {
    const q = str(req.query.q);
    const rows = await championshipRows();
    res.json(q ? rows.filter(matchesQuery(q)) : rows);
  }),
);

api.post(
  "/teams",
  requireUser,
  ah(async (req, res) => {
    const number = teamNumber(req.body.number);
    if (await Team.exists({ number })) throw new HttpError(409, `Team ${number} already exists`);
    const team = await Team.create({ number, name: str(req.body.name), org: str(req.body.org) });
    res.status(201).json(team);
  }),
);

api.get(
  "/teams/:number",
  ah(async (req, res) => {
    const detail = await teamDetail(teamNumber(req.params.number));
    if (!detail) throw new HttpError(404, `No data for team ${req.params.number}`);
    res.json(detail);
  }),
);

api.get(
  "/search",
  ah(async (req, res) => {
    const q = str(req.query.q);
    if (!q) return res.json([]);
    const rows = await championshipRows();
    const scrims = await scrimmageRows();
    const seen = new Map(rows.map((r) => [r.number, r]));
    for (const s of scrims) if (!seen.has(s.number)) seen.set(s.number, { ...s, avg: null });
    const hits = [...seen.values()]
      .filter(matchesQuery(q))
      .sort((a, b) => (a.number.startsWith(q) ? -1 : 0) - (b.number.startsWith(q) ? -1 : 0))
      .slice(0, 8)
      .map(({ number, name, org, rank }) => ({ number, name, org, rank }));
    res.json(hits);
  }),
);

// Matches (championship scouting entries)
api.get(
  "/matches",
  ah(async (req, res) => {
    const filter = req.query.team ? { team: teamNumber(req.query.team) } : {};
    res.json(await Match.find(filter).sort({ createdAt: -1 }).limit(500).lean());
  }),
);

api.post(
  "/matches",
  requireUser,
  ah(async (req, res) => {
    const team = teamNumber(req.body.team);
    const auto = numOrNull(req.body.auto);
    const teleop = numOrNull(req.body.teleop);
    let total = numOrNull(req.body.total);
    if (total === null && auto !== null && teleop !== null) total = auto + teleop;
    if (total === null) throw new HttpError(400, "Enter a total, or both auto and teleop");
    await Team.updateOne({ number: team }, { $setOnInsert: { number: team } }, { upsert: true });
    const doc = await Match.create({
      team,
      label: str(req.body.label, 40),
      auto,
      teleop,
      total,
      notes: str(req.body.notes, 1000),
      source: "manual",
      createdBy: stamp(req.user),
    });
    res.status(201).json(doc);
  }),
);

api.delete(
  "/matches/:id",
  requireUser,
  ah(async (req, res) => {
    const doc = await Match.findById(objectId(req.params.id));
    if (!doc) throw new HttpError(404, "Match not found");
    if (doc.source !== "manual")
      throw new HttpError(403, "This entry came from the Google Sheet. Edit it there.");
    await doc.deleteOne();
    res.status(204).end();
  }),
);

// Scrimmages
api.get(
  "/scrimmages",
  ah(async (req, res) => {
    const event = str(req.query.event);
    const [rows, names] = await Promise.all([scrimmageRows(event), Scrimmage.distinct("event")]);
    res.json({ events: names.sort(), event: event || null, rows });
  }),
);

api.post(
  "/scrimmages",
  requireUser,
  ah(async (req, res) => {
    const event = str(req.body.event, 120);
    if (!event) throw new HttpError(400, "Scrimmage name is required");
    const team = teamNumber(req.body.team);
    const auto = numOrNull(req.body.auto);
    const teleop = numOrNull(req.body.teleop);
    let total = numOrNull(req.body.total);
    if (total === null && auto !== null && teleop !== null) total = auto + teleop;
    const known = await Team.findOne({ number: team }).lean();
    const observations = {};
    if (str(req.body.notes)) observations.Notes = str(req.body.notes, 1000);
    const doc = await Scrimmage.create({
      event,
      team,
      name: str(req.body.name) || known?.name || "",
      org: str(req.body.org) || known?.org || "",
      auto,
      teleop,
      total,
      observations,
      source: "manual",
      createdBy: stamp(req.user),
    });
    res.status(201).json(doc);
  }),
);

api.delete(
  "/scrimmages/:id",
  requireUser,
  ah(async (req, res) => {
    const doc = await Scrimmage.findById(objectId(req.params.id));
    if (!doc) throw new HttpError(404, "Entry not found");
    if (doc.source !== "manual")
      throw new HttpError(403, "This entry came from the Google Sheet. Edit it there.");
    await doc.deleteOne();
    res.status(204).end();
  }),
);

// Events
api.get(
  "/events",
  ah(async (_req, res) => {
    res.json(splitUpcoming(await allEvents()));
  }),
);

api.post(
  "/events",
  requireUser,
  ah(async (req, res) => {
    const name = str(req.body.name, 120);
    const start = str(req.body.start, 10);
    if (!name) throw new HttpError(400, "Event name is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new HttpError(400, "Start date must be YYYY-MM-DD");
    const endRaw = str(req.body.end, 10);
    const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) && endRaw >= start ? endRaw : start;
    const doc = await Event.create({
      key: `manual-${start}-${slug(name)}-${Date.now().toString(36)}`,
      name,
      kind: str(req.body.kind, 40) || "Event",
      start,
      end,
      location: str(req.body.location),
      website: str(req.body.website, 500) || null,
      origin: "manual",
      createdBy: stamp(req.user),
    });
    res.status(201).json(doc);
  }),
);

api.delete(
  "/events/:id",
  requireUser,
  ah(async (req, res) => {
    const doc = await Event.findById(objectId(req.params.id));
    if (!doc) throw new HttpError(404, "Event not found");
    if (doc.origin !== "manual") throw new HttpError(403, "Only events added in the app can be deleted");
    await doc.deleteOne();
    res.status(204).end();
  }),
);

api.get(
  "/events/:code/matches",
  ah(async (req, res) => {
    const code = str(req.params.code, 20);
    if (!/^[A-Za-z0-9]+$/.test(code)) throw new HttpError(400, "Invalid event code");
    try {
      res.json(await eventMatches(code));
    } catch (err) {
      throw new HttpError(502, `FTCScout: ${err.message}`);
    }
  }),
);

// Sync
api.get(
  "/sync",
  ah(async (_req, res) => {
    res.json(await SyncLog.find().sort({ createdAt: -1 }).limit(20).lean());
  }),
);

api.post(
  "/sync",
  requireUser,
  ah(async (req, res) => {
    res.json(await syncAll({ full: req.query.full === "1", force: true }));
  }),
);
