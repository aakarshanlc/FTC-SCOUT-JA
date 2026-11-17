import { Event, Match, Scrimmage, SyncLog, Team } from "../models/index.js";
import { toNum, todayISO, slug } from "../lib/util.js";
import { col, colKey, loadTab, titleCase } from "./sheet.js";
import { syncFtcEvents, syncFtcTeams } from "./ftcscout.js";
import { syncFtcHistory } from "./ftcImport.js";
import { syncFirst } from "./firstImport.js";

// Mongo Map keys can't contain "." or start with "$".
const mapKey = (k) => titleCase(k).replace(/\./g, "").replace(/^\$/, "");

function parseSheetDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : todayISO(new Date(t));
}

function totalOf(r) {
  const total = toNum(col(r, "total"));
  if (total !== null) return total;
  const a = toNum(col(r, "auto"));
  const t = toNum(col(r, "teleop"));
  return a !== null && t !== null ? a + t : null;
}

let running = null;

/** Pull every sheet tab into MongoDB. Concurrent calls share the same run. */
export function syncSheet() {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync() {
  const started = Date.now();
  try {
    const [teams, robots, matches, scrims, events] = await Promise.all([
      loadTab("Teams", "number"),
      loadTab("Robot", "number"),
      loadTab("Matches", "total"),
      loadTab("Scrimmages", "scrimmage"),
      loadTab("Events", "date"),
    ]);

    // Teams: every tab that carries a team number contributes name/org.
    const info = new Map();
    for (const r of [...teams, ...scrims, ...matches, ...robots]) {
      const n = col(r, "number");
      if (!n) continue;
      const e = info.get(n) ?? { name: "", org: "" };
      e.name ||= col(r, "name");
      e.org ||= col(r, "organization", "org");
      info.set(n, e);
    }
    const robotBy = new Map();
    for (const r of robots) {
      const n = col(r, "number");
      if (!n) continue;
      const numKey = colKey(r, "number");
      const details = {};
      for (const [k, v] of Object.entries(r)) if (k !== numKey && v) details[mapKey(k)] = v;
      robotBy.set(n, details);
    }
    const teamOps = [...info].map(([number, e]) => {
      const $set = {};
      if (e.name) $set.name = e.name;
      if (e.org) $set.org = e.org;
      if (robotBy.has(number)) $set.robot = robotBy.get(number);
      return {
        updateOne: {
          filter: { number },
          update: { $set, $setOnInsert: { number } },
          upsert: true,
        },
      };
    });
    if (teamOps.length) await Team.bulkWrite(teamOps);

    // Matches + scrimmages: sheet rows are replaced wholesale; manual rows stay.
    const matchDocs = matches
      .filter((r) => col(r, "number"))
      .map((r) => ({
        team: col(r, "number"),
        label: col(r, "match"),
        auto: toNum(col(r, "auto")),
        teleop: toNum(col(r, "teleop")),
        total: totalOf(r),
        source: "sheet",
      }));
    await Match.deleteMany({ source: "sheet" });
    if (matchDocs.length) await Match.insertMany(matchDocs);

    const fixed = ["SCRIMMAGE", "NUMBER", "NAME", "ORGANIZATION"];
    const scrimDocs = scrims
      .filter((r) => col(r, "number") && col(r, "scrimmage"))
      .map((r) => {
        const observations = {};
        for (const [k, v] of Object.entries(r)) {
          if (fixed.some((f) => k.includes(f)) || !v) continue;
          if (toNum(v) === null) observations[mapKey(k)] = v;
        }
        return {
          event: col(r, "scrimmage"),
          team: col(r, "number"),
          name: col(r, "name"),
          org: col(r, "organization", "org"),
          auto: toNum(col(r, "auto")),
          teleop: toNum(col(r, "teleop")),
          total: totalOf(r),
          observations,
          source: "sheet",
        };
      });
    await Scrimmage.deleteMany({ source: "sheet" });
    if (scrimDocs.length) await Scrimmage.insertMany(scrimDocs);

    const eventDocs = [];
    for (const r of events) {
      const name = col(r, "name", "event");
      const start = parseSheetDate(col(r, "date"));
      if (!name || !start) continue;
      const endRaw = parseSheetDate(col(r, "end"));
      const end = endRaw && endRaw >= start ? endRaw : start;
      eventDocs.push({
        key: `sheet-${start}-${slug(name)}`,
        name,
        kind: col(r, "type", "kind") || "Event",
        start,
        end,
        location: col(r, "location", "place", "venue"),
        website: col(r, "link", "url", "website") || null,
        origin: "sheet",
        finished: end < todayISO(),
      });
    }
    await Event.deleteMany({ origin: "sheet" });
    if (eventDocs.length) await Event.insertMany(eventDocs);

    const counts = {
      teams: info.size,
      robots: robotBy.size,
      matches: matchDocs.length,
      scrimmages: scrimDocs.length,
      events: eventDocs.length,
    };
    const log = await SyncLog.create({
      kind: "sheet",
      ok: true,
      message: "Sheet synced",
      counts,
      durationMs: Date.now() - started,
    });
    console.log(`[sync] sheet ok in ${log.durationMs}ms`, counts);
    return log;
  } catch (err) {
    const log = await SyncLog.create({
      kind: "sheet",
      ok: false,
      message: err.message,
      durationMs: Date.now() - started,
    });
    console.error(`[sync] sheet failed: ${err.message}`);
    return log;
  }
}

/** Sheet + FTCScout in one go (used on startup and on the interval). */
export async function syncAll({ full = false, force = false } = {}) {
  // Sheet first so its names/schools are in place before FTCScout fills gaps.
  const [sheet, ftc] = await Promise.all([syncSheet(), syncFtcEvents()]);
  const ftcTeams = await syncFtcTeams();
  const history = await syncFtcHistory({ full, force });
  // FIRST's official data last: it only fills gaps (robot names, sponsors) on teams.
  const first = await syncFirst({ full, force });
  return { sheet, ftc, ftcTeams, history, first };
}
