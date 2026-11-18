"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { FtcAward, FtcMatch, FtcTeamSeason } from "@/lib/api";
import { awardName, eventTitle, fmt, fmtRange, ordinal, record, seasonLabel } from "@/lib/format";
import { AwardList, MatchList, SeasonChips } from "@/components/ftc";
import { Empty, SkeletonRows } from "@/components/ui";

export function FtcHistory({ number }: { number: string }) {
  const { data, isLoading } = useSWR<{
    seasons: FtcTeamSeason[];
    awards: FtcAward[];
    registrations?: { season: number; code: string; name: string; start: string | null; competed: boolean }[];
  }>(`/api/ftc/teams/${number}`);
  const [picked, setPicked] = useState<number | null>(null);
  const seasons = data?.seasons ?? [];
  const season = seasons.find((s) => s.season === picked) ?? seasons[0];
  const { data: matches } = useSWR<FtcMatch[]>(season ? `/api/ftc/teams/${number}/matches?season=${season.season}` : null);
  const [tab, setTab] = useState<"events" | "matches" | "awards">("events");

  if (isLoading) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <SkeletonRows rows={4} />
      </section>
    );
  }
  if (!season) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="display">Competition history</h2>
        </div>
        {data?.registrations?.length ? (
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0 }}>
              No official match results yet. FIRST lists this team as registered for:
            </p>
            {data.registrations.map((r) => (
              <div key={`${r.season}-${r.code}`} className="result-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {seasonLabel(r.season)} season{r.start ? ` · ${fmtRange(r.start, null)}` : ""}
                  </div>
                </div>
                <span className="badge">{r.competed ? "Competed" : "Registered · no results"}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No official results yet">This team hasn&apos;t played an event that FTCScout or FIRST has published results for.</Empty>
        )}
      </section>
    );
  }

  const firstSeason = Math.min(...seasons.map((s) => s.season));

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <div>
          <h2 className="display">Competition history</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {seasons.length} season{seasons.length === 1 ? "" : "s"} on FTCScout since {seasonLabel(firstSeason)} · {data!.awards.length} award
            {data!.awards.length === 1 ? "" : "s"}
          </div>
        </div>
        <SeasonChips seasons={seasons.map((s) => s.season)} value={season.season} onChange={setPicked} />
      </div>

      <div className="card-body">
        <div className="tiles five">
          <MiniStat label="Season OPR" value={season.opr?.value} sub={season.opr?.rank ? `#${season.opr.rank} of ${season.worldCount ?? "?"} worldwide` : ""} accent />
          <MiniStat label="Jamaica rank" value={season.regionRank ? `#${season.regionRank}` : "–"} sub={season.regionCount ? `of ${season.regionCount} teams` : ""} />
          <MiniStat label="Auto OPR" value={season.auto?.value} sub={season.auto?.rank ? `#${season.auto.rank} world` : ""} />
          <MiniStat label="Teleop OPR" value={season.dc?.value} sub={season.dc?.rank ? `#${season.dc.rank} world` : ""} />
          <MiniStat
            label="Record"
            value={record(
              sum(season.events.map((e) => e.wins)),
              sum(season.events.map((e) => e.losses)),
              sum(season.events.map((e) => e.ties)),
            )}
            sub={`${season.events.length} event${season.events.length === 1 ? "" : "s"}`}
          />
        </div>
      </div>

      <div style={{ padding: "0 18px 12px" }}>
        <div className="seg" role="group" aria-label="History view">
          <button type="button" aria-pressed={tab === "events"} onClick={() => setTab("events")}>
            Events {season.events.length}
          </button>
          <button type="button" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>
            Matches {matches?.length ?? ""}
          </button>
          <button type="button" aria-pressed={tab === "awards"} onClick={() => setTab("awards")}>
            Awards {data!.awards.length}
          </button>
        </div>
      </div>

      {tab === "events" ? (
        season.events.length ? (
          season.events.map((e) => (
            <Link key={e.eventCode} href={`/events/${e.season}/${e.eventCode}`} className="result-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {eventTitle(e.eventName)}
                  <span className={`badge ${/Championship/.test(e.eventType) ? "signal" : ""}`}>{eventTypeLabel(e.eventType)}</span>
                  {e.remote ? <span className="badge">Remote</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {fmtRange(e.start, e.end)}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
                {e.alliance || e.advanced ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {e.alliance ? (
                      <span className="badge blue">
                        Alliance {e.alliance.seed} · {e.alliance.role}
                      </span>
                    ) : null}
                    {e.advanced ? (
                      <span className="badge good" title={e.advanced.criteria}>
                        {e.advanced.declined ? "Declined Worlds spot" : "Advanced to Worlds"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {e.awards.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {e.awards.map((a) => (
                      <span key={`${a.type}-${a.placement}`} className="badge signal">
                        ★ {a.label ?? awardName(a.type, a.placement)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="result-stats">
                <Stat label="Rank" value={e.rank ? ordinal(e.rank) : "–"} />
                <Stat label="W-L-T" value={record(e.wins, e.losses, e.ties)} />
                <Stat label="OPR" value={fmt(e.opr?.total)} />
                <Stat label="High" value={fmt(e.max)} />
              </div>
            </Link>
          ))
        ) : (
          <Empty title="No events this season" />
        )
      ) : tab === "matches" ? (
        matches ? <MatchList matches={matches} focus={number} /> : <SkeletonRows rows={4} />
      ) : (
        <div style={{ paddingTop: 4 }}><AwardList awards={data!.awards} showEvent /></div>
      )}
    </section>
  );
}

const eventTypeLabel = (t: string) =>
  ({ FIRSTChampionship: "World Championship", DistrictChampionship: "District Championship", LeagueMeet: "League Meet", LeagueTournament: "League Tournament", OffSeason: "Off-season", Scrimmage: "Scrimmage" } as Record<string, string>)[t] ?? t;

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);

function MiniStat({ label, value, sub, accent }: { label: string; value: unknown; sub?: string; accent?: boolean }) {
  return (
    <div className={`card tile${accent ? " accent" : ""}`} style={{ boxShadow: "none" }}>
      <div className="eyebrow">{label}</div>
      <div className="v" style={{ fontSize: 34 }}>
        {fmt(value)}
      </div>
      <div className="s">{sub || " "}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="v">{value}</div>
      <div className="eyebrow">{label}</div>
    </div>
  );
}
