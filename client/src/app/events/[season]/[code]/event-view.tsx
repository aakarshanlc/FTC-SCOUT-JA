"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ApiError, type FtcEventDetail } from "@/lib/api";
import { fmt, fmtRange, record, seasonLabel } from "@/lib/format";
import { AwardList, MatchList } from "@/components/ftc";
import { Empty, ErrorNotice, Rank, SkeletonRows, SortableTable, Tile, type Column } from "@/components/ui";
import { IconArrowLeft, IconExternal } from "@/components/icons";

type Row = FtcEventDetail["rankings"][number];
type Tab = "rankings" | "matches" | "awards";

export function EventView() {
  const { season, code } = useParams<{ season: string; code: string }>();
  const { data, error, isLoading } = useSWR<FtcEventDetail>(`/api/ftc/events/${season}/${code}`, { refreshInterval: 60_000 });
  const [tab, setTab] = useState<Tab>("rankings");

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div style={{ paddingTop: 40 }}>
        <Back />
        <div className="card" style={{ marginTop: 16 }}>
          <Empty title="No results for this event">FTCScout has no rankings or matches for it yet.</Empty>
        </div>
      </div>
    );
  }

  const winner = data?.awards.filter((a) => a.type === "Winner").map((a) => a.number);
  const inspire = data?.awards.find((a) => a.type === "Inspire" && a.placement === 1);
  const played = data?.matches.filter((m) => m.played).length ?? 0;
  const high = Math.max(0, ...(data?.matches ?? []).flatMap((m) => [m.red.score ?? 0, m.blue.score ?? 0]));

  const cols: Column<Row>[] = [
    { key: "rank", label: "#", render: (r) => <Rank rank={r.rank} /> },
    {
      key: "number",
      label: "Team",
      render: (r) => (
        <div className="teamcell">
          <span className="nm">{r.name || "Unnamed team"}</span>
          <span className="n">{r.number}</span>
        </div>
      ),
    },
    { key: "wins", label: "W-L-T", right: true, render: (r) => <span className="num">{record(r.wins, r.losses, r.ties)}</span> },
    { key: "rp", label: "RP", right: true },
    { key: "opr", label: "OPR", right: true, render: (r) => <strong className="num">{fmt(r.opr)}</strong> },
    { key: "oprAuto", label: "Auto OPR", right: true },
    { key: "oprDc", label: "Teleop OPR", right: true },
    { key: "avg", label: "Avg", right: true },
    { key: "max", label: "High", right: true },
  ];

  return (
    <>
      <div style={{ paddingTop: 24 }}>
        <Back />
      </div>
      <ErrorNotice error={error} />
      <div className="pagehead" style={{ paddingTop: 18 }}>
        <div>
          <div className="eyebrow">
            {seasonLabel(Number(season))} · {data?.kind ?? "Event"} · {code}
          </div>
          <h1 className="display">{data?.name ?? (isLoading ? "Loading…" : code)}</h1>
          <p>
            {data ? fmtRange(data.start, data.end) : ""}
            {data?.location ? ` · ${data.location}` : ""}
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {data?.url ? (
            <a className="btn" href={data.url} target="_blank" rel="noreferrer">
              FTCScout <IconExternal />
            </a>
          ) : null}
          {data?.liveStream ? (
            <a className="btn" href={data.liveStream} target="_blank" rel="noreferrer">
              Livestream <IconExternal />
            </a>
          ) : null}
        </div>
      </div>

      <div className="tiles">
        <Tile accent label="Teams" value={data?.rankings.length} sub={data ? `${played} matches played` : ""} />
        <Tile
          label="Winning alliance"
          value={winner?.length ? winner.join(" · ") : "–"}
          sub={winner?.length ? winner.map((n) => data?.teamNames[n!]).filter(Boolean).join(", ") : ""}
        />
        <Tile label="Inspire award" value={inspire?.number ?? "–"} sub={inspire?.name} />
        <Tile label="High score" value={high || "–"} sub="Without penalties" />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="seg" role="group" aria-label="Event data">
            <button type="button" aria-pressed={tab === "rankings"} onClick={() => setTab("rankings")}>
              Rankings
            </button>
            <button type="button" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>
              Matches {data?.matches.length ?? ""}
            </button>
            <button type="button" aria-pressed={tab === "awards"} onClick={() => setTab("awards")}>
              Awards {data?.awards.length ?? ""}
            </button>
          </div>
        </div>
        {isLoading && !data ? (
          <SkeletonRows />
        ) : tab === "rankings" ? (
          data?.rankings.length ? (
            <SortableTable cols={cols} rows={data.rankings} rowKey={(r) => r.number} initialSort={{ key: "rank", dir: 1 }} href={(r) => `/team/${r.number}`} />
          ) : (
            <Empty title="No rankings yet" />
          )
        ) : tab === "matches" ? (
          <MatchList matches={data?.matches ?? []} names={data?.teamNames} />
        ) : (
          <div style={{ paddingTop: 4 }}>
            <AwardList awards={data?.awards ?? []} showTeam />
          </div>
        )}
      </section>
    </>
  );
}

function Back() {
  return (
    <Link href="/events" className="btn ghost sm" style={{ paddingLeft: 6 }}>
      <IconArrowLeft /> Events
    </Link>
  );
}
