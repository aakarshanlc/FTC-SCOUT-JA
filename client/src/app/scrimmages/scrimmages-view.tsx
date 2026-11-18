"use client";

// Scrimmages: "All scrimmages" lists every scrimmage (live, upcoming, past).
// Opening one slides a tab in beside "All scrimmages" with its teams,
// matches and headline numbers. Open tabs are kept in the URL (?open=a,b&s=a).

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { FtcMatch } from "@/lib/api";
import { dateParts, eventTitle, fmt, fmtRange, meaningful, record, seasonLabel } from "@/lib/format";
import { MatchList } from "@/components/ftc";
import { Empty, ErrorNotice, PageHead, Rank, SkeletonRows, Tile } from "@/components/ui";
import { IconExternal } from "@/components/icons";

interface ScrimSummary {
  id: string;
  name: string;
  start: string | null;
  end: string | null;
  location: string;
  season: number | null;
  code: string | null;
  url: string | null;
  teams: number;
  reports: number;
  scored: number;
  matches: number;
  sources: string[];
  status: "live" | "upcoming" | "undated" | "past";
  abroad: boolean;
  attendees: string[];
}

interface ScrimTeam {
  number: string;
  name: string;
  org: string;
  reports: number;
  observations: Record<string, string>;
  auto: number | null;
  teleop: number | null;
  avgTotal: number | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  opr: number | null;
  max: number | null;
}

type ScrimDetail = Omit<ScrimSummary, "teams" | "matches"> & {
  teams: ScrimTeam[];
  matches: FtcMatch[];
  benchmarks: {
    teams: number;
    schools: number;
    reports: number;
    matches: number;
    played: number;
    highScore: { score: number; match: string; teams: string[] } | null;
    avgAllianceScore: number | null;
    avgScouted: number | null;
    topOpr: { number: string; name: string; opr: number } | null;
    topScouted: { number: string; name: string; avgTotal: number } | null;
    capabilities: Record<string, Record<string, number>>;
    notRecorded: number;
  };
};

const MAX_TABS = 4;
const isOfficial = (s: { sources: string[] }) => s.sources.includes("ftcscout");

