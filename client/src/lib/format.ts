export const fmt = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "–" : String(v);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function dateParts(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return { y, month: MONTHS[m - 1], d };
}

/** "Feb 12 – 13, 2027" / "Feb 12, 2027" / "Date TBD" — no Date() so no timezone drift. */
export function fmtRange(start: string | null, end: string | null): string {
  const s = dateParts(start);
  if (!s) return "Date TBD";
  const cap = (m: string) => m[0] + m.slice(1).toLowerCase();
  const e = dateParts(end);
  if (!e || !end || end <= (start ?? "")) return `${cap(s.month)} ${s.d}, ${s.y}`;
  if (s.y === e.y && s.month === e.month) return `${cap(s.month)} ${s.d} – ${e.d}, ${e.y}`;
  return `${cap(s.month)} ${s.d} – ${cap(e.month)} ${e.d}, ${e.y}`;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Text observations that carry information ("N/A" and blanks are dropped). */
export const meaningful = (obs: Record<string, string> = {}) =>
  Object.entries(obs).filter(([, v]) => v && !/^(n\/?a|none|-|–)$/i.test(v.trim()));
