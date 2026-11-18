"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { post, type Overview } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  daysUntil,
  eventTitle,
  fmt,
  fmtRange,
  meaningful,
  record,
  seasonLabel,
  timeAgo,
} from "@/lib/format";
import {
  Empty,
  ErrorNotice,
  PageHead,
  Rank,
  SkeletonRows,
  Tile,
  useToast,
} from "@/components/ui";
import {
  IconArrowRight,
  IconCalendar,
  IconRefresh,
} from "@/components/icons";

export function OverviewView() {
  const { data, error, isLoading } = useSWR<Overview>("/api/overview");
  const { mutate } = useSWRConfig();
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();

  const next = data?.nextEvents.find((e) => e.start);
  // Seasons are numbered by start year (2026 = the 2026–27 game). The tiles use
  // the latest season FTCScout has results for, which lags until events start.
  const season = data?.ftc.season ?? null;
  const days = daysUntil(next?.start ?? null);

  const { user } = useAuth();
  const syncNow = async () => {
    setSyncing(true);
    try {
      await post("/api/sync");
      await mutate(() => true);
      toast.show("Synced with Google Sheet and FTCScout");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={
          data
            ? `${seasonLabel(data.season)} season · Jamaica`
            : "FIRST Tech Challenge"
        }
        title={
          <>
            Scouting <span style={{ color: "var(--signal)" }}>HQ</span>
          </>
        }
        sub="Rankings, scrimmage reports, match video and upcoming events for FTC teams in Jamaica."
      >
        {user ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={syncNow}
              disabled={syncing}
            >
              <IconRefresh
                style={
                  syncing
                    ? { animation: "spin 0.9s linear infinite" }
                    : undefined
                }
              />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <span className="muted sync-note" title={data?.sync.sheet && !data.sync.sheet.ok ? data.sync.sheet.message : undefined}>
              {data?.sync.sheet && !data.sync.sheet.ok ? "Last sync failed" : `Synced ${timeAgo(data?.sync.sheet?.createdAt)}`}
            </span>
            <Link href="/scout" className="btn primary">
              Log a match
            </Link>
          </>
        ) : null}
      </PageHead>

      <ErrorNotice error={error} />

      <div className="tiles">
        <Tile
          accent
          loading={!data && !error}
          label={next ? "Next event" : "Events"}
          value={days === null ? "TBD" : days <= 0 ? "Today" : `${days}d`}
          sub={next ? next.name : "Nothing scheduled"}
        />
        <Tile
          loading={!data && !error}
          label="Jamaican teams"
          value={data?.counts.allTeams}
          sub={
            data
              ? season
                ? `${data.counts.activeTeams} competed in ${seasonLabel(season)}`
                : "on FTCScout"
              : ""
          }
        />
        <Tile
          loading={!data && !error}
          label="Official matches"
          value={data?.counts.ftcMatches}
          sub={
            data
              ? `${season ? seasonLabel(season) : "This season"} · ${data.counts.ftcEvents} event${data.counts.ftcEvents === 1 ? "" : "s"}${
                  data.counts.matches ? ` · ${data.counts.matches} scouted` : ""
                }`
              : ""
          }
        />
        <Tile
          loading={!data && !error}
          label="Scrimmage reports"
          value={data?.counts.scrimmageEntries}
          sub={
            data
              ? `${data.counts.scrimmages} scrimmage${data.counts.scrimmages === 1 ? "" : "s"}`
              : ""
          }
        />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="display">Leaderboard</h2>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {data?.topTeams.length
                  ? "Our scouting · average match total"
                  : data?.ftc.season
                    ? `FTCScout OPR · ${seasonLabel(data.ftc.season)} season`
                    : ""}
              </div>
            </div>
            <Link href="/rankings" className="btn ghost sm">
              Full rankings <IconArrowRight />
            </Link>
          </div>
          {isLoading ? (
            <SkeletonRows rows={5} />
          ) : data?.topTeams.length ? (
            data.topTeams.map((t) => (
              <Link
                key={t.number}
                href={`/team/${t.number}`}
                className="board-row"
              >
                <Rank rank={t.rank} />
                <div className="teamcell">
                  <span className="nm">{t.name || "Unnamed team"}</span>
                  <span className="n">
                    {t.number} · {t.played} matches
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="board-score">{fmt(t.avg)}</div>
                  <div className="eyebrow">avg</div>
                </div>
              </Link>
            ))
          ) : data?.ftc.top.length ? (
            data.ftc.top.map((t) => (
              <Link
                key={t.number}
                href={`/team/${t.number}`}
                className="board-row"
              >
                <Rank rank={t.rank} />
                <div className="teamcell">
                  <span className="nm">{t.name || "Unnamed team"}</span>
                  <span className="n">
                    {t.number} · {record(t.wins, t.losses, t.ties)}
                    {t.worldRank ? ` · #${t.worldRank} world` : ""}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="board-score">{fmt(t.opr)}</div>
                  <div className="eyebrow">opr</div>
                </div>
              </Link>
            ))
          ) : (
            <Empty title="No championship matches yet">
              Rankings appear once matches are logged in the sheet or{" "}
              <Link
                href="/scout"
                style={{ color: "var(--signal)", fontWeight: 600 }}
              >
                in the app
              </Link>
              .
            </Empty>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="display">Coming up</h2>
            <Link href="/events" className="btn ghost sm">
              Calendar <IconArrowRight />
            </Link>
          </div>
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : data?.nextEvents.length ? (
            data.nextEvents.map((e) => (
              <div
                key={e.id}
                className="board-row"
                style={{ gridTemplateColumns: "34px 1fr auto" }}
              >
                <IconCalendar
                  style={{
                    width: 20,
                    height: 20,
                    color: "var(--ink-3)",
                    justifySelf: "center",
                  }}
                />
                <div className="teamcell">
                  <span className="nm">{eventTitle(e.name)}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {fmtRange(e.start, e.end)}
                  </span>
                </div>
                <span
                  className={`badge ${e.kind === "Championship" ? "signal" : e.kind === "Scrimmage" ? "blue" : ""}`}
                >
                  {e.kind}
                </span>
              </div>
            ))
          ) : (
            <Empty title="Nothing scheduled" />
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="display">From the pits</h2>
          <Link href="/scrimmages" className="btn ghost sm">
            All scrimmage reports <IconArrowRight />
          </Link>
        </div>
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : data?.recentScrimmageTeams.length ? (
          <div className="pits">
            {data.recentScrimmageTeams.map((t) => {
              const obs = meaningful(t.observations);
              return (
                <Link key={t.number} href={`/team/${t.number}`} className="pit">
                  <div className="pit-num">{t.number}</div>
                  <div className="nm">{t.name || "Unnamed team"}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {t.org || "—"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 10,
                    }}
                  >
                    {obs.length ? (
                      obs.map(([k, v]) => (
                        <span key={k} className="tag">
                          <b>{k}</b>
                          {v}
                        </span>
                      ))
                    ) : (
                      <span className="tag">No notes yet</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Empty title="No scrimmage reports yet" />
        )}
      </section>

      {toast.node}
    </>
  );
}
