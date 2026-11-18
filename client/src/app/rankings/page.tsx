"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ChampRow, FtcRankRow, FtcSeasonInfo } from "@/lib/api";
import { record, seasonLabel } from "@/lib/format";
import { SeasonChips } from "@/components/ftc";
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

type Mode = "ftc" | "scouting";

export default function RankingsPage() {
  const [mode, setMode] = useState<Mode>("ftc");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const match = (r: { number: string; name: string; org: string }) =>
    !term || r.number.includes(term) || r.name.toLowerCase().includes(term) || r.org.toLowerCase().includes(term);

  return (
    <>
      <PageHead
        eyebrow="Jamaica"
        title="Rankings"
        sub={
          mode === "ftc"
            ? "Official results from FTCScout, ranked by OPR (roughly how many points a team adds to its alliance each match)."
            : "Ranked by our own scouting, using each team's average match score."
        }
      />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Ranking source">
          <button type="button" aria-pressed={mode === "ftc"} onClick={() => setMode("ftc")}>
            FTCScout OPR
          </button>
          <button type="button" aria-pressed={mode === "scouting"} onClick={() => setMode("scouting")}>
            Our scouting
          </button>
        </div>
        <input
          className="input"
          placeholder="Filter by number, name or school…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {mode === "ftc" ? <FtcRankings match={match} /> : <ScoutingRankings match={match} term={term} />}
    </>
  );
}

function FtcRankings({ match }: { match: (r: FtcRankRow) => boolean }) {
  const [season, setSeason] = useState<number | null>(null);
  const { data, error, isLoading } = useSWR<{ season: number | null; seasons: FtcSeasonInfo[]; rows: FtcRankRow[] }>(
    `/api/ftc/rankings${season ? `?season=${season}` : ""}`,
    { keepPreviousData: true },
  );
  const rows = (data?.rows ?? []).filter(match);
  const max = Math.max(0, ...(data?.rows ?? []).map((r) => r.opr ?? 0));

  const cols: Column<FtcRankRow>[] = [
    { key: "rank", label: "#", render: (r) => <Rank rank={r.rank} /> },
    { key: "name", label: "Team", render: (r) => <TeamCell number={r.number} name={r.name} org={r.org} /> },
    { key: "opr", label: "OPR", right: true, render: (r) => <Meter value={r.opr} max={max} /> },
    { key: "auto", label: "Auto", right: true, phoneHidden: true },
    { key: "dc", label: "Teleop", right: true, phoneHidden: true },
    { key: "wins", label: "Record", right: true, render: (r) => <span className="num">{record(r.wins, r.losses, r.ties)}</span> },
    { key: "best", label: "Best", right: true, phoneHidden: true },
    {
      key: "worldRank",
      label: "World",
      right: true,
      phoneHidden: true,
      render: (r) => (
        <span className="num muted" title={r.worldCount ? `of ${r.worldCount} teams` : undefined}>
          {r.worldRank ? `#${r.worldRank}` : "–"}
        </span>
      ),
    },
    { key: "awards", label: "Awards", right: true, phoneHidden: true, render: (r) => (r.awards ? <span className="badge signal">★ {r.awards}</span> : <span className="muted">–</span>) },
  ];

  return (
    <>
      <ErrorNotice error={error} />
      <div style={{ marginBottom: 14 }}>
        <SeasonChips seasons={(data?.seasons ?? []).map((s) => s.season)} value={data?.season ?? null} onChange={setSeason} />
      </div>
      <div className="card">
        {isLoading && !data ? (
          <SkeletonRows />
        ) : rows.length ? (
          <SortableTable
            key={data?.season}
            cols={cols}
            rows={rows}
            rowKey={(r) => r.number}
            initialSort={{ key: "rank", dir: 1 }}
            href={(r) => `/team/${r.number}`}
          />
        ) : (
          <Empty title={data?.season ? `No results for ${seasonLabel(data.season)}` : "No FTCScout data yet"}>
            Results appear after the server's FTCScout sync.
          </Empty>
        )}
      </div>
    </>
  );
}

function ScoutingRankings({ match, term }: { match: (r: ChampRow) => boolean; term: string }) {
  const { data = [], error, isLoading } = useSWR<ChampRow[]>("/api/teams");
  const rows = data.filter((r) => r.rank !== null && match(r));
  const max = Math.max(0, ...data.map((r) => r.avg ?? 0));
  const cols: Column<ChampRow>[] = [
    { key: "rank", label: "#", render: (r) => <Rank rank={r.rank} /> },
    { key: "name", label: "Team", render: (r) => <TeamCell number={r.number} name={r.name} org={r.org} /> },
    { key: "auto", label: "Auto", right: true, phoneHidden: true },
    { key: "teleop", label: "Teleop", right: true, phoneHidden: true },
    { key: "avg", label: "Avg total", right: true, render: (r) => <Meter value={r.avg} max={max} /> },
    { key: "best", label: "Best", right: true, phoneHidden: true },
    { key: "played", label: "Played", right: true },
  ];
  return (
    <>
      <ErrorNotice error={error} />
      <div className="card">
        {isLoading ? (
          <SkeletonRows />
        ) : rows.length ? (
          <SortableTable cols={cols} rows={rows} rowKey={(r) => r.number} initialSort={{ key: "rank", dir: 1 }} href={(r) => `/team/${r.number}`} />
        ) : (
          <Empty title={term ? "No teams match that filter" : "No scouted matches yet"}>
            {term ? "Try a team number or school name." : "Log matches on the Scout page or in the sheet's Matches tab."}
          </Empty>
        )}
      </div>
    </>
  );
}
