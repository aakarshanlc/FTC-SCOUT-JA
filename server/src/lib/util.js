/** Number from a sheet cell, or null when the cell isn't numeric ("N/A", "Intake", ""). */
export function toNum(v) {
  const s = String(v ?? "").trim();
  if (!/\d/.test(s)) return null;
  const x = Number.parseFloat(s.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(x) ? null : x;
}

export const r1 = (x) => Math.round(x * 10) / 10;

export function stats(values) {
  const vals = values.filter((v) => typeof v === "number");
  if (!vals.length) return { count: 0, avg: null, best: null };
  return {
    count: vals.length,
    avg: r1(vals.reduce((a, b) => a + b, 0) / vals.length),
    best: Math.max(...vals),
  };
}

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\W+/g, "-")
    .replace(/^-|-$/g, "");

/** Wrap an async route so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  /** `code` is a machine-readable reason the client can act on. */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const PLACEHOLDER = /^(n\/?a|none|tbd|tba|-|–|null|undefined)$/i;
/**
 * Tidy a location for display: drop placeholder parts that some sources fill
 * in ("N/A · N/A, Jamaica" → "Jamaica") and collapse empty separators.
 */
export function cleanPlace(s) {
  return String(s ?? "")
    .split(" · ")
    .map((seg) =>
      seg
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x && !PLACEHOLDER.test(x))
        .join(", "),
    )
    .filter(Boolean)
    .join(" · ");
}
