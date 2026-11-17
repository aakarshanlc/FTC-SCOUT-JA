import { Match, Scrimmage, Team } from "../models/index.js";
import { stats } from "../lib/util.js";

/** Give rank 1..n to rows with a score, best first. Mutates and returns rows. */
function rank(rows, score) {
  rows
    .filter((r) => score(r) !== null)
    .sort((a, b) => score(b) - score(a))
    .forEach((r, i) => {
      r.rank = i + 1;
    });
  return rows;
}

const groupBy = (docs, key) => {
  const m = new Map();
  for (const d of docs) {
    const k = d[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  }
  return m;
};

/** Championship standings: one row per known team, ranked by average match total. */
export async function championshipRows() {
  const [teams, matches] = await Promise.all([Team.find().lean(), Match.find().lean()]);
  const byTeam = groupBy(matches, "team");
  const numbers = new Set([...teams.map((t) => t.number), ...byTeam.keys()]);
  const info = new Map(teams.map((t) => [t.number, t]));
  const rows = [...numbers].map((number) => {
    const ms = byTeam.get(number) ?? [];
    const total = stats(ms.map((m) => m.total));
    return {
      number,
      name: info.get(number)?.name ?? "",
      org: info.get(number)?.org ?? "",
      avg: total.avg,
      best: total.best,
      auto: stats(ms.map((m) => m.auto)).avg,
      teleop: stats(ms.map((m) => m.teleop)).avg,
      played: ms.length,
      rank: null,
    };
  });
  return rank(rows, (r) => r.avg);
}

/** Scrimmage standings, optionally for one scrimmage event. */
export async function scrimmageRows(event) {
  const filter = event ? { event } : {};
  const docs = await Scrimmage.find(filter).sort({ createdAt: 1 }).lean();
  const rows = [...groupBy(docs, "team")].map(([number, rs]) => {
    const last = rs[rs.length - 1];
    // Merge text observations across entries, most recent value wins.
    const observations = {};
    for (const r of rs) Object.assign(observations, r.observations ?? {});
    const total = stats(rs.map((r) => r.total));
    return {
      number,
      name: last.name,
      org: last.org,
      auto: stats(rs.map((r) => r.auto)).avg,
      teleop: stats(rs.map((r) => r.teleop)).avg,
      avgTotal: total.avg,
      best: total.best,
      played: rs.length,
      events: [...new Set(rs.map((r) => r.event))],
      observations,
      rank: null,
    };
  });
  return rank(rows, (r) => r.avgTotal);
}

export async function teamDetail(number) {
  const [team, matches, scrimmages, champ] = await Promise.all([
    Team.findOne({ number }).lean(),
    Match.find({ team: number }).sort({ createdAt: 1 }).lean(),
    Scrimmage.find({ team: number }).sort({ createdAt: 1 }).lean(),
    championshipRows(),
  ]);
  if (!team && !matches.length && !scrimmages.length) return null;
  const mine = champ.find((r) => r.number === number);
  const fallback = scrimmages[scrimmages.length - 1];
  return {
    number,
    name: team?.name || fallback?.name || "",
    org: team?.org || fallback?.org || "",
    robot: team?.robot ?? {},
    ftc: team?.ftc ?? null,
    first: team?.first ?? null,
    rank: mine?.rank ?? null,
    rankedOf: champ.filter((r) => r.rank !== null).length,
    matchStats: {
      total: stats(matches.map((m) => m.total)),
      auto: stats(matches.map((m) => m.auto)),
      teleop: stats(matches.map((m) => m.teleop)),
    },
    scrimStats: { total: stats(scrimmages.map((s) => s.total)) },
    matches,
    scrimmages,
  };
}
