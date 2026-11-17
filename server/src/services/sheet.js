import Papa from "papaparse";
import { config } from "../config.js";

/**
 * Fetch one tab of the scouting sheet as CSV. Headers are upper-cased and trimmed.
 * gviz falls back to the FIRST tab when a name doesn't exist, so callers pass
 * `expect` (a header keyword) to detect that and get [] instead of wrong rows.
 */
export async function loadTab(name, expect) {
  const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(
      `Couldn't load tab "${name}" (HTTP ${res.status}). Check the tab exists and the sheet is shared as "Anyone with the link".`,
    );
  }
  const csv = await res.text();
  const { data, meta } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const headers = (meta.fields ?? []).map((f) => f.trim().toUpperCase());
  if (expect && !headers.some((h) => h.includes(expect.toUpperCase()))) return [];
  return data
    .map((row) => {
      const out = {};
      for (const key in row) {
        const k = key.trim().toUpperCase();
        if (k) out[k] = String(row[key] ?? "").trim();
      }
      return out;
    })
    .filter((r) => Object.values(r).some((v) => v !== ""));
}

/** Value of the first column whose header contains any of the keywords. */
export function col(row, ...words) {
  for (const k in row) if (words.some((w) => k.includes(w.toUpperCase()))) return row[k];
  return "";
}

/** Header of the first column matching a keyword (or undefined). */
export const colKey = (row, ...words) =>
  Object.keys(row).find((k) => words.some((w) => k.includes(w.toUpperCase())));

/** "AVAERAGE AUTO" → "Avaerage Auto" */
export const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
