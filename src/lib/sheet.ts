import Papa from "papaparse";

export type Row = Record<string, string>;

export interface TeamInfo {
  number: string;
  name: string;
  org: string;
}

export interface ChampRow {
  [key: string]: unknown;
  number: string;
  name: string;
  org: string;
  avg: number | null;
  best: number | null;
  played: number;
  rank: number | null;
}

export interface ScrimRow {
  [key: string]: unknown;
  number: string;
  name: string;
  org: string;
  drivetrain: string;
  auto: number | null;
  teleop: number | null;
  flower: number | null;
  avgTotal: number | null;
  best: number | null;
  played: number;
  rank: number | null;
}

export const SHEET_ID = "1PWdTIUPcPH_HxHqmH5rk8OSlTxkeGzbelaZv0GlFBwA";
export const SCRIMMAGE_TAB = "Scrimmages";
export const REFRESH_MS = 30_000;

/**
 * Fetch one tab of the scouting sheet as CSV and normalize it.
 * The sheet must be shared as "Anyone with the link" for the gviz endpoint to answer.*/

export async function loadTab(name: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Couldn't load tab "${name}" (${res.status}). Check the tab name and that the sheet is shared as "Anyone with the link".`,
    );
  }
  const csv = await res.text();
  return Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: true }).data
    .map(normalizeRow)
    .filter((r) => Object.values(r).some((v) => v !== ""));
}

export function normalizeRow(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const key in row) {
    const k = key.trim().toUpperCase();
    if (k) out[k] = String(row[key] ?? "").trim();
  }
  return out;
}

/**
 * Value of the first column whose header contains any of the given words.
 * Headers are normalized to upper case, so the keywords are compared upper-cased too.
 */

export function col(row: Row, ...words: string[]): string {
  for (const k in row)
    if (words.some((w) => k.includes(w.toUpperCase()))) return row[k];
  return "";
}

/** All rows whose "number" column matches the given team number. */
export const rowsFor = (rows: Row[], num: string): Row[] =>
  rows.filter((r) => col(r, "number") === String(num).trim());

// formatting

export const toNum = (v: unknown): number => {
  const x = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(x) ? 0 : x;
};

export const r1 = (x: number): number => Math.round(x * 10) / 10;

export const fmt = (v: unknown): unknown =>
  v === null || v === undefined || v === "" ? "–" : v;

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

export const titleCase = (s: string): string =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// aggregation 

export interface Agg {
  count: number;
  avg: number | null;
  best: number | null;
  vals: number[];
}

export function agg(rows: Row[], field: string): Agg {
  const vals = rows.map((r) => toNum(col(r, field)));
  if (!vals.length) return { count: 0, avg: null, best: null, vals };
  return {
    count: vals.length,
    avg: r1(vals.reduce((a, b) => a + b, 0) / vals.length),
    best: Math.max(...vals),
    vals,
  };
}

export function allTeams(sets: Row[][]): TeamInfo[] {
  const map = new Map<string, TeamInfo>();
  for (const rows of sets) {
    for (const r of rows) {
      const n = col(r, "number");
      if (!n) continue;
      const e = map.get(n) ?? { number: n, name: "", org: "" };
      if (!e.name) e.name = col(r, "name");
      if (!e.org) e.org = col(r, "organization", "org");
      map.set(n, e);
    }
  }
  return [...map.values()];
}

//Rank 1..n over the rows that have matches played, best score first.
function withRanks<T extends { played: number; rank: number | null }>(
  rows: T[],
  score: (r: T) => number | null,
): T[] {
  rows
    .filter((r) => r.played > 0 && score(r) !== null)
    .sort((a, b) => (score(b) as number) - (score(a) as number))
    .forEach((r, i) => {
      r.rank = i + 1;
    });
  return rows;
}

export function champRows(teams: Row[], matches: Row[], infos: TeamInfo[]): ChampRow[] {
  const nums = new Set([...teams, ...matches].map((r) => col(r, "number")).filter(Boolean));
  const info = new Map(infos.map((t) => [t.number, t]));
  const rows: ChampRow[] = [...nums].map((n) => {
    const s = agg(rowsFor(matches, n), "total");
    const i = info.get(n);
    return {
      number: n,
      name: i?.name ?? "",
      org: i?.org ?? "",
      avg: s.avg,
      best: s.best,
      played: s.count,
      rank: null,
    };
  });
  return withRanks(rows, (r) => r.avg);
}

export const scrimNames = (scrimmages: Row[]): string[] => [
  ...new Set(scrimmages.map((r) => col(r, "scrimmage")).filter(Boolean)),
];

export const scrimBase = (scrimmages: Row[], event: string): Row[] =>
  event ? scrimmages.filter((r) => col(r, "scrimmage") === event) : scrimmages;

// One row per team within the filtered scrimmage set, ranked by average total.
export function scrimRows(scrimmages: Row[], event: string): ScrimRow[] {
  const by = new Map<string, Row[]>();
  for (const r of scrimBase(scrimmages, event)) {
    const n = col(r, "number");
    if (!n) continue;
    if (!by.has(n)) by.set(n, []);
    by.get(n)!.push(r);
  }
  const rows: ScrimRow[] = [...by].map(([n, rs]) => {
    const t = agg(rs, "total");
    const a = agg(rs, "auto");
    const p = agg(rs, "teleop");
    const f = agg(rs, "flower");
    const last = rs[rs.length - 1];
    return {
      number: n,
      name: col(last, "name"),
      org: col(last, "organization", "org"),
      drivetrain: [...rs].reverse().map((r) => col(r, "drivetrain")).find(Boolean) ?? "",
      auto: a.avg,
      teleop: p.avg,
      flower: f.avg,
      avgTotal: t.avg,
      best: t.best,
      played: t.count,
      rank: null,
    };
  });
  return withRanks(rows, (r) => r.avgTotal);
}

// sorting 

export interface SortState {
  key: string;
  dir: 1 | -1;
}

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === "";

export function sortRows<T extends Record<string, unknown>>(rows: T[], { key, dir }: SortState): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (isEmpty(x) && isEmpty(y)) return 0;
    if (isEmpty(x)) return 1;
    if (isEmpty(y)) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
  });
}

// Next sort state after clicking a column header
export function nextSort(current: SortState, key: string): SortState {
  if (current.key === key) return { key, dir: current.dir === 1 ? -1 : 1 };
  const textKeys = ["name", "org", "drivetrain", "number", "rank"];
  return { key, dir: (textKeys.includes(key) ? 1 : -1) as 1 | -1 };
}

// olumn keys of a raw tab, hiding the team number column
export const rawColumns = (rows: Row[]): string[] => {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  const nk = keys.find((k) => k.includes("NUMBER"));
  return keys.filter((k) => k !== nk);
};
