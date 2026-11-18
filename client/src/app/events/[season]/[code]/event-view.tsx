"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ApiError, type FirstAlliance, type FtcEventDetail } from "@/lib/api";
import { eventTitle, fmt, fmtRange, record, seasonLabel } from "@/lib/format";
import { AwardList, MatchList } from "@/components/ftc";
import { Empty, ErrorNotice, Rank, SkeletonRows, SortableTable, Tile, type Column } from "@/components/ui";
import { IconArrowLeft, IconExternal } from "@/components/icons";

type Row = FtcEventDetail["rankings"][number];
type Tab = "rankings" | "matches" | "alliances" | "awards" | "teams";

export function EventView() {
  const { season, code } = useParams<{ season: string; code: string }>()!;
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
    { key: "rp", label: "RP", right: true, phoneHidden: true },
    { key: "opr", label: "OPR", right: true, render: (r) => <strong className="num">{fmt(r.opr)}</strong> },
    { key: "oprAuto", label: "Auto OPR", right: true, phoneHidden: true },
    { key: "oprDc", label: "Teleop OPR", right: true, phoneHidden: true },
    { key: "avg", label: "Avg", right: true, phoneHidden: true },
    { key: "max", label: "High", right: true, phoneHidden: true },
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
          <h1 className="display">{data?.name ? eventTitle(data.name) : isLoading ? "Loading…" : code}</h1>
          <p>
            {data ? fmtRange(data.start, data.end) : ""}
            {data?.venue ? ` · ${data.venue}` : ""}
            {data ? ` · ${data.address || data.location}` : ""}
            {data?.fieldCount ? ` · ${data.fieldCount} fields` : ""}
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {data?.url ? (
            <a className="btn" href={data.url} target="_blank" rel="noreferrer">
              FTCScout <IconExternal />
            </a>
          ) : null}
          {data?.address || data?.coordinates ? (
            <a
              className="btn"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                data.coordinates ? `${data.coordinates.lat},${data.coordinates.lng}` : `${data.venue ?? ""} ${data.address}`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Map <IconExternal />
            </a>
          ) : null}
          {data?.volunteerUrl ? (
            <a className="btn" href={data.volunteerUrl} target="_blank" rel="noreferrer">
              Volunteer <IconExternal />
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

      {data?.advancement ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2 className="display">Going to Worlds</h2>
              <div className="muted" style={{ fontSize: 13 }}>
                {data.advancement.slots ?? data.advancement.teams.length} advancement slots to the FIRST Championship
              </div>
            </div>
          </div>
          <div className="adv">
            {data.advancement.teams.map((t) => (
              <Link key={t.team} href={`/team/${t.team}`} className={`adv-team${t.declined ? " declined" : ""}`}>
                <span className="adv-slot">{t.slot}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700 }}>
                    {t.team} {t.name}
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {t.criteria === "Points" ? "Qualified on advancement points" : t.criteria}
                    {t.declined ? " · declined" : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="seg" role="group" aria-label="Event data">
            <button type="button" aria-pressed={tab === "rankings"} onClick={() => setTab("rankings")}>
              Rankings
            </button>
            <button type="button" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>
              Matches {data?.matches.length ?? ""}
            </button>
            {data?.alliances.length ? (
              <button type="button" aria-pressed={tab === "alliances"} onClick={() => setTab("alliances")}>
                Alliances {data.alliances.length}
              </button>
            ) : null}
            <button type="button" aria-pressed={tab === "awards"} onClick={() => setTab("awards")}>
              Awards {data?.awards.length ?? ""}
            </button>
            {data?.registered.length ? (
              <button type="button" aria-pressed={tab === "teams"} onClick={() => setTab("teams")}>
                Teams {data.registered.length}
              </button>
            ) : null}
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
        ) : tab === "alliances" ? (
          <Alliances alliances={data?.alliances ?? []} />
        ) : tab === "teams" ? (
          <RegisteredTeams teams={data?.registered ?? []} />
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

function TeamLink({ t, strong }: { t: { team: string; name: string } | null; strong?: boolean }) {
  if (!t) return <span className="muted">–</span>;
  return (
    <Link href={`/team/${t.team}`} className="teamcell">
      <span className="nm" style={{ fontWeight: strong ? 700 : 600 }}>
        {t.name || "Unnamed team"}
      </span>
      <span className="n">{t.team}</span>
    </Link>
  );
}

function Alliances({ alliances }: { alliances: FirstAlliance[] }) {
  const picks = Math.max(1, ...alliances.map((a) => a.picks.length));
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Seed</th>
            <th>Captain</th>
            {Array.from({ length: picks }, (_, i) => (
              <th key={i}>Pick {i + 1}</th>
            ))}
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {alliances.map((a) => (
            <tr key={a.number}>
              <td>
                <span className={`rank${a.result === "Winner" ? " r1" : a.result === "Finalist" ? " r2" : ""}`}>{a.number}</span>
              </td>
              <td>
                <TeamLink t={a.captain} strong />
              </td>
              {Array.from({ length: picks }, (_, i) => (
                <td key={i}>
                  <TeamLink t={a.picks[i] ?? null} />
                </td>
              ))}
              <td>
                {a.result ? (
                  <span className={`badge ${a.result === "Winner" ? "signal" : "blue"}`}>{a.result === "Winner" ? "Champions" : "Finalists"}</span>
                ) : (
                  <span className="muted">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegisteredTeams({ teams }: { teams: FtcEventDetail["registered"] }) {
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Team</th>
            <th>Robot</th>
            <th>From</th>
            <th>Competed</th>
          </tr>
        </thead>
        <tbody>
          {[...teams]
            .sort((a, b) => Number(a.number) - Number(b.number))
            .map((t) => (
              <tr key={t.number}>
                <td>
                  <TeamLink t={{ team: t.number, name: t.name }} />
                </td>
                <td>{t.robotName ?? <span className="muted">–</span>}</td>
                <td className="muted">{t.city}</td>
                <td>{t.played ? <span className="badge good">Yes</span> : <span className="badge">No-show</span>}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
