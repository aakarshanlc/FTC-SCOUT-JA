"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useScout } from "@/components/ScoutProvider";
import { Banner, Empty, RankCell, SortableTable, TeamCell, type Column } from "@/components/ui";
import { champRows, type ChampRow } from "@/lib/sheet";

export default function ChampionshipPage() {
  const router = useRouter();
  const { teams, matches, infos, champBanner } = useScout();
  const [teamQuery, setTeamQuery] = useState("");

  const q = teamQuery.trim().toLowerCase();
  const rows = useMemo(
    () =>
      champRows(teams, matches, infos).filter(
        (r) =>
          !q ||
          r.number.includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.org.toLowerCase().includes(q),
      ),
    [teams, matches, infos, q],
  );

  const cols: Column<ChampRow>[] = [
    { key: "rank", label: "#", num: true, render: (r) => <RankCell rank={r.rank} /> },
    { key: "number", label: "Team", render: (r) => <TeamCell number={r.number} /> },
    { key: "name", label: "Name" },
    { key: "org", label: "Organization" },
    { key: "avg", label: "Avg", num: true },
    { key: "best", label: "Best", num: true },
    { key: "played", label: "Matches", num: true },
  ];

  return (
    <>
      <Banner status={champBanner.status} error={champBanner.error} />
      <div className="pagehead">
        <h1>Championship Teams</h1>
        <span className="muted">{rows.length} teams</span>
      </div>
      <input
        id="teamQuery"
        className="filter"
        placeholder="Filter by number, name or organization…"
        value={teamQuery}
        onChange={(e) => setTeamQuery(e.target.value)}
      />
      <div className="card">
        {rows.length ? (
          <SortableTable
            cols={cols}
            rows={rows}
            initialSort={{ key: "rank", dir: 1 }}
            onRowClick={(r) => router.push(`/team/${encodeURIComponent(r.number)}`)}
          />
        ) : (
          <Empty>No teams found.</Empty>
        )}
      </div>
    </>
  );
}
