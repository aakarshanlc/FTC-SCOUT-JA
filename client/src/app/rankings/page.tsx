"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ChampRow } from "@/lib/api";
import {
  Empty,
  ErrorNotice,
  Meter,
  PageHead,
  Rank,
  SkeletonRows,
  SortableTable,
  TeamCell,
  type Column,
} from "@/components/ui";

export default function RankingsPage() {
  const { data = [], error, isLoading } = useSWR<ChampRow[]>("/api/teams");
  const [q, setQ] = useState("");
  const [onlyRanked, setOnlyRanked] = useState(false);

  const term = q.trim().toLowerCase();
  const rows = data.filter(
    (r) =>
      (!onlyRanked || r.rank !== null) &&
      (!term ||
        r.number.includes(term) ||
        r.name.toLowerCase().includes(term) ||
        r.org.toLowerCase().includes(term)),
  );
  const max = Math.max(0, ...data.map((r) => r.avg ?? 0));

  const cols: Column<ChampRow>[] = [
    { key: "rank", label: "#", render: (r) => <Rank rank={r.rank} /> },
    { key: "name", label: "Team", render: (r) => <TeamCell number={r.number} name={r.name} org={r.org} /> },
    { key: "auto", label: "Auto", right: true },
    { key: "teleop", label: "Teleop", right: true },
    { key: "avg", label: "Avg total", right: true, render: (r) => <Meter value={r.avg} max={max} /> },
    { key: "best", label: "Best", right: true },
    { key: "played", label: "Played", right: true },
  ];

  return (
    <>
      <PageHead
        eyebrow="Championship"
        title="Rankings"
        sub="Every team ranked by average match total. Tap a row for the full scouting report."
      />
      <ErrorNotice error={error} />
      <div className="toolbar">
        <input
          className="input"
          placeholder="Filter by number, name or school…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="seg" role="group" aria-label="Which teams">
          <button type="button" aria-pressed={!onlyRanked} onClick={() => setOnlyRanked(false)}>
            All {data.length}
          </button>
          <button type="button" aria-pressed={onlyRanked} onClick={() => setOnlyRanked(true)}>
            Ranked {data.filter((r) => r.rank).length}
          </button>
        </div>
      </div>
      <div className="card">
        {isLoading ? (
          <SkeletonRows />
        ) : rows.length ? (
          <SortableTable
            cols={cols}
            rows={rows}
            rowKey={(r) => r.number}
            initialSort={{ key: "rank", dir: 1 }}
            href={(r) => `/team/${r.number}`}
          />
        ) : (
          <Empty title={term ? "No teams match that filter" : "No teams yet"}>
            {term ? "Try a team number or school name." : "Teams appear once the sheet syncs."}
          </Empty>
        )}
      </div>
    </>
  );
}
