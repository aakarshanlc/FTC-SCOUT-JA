"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  esc,
  fmt,
  nextSort,
  rawColumns,
  sortRows,
  titleCase,
  type Row,
  type SortState,
} from "@/lib/sheet";
import { useScout } from "./ScoutProvider";

// banners, cards, footer

export function Banner({ status, error }: { status: string; error: string }) {
  if (error) return <div className="banner error">{error}</div>;
  if (status) return <div className="banner">{status}</div>;
  return null;
}

export function StatCard({ label, value, sub }: { label: string; value: unknown; sub?: string }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="v">{String(fmt(value))}</div>
      <div className="r">{sub ?? "\u00a0"}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function UpdatedLine() {
  const { lastUpdated } = useScout();
  if (!lastUpdated) return null;
  return <>{`Updated ${lastUpdated.toLocaleTimeString()} · refreshes every 30s`}</>;
}

// sortable table

export interface Column<T extends Record<string, unknown>> {
  key: string;
  label: string;
  num?: boolean;
  render?: (row: T) => ReactNode;
}

export function SortableTable<T extends Record<string, unknown>>({
  cols,
  rows,
  initialSort,
  onRowClick,
}: {
  cols: Column<T>[];
  rows: T[];
  initialSort: SortState;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const sorted = sortRows(rows, sort);

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? "num " : ""}sortable${sort.key === c.key ? " sorted" : ""}`}
                onClick={() => setSort((s) => nextSort(s, c.key))}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={String(r.number ?? "") + "-" + i}
              className={onRowClick ? "click" : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {cols.map((c) => (
                <td key={c.key} className={c.num ? "num" : undefined}>
                  {c.render ? c.render(r) : String(fmt(r[c.key]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const RankCell = ({ rank }: { rank: number | null }) =>
  rank ? <span className={`pill${rank <= 3 ? " top" : ""}`}>{rank}</span> : "–";

export const TeamCell = ({ number }: { number: string }) => <strong className="tnum">{number}</strong>;

export function RawTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty>No data yet.</Empty>;
  const cols = rawColumns(rows);
  const isNum = (v: string) => /^-?\d+(\.\d+)?$/.test(v);
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{esc(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className={isNum(r[c]) ? "num" : undefined}>
                  {r[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// charts 

export function Chart({ title, vals, labels }: { title: string; vals: number[]; labels: string[] }) {
  if (!vals.length) return null;
  const step = 44;
  const W = Math.max(320, vals.length * step + 40);
  const H = 170;
  const top = 22;
  const bot = 24;
  const bw = 30;
  const max = Math.max(...vals, 1);

  return (
    <div className="card pad">
      <h3>{esc(title)}</h3>
      <div className="tablewrap chartwrap">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title}>
          {vals.map((v, i) => {
            const h = ((H - top - bot) * v) / max;
            const x = 20 + i * step + (step - bw) / 2;
            const y = H - bot - h;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(h, 1)}
                  rx="3"
                  fill="var(--accent)"
                  opacity=".85"
                />
                <text className="cv" x={x + bw / 2} y={y - 5} textAnchor="middle">
                  {v}
                </text>
                <text className="cl" x={x + bw / 2} y={H - 8} textAnchor="middle">
                  {esc(labels[i])}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// robot info 

export function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span>{esc(titleCase(k))}</span>
      <strong>{esc(v)}</strong>
    </div>
  );
}
