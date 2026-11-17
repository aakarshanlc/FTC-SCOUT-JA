"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fmt } from "@/lib/format";

export function PageHead({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="display">{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="toolbar" style={{ margin: 0 }}>{children}</div> : null}
    </div>
  );
}

export function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: unknown;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`card tile${accent ? " accent" : ""}`}>
      <div className="eyebrow">{label}</div>
      <div className="v">{fmt(value)}</div>
      <div className="s">{sub ?? " "}</div>
    </div>
  );
}

export function Rank({ rank }: { rank: number | null }) {
  if (!rank) return <span className="rank none">–</span>;
  return <span className={`rank${rank <= 3 ? ` r${rank}` : ""}`}>{rank}</span>;
}

export function TeamCell({ number, name, org }: { number: string; name?: string; org?: string }) {
  return (
    <div className="teamcell">
      <span className="nm">{name || "Unnamed team"}</span>
      <span className="n">
        {number}
        {org ? <span className="muted" style={{ fontFamily: "var(--ff-body)", fontWeight: 400 }}> · {org}</span> : null}
      </span>
    </div>
  );
}

export function Meter({ value, max }: { value: number | null; max: number }) {
  return (
    <span className="meter">
      <span className="meter-track">
        <span
          className="meter-fill"
          style={{ display: "block", width: `${value && max ? Math.max(4, (value / max) * 100) : 0}%` }}
        />
      </span>
      <span className="num" style={{ minWidth: "3.5ch", fontWeight: 600 }}>
        {fmt(value)}
      </span>
    </span>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}

export function Notice({ kind, children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return <div className={`notice${kind ? ` ${kind}` : ""}`}>{children}</div>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Notice kind="error">{error instanceof Error ? error.message : String(error)}</Notice>
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: 18, display: "grid", gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 22, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

// sortable table

export interface Column<T> {
  key: keyof T & string;
  label: string;
  right?: boolean;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

type Sort = { key: string; dir: 1 | -1 };
const blank = (v: unknown) => v === null || v === undefined || v === "";

export function SortableTable<T extends object>({
  cols,
  rows,
  rowKey,
  initialSort,
  href,
}: {
  cols: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  initialSort: Sort;
  href?: (r: T) => string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>(initialSort);
  const sorted = [...rows].sort((a, b) => {
    const x = (a as Record<string, unknown>)[sort.key];
    const y = (b as Record<string, unknown>)[sort.key];
    if (blank(x) && blank(y)) return 0;
    if (blank(x)) return 1;
    if (blank(y)) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir;
  });
  const click = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: ["rank", "number", "name", "org"].includes(key) ? 1 : -1 },
    );

  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => {
              const canSort = c.sortable !== false;
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`${c.right ? "r " : ""}${canSort ? "sortable" : ""}`}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  onClick={canSort ? () => click(c.key) : undefined}
                >
                  {c.label}
                  {active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              className={href ? "link" : undefined}
              onClick={href ? () => router.push(href(r)) : undefined}
            >
              {cols.map((c) => (
                <td key={c.key} className={c.right ? "r" : undefined}>
                  {c.render ? c.render(r) : fmt((r as Record<string, unknown>)[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// toast

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const show = useCallback((m: string) => setMsg(m), []);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return { show, node };
}
