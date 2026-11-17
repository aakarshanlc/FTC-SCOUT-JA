"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ScrimRow } from "@/lib/api";
import { meaningful } from "@/lib/format";
import {
  Empty,
  ErrorNotice,
  PageHead,
  Rank,
  SkeletonRows,
  SortableTable,
  TeamCell,
  type Column,
} from "@/components/ui";

interface ScrimResponse {
  events: string[];
  event: string | null;
  rows: ScrimRow[];
}

export default function ScrimmagesPage() {
  const [event, setEvent] = useState("");
  const { data, error, isLoading } = useSWR<ScrimResponse>(
    `/api/scrimmages${event ? `?event=${encodeURIComponent(event)}` : ""}`,
    { keepPreviousData: true },
  );
  const rows = data?.rows ?? [];
  const hasScores = rows.some((r) => r.avgTotal !== null);

  const cols: Column<ScrimRow>[] = [
    ...(hasScores ? [{ key: "rank", label: "#", render: (r: ScrimRow) => <Rank rank={r.rank} /> } as Column<ScrimRow>] : []),
    { key: "name", label: "Team", render: (r) => <TeamCell number={r.number} name={r.name} org={r.org} /> },
    {
      key: "observations",
      label: "Pit notes",
      sortable: false,
      render: (r) => {
        const obs = meaningful(r.observations);
        return obs.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {obs.map(([k, v]) => (
              <span key={k} className="tag">
                <b>{k}</b>
                {v}
              </span>
            ))}
          </div>
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    ...(hasScores
      ? ([
          { key: "auto", label: "Auto", right: true },
          { key: "teleop", label: "Teleop", right: true },
          { key: "avgTotal", label: "Avg total", right: true },
          { key: "best", label: "Best", right: true },
        ] as Column<ScrimRow>[])
      : []),
    { key: "played", label: "Reports", right: true },
  ];

  return (
    <>
      <PageHead
        eyebrow="Pre-season"
        title={event || "Scrimmages"}
        sub="What scouts saw at each scrimmage — mechanisms, autos and scores where they were recorded."
      />
      <ErrorNotice error={error} />
      <div className="chips" style={{ marginBottom: 14 }} role="group" aria-label="Scrimmage">
        <button type="button" className="chip" aria-pressed={!event} onClick={() => setEvent("")}>
          All scrimmages
        </button>
        {data?.events.map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={event === n} onClick={() => setEvent(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="card">
        {isLoading && !data ? (
          <SkeletonRows />
        ) : rows.length ? (
          <SortableTable
            cols={cols}
            rows={rows}
            rowKey={(r) => r.number}
            initialSort={hasScores ? { key: "rank", dir: 1 } : { key: "name", dir: 1 }}
            href={(r) => `/team/${r.number}`}
          />
        ) : (
          <Empty title="No scrimmage reports yet">Add rows to the sheet's Scrimmages tab, or log one on the Scout page.</Empty>
        )}
      </div>
    </>
  );
}