export function ScrimmagesView() {
  const params = useSearchParams()!;
  const router = useRouter();
  const pathname = usePathname()!;
  const { data: list, error } = useSWR<ScrimSummary[]>("/api/scrims");

  const open = (params.get("open") ?? "").split(",").filter(Boolean);
  const selected = params.get("s");
  const byId = new Map((list ?? []).map((s) => [s.id, s]));

  const go = (nextOpen: string[], nextSel: string | null) => {
    const q = new URLSearchParams();
    if (nextOpen.length) q.set("open", nextOpen.join(","));
    if (nextSel) q.set("s", nextSel);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const openTab = (id: string) => {
    const next = open.includes(id) ? open : [...open, id].slice(-MAX_TABS);
    go(next, id);
  };
  const closeTab = (id: string) => {
    const next = open.filter((x) => x !== id);
    go(next, selected === id ? (next.at(-1) ?? null) : selected);
  };

  const home = (list ?? []).filter((s) => !s.abroad);
  const groups: [string, ScrimSummary[]][] = [
    ["Happening now", home.filter((s) => s.status === "live")],
    ["Upcoming", home.filter((s) => s.status === "upcoming").reverse()],
    ["This season · date not set", home.filter((s) => s.status === "undated")],
    ["Past", home.filter((s) => s.status === "past")],
    ["Jamaican teams abroad", (list ?? []).filter((s) => s.abroad)],
  ];

  return (
    <>
      <PageHead
        eyebrow="Pre-season & practice"
        title="Scrimmages"
        sub="Past and upcoming scrimmages. Open one to see which teams came, what matches were played and how everyone did."
      />
      <ErrorNotice error={error} />

      <div className="stabs" role="tablist" aria-label="Scrimmages">
        <button type="button" role="tab" className="stab" aria-selected={!selected} onClick={() => go(open, null)}>
          All scrimmages
          {list ? <span className="stab-count">{list.length}</span> : null}
        </button>
        {open.map((id) => {
          const s = byId.get(id);
          return (
            <span key={id} className="stab-wrap" data-on={selected === id}>
              <button type="button" role="tab" className="stab stab-open" aria-selected={selected === id} onClick={() => go(open, id)} title={s?.name}>
                {s?.name ? eventTitle(s.name) : "…"}
              </button>
              <button type="button" className="stab-x" aria-label={`Close ${s?.name ?? "tab"}`} onClick={() => closeTab(id)}>
                ×
              </button>
            </span>
          );
        })}
      </div>

      {selected ? (
        <ScrimDetailView key={selected} id={selected} />
      ) : !list ? (
        <SkeletonRows />
      ) : list.length ? (
        groups.map(([title, items]) =>
          items.length ? (
            <section key={title} style={{ marginTop: 18 }}>
              <h2 className="eyebrow" style={{ margin: "0 0 10px" }}>
                {title} · {items.length}
              </h2>
              <div className="scrim-grid">
                {items.map((s) => (
                  <ScrimCard key={s.id} s={s} active={open.includes(s.id)} onOpen={() => openTab(s.id)} />
                ))}
              </div>
            </section>
          ) : null,
        )
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty title="No scrimmages yet">Scouts can add one from the Scout page.</Empty>
        </div>
      )}
    </>
  );
}

function ScrimCard({ s, active, onOpen }: { s: ScrimSummary; active: boolean; onOpen: () => void }) {
  const d = dateParts(s.start);
  return (
    <button type="button" className={`scrim-card card${active ? " on" : ""}`} onClick={onOpen}>
      <div className={`datebox${d ? "" : " tbd"}`}>
        <div className="m">{d?.month ?? "DATE"}</div>
        <div className="d">{d?.d ?? "TBD"}</div>
        <div className="y">{d?.y ?? " "}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="scrim-name">{eventTitle(s.name)}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {s.start ? fmtRange(s.start, s.end) : s.reports ? "Date not set" : "Date TBD"}
          {s.location ? ` · ${s.location}` : ""}
        </div>
        {s.abroad && s.attendees.length ? (
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <span className="muted">Attended by </span>
            <strong>{s.attendees.join(", ")}</strong>
          </div>
        ) : null}
        <div className="scrim-chips">
          <span className="tag">
            <b>Teams</b>
            {s.teams || "–"}
          </span>
          <span className="tag">
            <b>Matches</b>
            {s.matches || "none"}
          </span>
          {s.reports ? (
            <span className="tag">
              <b>Reports</b>
              {s.reports}
            </span>
          ) : null}
          {s.status === "live" ? (
            <span className="badge red live">
              <span className="dot" /> Live
            </span>
          ) : null}
          <span className={`badge ${isOfficial(s) ? "blue" : "good"}`}>{isOfficial(s) ? "Official" : "Scouted"}</span>
        </div>
      </div>
    </button>
  );
}

function ScrimDetailView({ id }: { id: string }) {
  const { data: s, error, isLoading } = useSWR<ScrimDetail>(`/api/scrims/${encodeURIComponent(id)}`);
  if (error) return <ErrorNotice error={error} />;
  if (isLoading || !s) return <SkeletonRows rows={8} />;
  const b = s.benchmarks;
  const { teams, matches } = s;
  const hasResults = teams.some((t) => t.rank !== null || t.opr !== null);
  const hasScores = teams.some((t) => t.avgTotal !== null);
  const capKeys = Object.keys(b.capabilities);

  return (
    <div className="scrim-detail">
      <div className="pagehead" style={{ paddingTop: 22, paddingBottom: 14 }}>
        <div>
          <div className="eyebrow">
            {s.season ? `${seasonLabel(s.season)} · ` : ""}
            {isOfficial(s) ? "Official scrimmage" : "Scouted scrimmage"}
            {s.code ? ` · ${s.code}` : ""}
          </div>
          <h2 className="display" style={{ margin: "6px 0 0", fontSize: "clamp(32px, 5vw, 48px)" }}>
            {eventTitle(s.name)}
          </h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {s.start ? fmtRange(s.start, s.end) : "Date not set"}
            {s.location ? ` · ${s.location}` : ""}
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {s.code && s.season && b.matches ? (
            <Link className="btn" href={`/events/${s.season}/${s.code}`}>
              Event page
            </Link>
          ) : null}
          {s.url ? (
            <a className="btn" href={s.url} target="_blank" rel="noreferrer">
              FTCScout <IconExternal />
            </a>
          ) : null}
          <Link className="btn primary" href="/scout">
            Add a report
          </Link>
        </div>
      </div>

      <div className="tiles">
        <Tile accent label="Teams" value={b.teams || "–"} sub={b.schools ? `${b.schools} schools` : "None recorded"} />
        <Tile label="Matches" value={b.matches || "None"} sub={b.matches ? `${b.played} played` : "No match results recorded"} />
        {b.highScore ? (
          <Tile label="High score" value={b.highScore.score} sub={`${b.highScore.match} · ${b.highScore.teams.join(" + ")}`} />
        ) : (
          <Tile label="Scouting reports" value={b.reports || "–"} sub={b.reports ? "from your scouts" : "None yet"} />
        )}
        {b.topOpr ? (
          <Tile label="Top OPR" value={b.topOpr.opr} sub={`${b.topOpr.number} ${b.topOpr.name}`} />
        ) : b.topScouted ? (
          <Tile label="Top scouted avg" value={b.topScouted.avgTotal} sub={`${b.topScouted.number} ${b.topScouted.name}`} />
        ) : (
          <Tile label="Avg alliance score" value={b.avgAllianceScore ?? "–"} sub={b.avgAllianceScore ? "per alliance, no penalties" : "No scores recorded"} />
        )}
      </div>

      {capKeys.length ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h3 className="display">Robot builds</h3>
              <div className="muted" style={{ fontSize: 13 }}>
                From pit notes · {teams.length} teams
                {b.notRecorded ? ` · ${b.notRecorded} notes left blank or N/A` : ""}
              </div>
            </div>
          </div>
          <div className="card-body caps">
            {capKeys.map((k) => {
              const rows = Object.entries(b.capabilities[k]).sort((x, y) => y[1] - x[1]);
              return (
                <div key={k}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    {k}
                  </div>
                  {rows.map(([v, n]) => (
                    <div key={v} className="cap-row">
                      <span className="cap-label">{v}</span>
                      <span className="cap-bar">
                        <span style={{ width: `${(n / Math.max(1, teams.length)) * 100}%` }} />
                      </span>
                      <span className="num cap-n">
                        {n}/{teams.length}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3 className="display">Teams at this scrimmage</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {teams.length} team{teams.length === 1 ? "" : "s"}
          </span>
        </div>
        {teams.length ? (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  {hasResults ? <th>#</th> : null}
                  <th>Team</th>
                  <th>Pit notes</th>
                  {hasResults ? <th className="r">W-L-T</th> : null}
                  {hasResults ? <th className="r">OPR</th> : null}
                  {hasScores ? <th className="r">Avg total</th> : null}
                  {hasScores ? <th className="r">Best</th> : null}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const obs = meaningful(t.observations);
                  return (
                    <tr key={t.number}>
                      {hasResults ? (
                        <td>
                          <Rank rank={t.rank} />
                        </td>
                      ) : null}
                      <td>
                        <Link href={`/team/${t.number}`} className="teamcell">
                          <span className="nm">{t.name || "Unnamed team"}</span>
                          <span className="n">
                            {t.number}
                            {t.org ? <span className="muted" style={{ fontFamily: "var(--ff-body)", fontWeight: 400 }}> · {t.org}</span> : null}
                          </span>
                        </Link>
                      </td>
                      <td>
                        {obs.length ? (
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
                        )}
                      </td>
                      {hasResults ? <td className="r num">{record(t.wins, t.losses, t.ties)}</td> : null}
                      {hasResults ? <td className="r num">{fmt(t.opr)}</td> : null}
                      {hasScores ? <td className="r num">{fmt(t.avgTotal)}</td> : null}
                      {hasScores ? <td className="r num">{fmt(t.max)}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No teams recorded">The official listing doesn&apos;t say who attended. Scouts can add teams from the Scout page.</Empty>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3 className="display">Matches</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {matches.length ? `${matches.length} recorded` : "none recorded"}
          </span>
        </div>
        {matches.length ? (
          <MatchList matches={matches} />
        ) : (
          <Empty title="No matches recorded">
            {s.reports ? "Scouts logged pit notes here, but no match results were entered." : "No official match results were published for this scrimmage."}
          </Empty>
        )}
      </section>
    </div>
  );
}
