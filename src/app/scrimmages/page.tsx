"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useScout } from "@/components/ScoutProvider";
import {
  Banner,
  Empty,
  RankCell,
  SortableTable,
  StatCard,
  TeamCell,
  type Column,
} from "@/components/ui";
import { agg, scrimBase, scrimNames, scrimRows, type ScrimRow } from "@/lib/sheet";

export default function ScrimmagesPage() {
  const router = useRouter();
  const { scrimmages, scrimBanner } = useScout();
  const [scrimEvent, setScrimEvent] = useState("");

  const names = scrimNames(scrimmages);
  const event = names.includes(scrimEvent) ? scrimEvent : "";

  const rows = useMemo(() => scrimRows(scrimmages, event), [scrimmages, event]);
  const base = scrimBase(scrimmages, event);
  const baseTotals = agg(base, "total");

  const cols: Column<ScrimRow>[] = [
    { key: "rank", label: "#", num: true, render: (r) => <RankCell rank={r.rank} /> },
    { key: "number", label: "Team", render: (r) => <TeamCell number={r.number} /> },
    { key: "name", label: "Name" },
    { key: "org", label: "Organization" },
    { key: "drivetrain", label: "Drivetrain" },
    { key: "auto", label: "Avg Auto", num: true },
    { key: "teleop", label: "Avg Teleop", num: true },
    { key: "flower", label: "Avg Flower", num: true },
    { key: "avgTotal", label: "Avg Total", num: true },
    { key: "best", label: "Best", num: true },
    { key: "played", label: "Entries", num: true },
  ];

  return (
    <>
      <Banner status={scrimBanner.status} error={scrimBanner.error} />
      <div className="pagehead">
        <h1>{event || "Scrimmages"}</h1>
        <span className="muted">{rows.length} teams</span>
      </div>
      <select value={event} onChange={(e) => setScrimEvent(e.target.value)}>
        <option value="">All scrimmages</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <div className="stats">
        <StatCard label="Teams" value={rows.length} />
        <StatCard label="Entries" value={baseTotals.count} />
        <StatCard label="High score" value={baseTotals.best} />
        <StatCard label="Average score" value={baseTotals.avg} />
      </div>
      <div className="card">
        {rows.length ? (
          <SortableTable
            cols={cols}
            rows={rows}
            initialSort={{ key: "rank", dir: 1 }}
            onRowClick={(r) => router.push(`/team/${encodeURIComponent(r.number)}`)}
          />
        ) : (
          <Empty>No data in the Scrimmages tab yet.</Empty>
        )}
      </div>
    </>
  );
}
