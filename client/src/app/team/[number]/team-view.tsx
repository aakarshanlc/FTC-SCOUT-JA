"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  ApiError,
  del,
  type CreatedBy,
  type MatchDoc,
  type ScrimDoc,
  type TeamDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmt, meaningful } from "@/lib/format";
import {
  Empty,
  ErrorNotice,
  SkeletonRows,
  Tile,
  useToast,
} from "@/components/ui";
import {
  IconArrowLeft,
  IconExternal,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { FtcHistory } from "./ftc-history";

export function TeamView() {
  const { user } = useAuth();
  const { number } = useParams<{ number: string }>()!;
  const key = `/api/teams/${encodeURIComponent(number)}`;
  const { data, error, isLoading } = useSWR<TeamDetail>(key);
  const { mutate } = useSWRConfig();
  const [tab, setTab] = useState<"matches" | "scrims">("matches");
  const toast = useToast();

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div style={{ paddingTop: 40 }}>
        <Back />
        <div className="card" style={{ marginTop: 16 }}>
          <Empty title={`No data for team ${number}`}>
            This team isn't in the sheet and has no logged matches.{" "}
            <Link
              href={`/scout?team=${number}`}
              style={{ color: "var(--signal)", fontWeight: 600 }}
            >
              Log the first match
            </Link>
          </Empty>
        </div>
      </div>
    );
  }

  const remove = async (kind: "matches" | "scrimmages", id: string) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await del(`/api/${kind}/${id}`);
      await mutate(key);
      toast.show("Entry deleted");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const robot = Object.entries(data?.robot ?? {});
  const ms = data?.matchStats;
  const hasMatches = !!data?.matches.length;
  const hasScrims = !!data?.scrimmages.length;
  // Nothing scouted yet: one line instead of empty tiles, chart and tables.
  const noScouting = !!data && !hasMatches && !hasScrims && !robot.length;
  const hasRobot =
    !!robot.length ||
    !!data?.scrimmages.some((x) => meaningful(x.observations).length);
  const twoCol = (hasMatches || isLoading) && (hasRobot || isLoading);
  const shownTab =
    tab === "matches" && !hasMatches && hasScrims ? "scrims" : tab;

  return (
    <>
      <div style={{ paddingTop: 24 }}>
        <Back />
      </div>
      <ErrorNotice error={error} />
      <section className="team-hero">
        <div className="team-num">
          {number}
          <span>.</span>
        </div>
        <div>
          <div className="eyebrow">
            {[
              data?.org ||
                (isLoading
                  ? "Loading…"
                  : data?.ftc?.city || data?.first?.city
                    ? null
                    : "School not listed"),
              data?.ftc?.city || data?.first?.city?.replace(/, \d+, /, ", "),
              data?.ftc?.rookieYear ? `Rookie ${data.ftc.rookieYear}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <h1 className="display">
            {data?.name || (isLoading ? "" : "Unnamed team")}
          </h1>
          {data?.first?.robotName ? (
            <div style={{ marginTop: 6, fontSize: 14 }}>
              <span className="muted">Robot · </span>
              <strong>{data.first.robotName}</strong>
            </div>
          ) : null}
          {data?.first?.fullName && data.first.fullName !== data.name ? (
            <details style={{ marginTop: 6, fontSize: 13, maxWidth: 640 }}>
              <summary className="muted" style={{ cursor: "pointer" }}>
                Sponsors &amp; registered name
              </summary>
              <p style={{ margin: "6px 0 0", color: "var(--ink-2)" }}>
                {data.first.fullName.split("/").join(" · ")}
              </p>
            </details>
          ) : null}
          {data?.ftc ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 10,
              }}
            >
              <a
                className="btn sm ghost"
                href={`https://ftcscout.org/teams/${number}`}
                target="_blank"
                rel="noreferrer"
              >
                FTCScout <IconExternal />
              </a>
              {data.ftc.website ? (
                <a
                  className="btn sm ghost"
                  href={data.ftc.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Website <IconExternal />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {user ? (
          <Link href={`/scout?team=${number}`} className="btn primary">
            <IconPlus /> Log match
          </Link>
        ) : null}
      </section>

      <FtcHistory number={number} />

      <div className="pagehead" style={{ paddingTop: 40, paddingBottom: 14 }}>
        <div>
          <div className="eyebrow">Our scouting</div>
          <h2 className="display" style={{ margin: "6px 0 0", fontSize: 36 }}>
            Scouting report
          </h2>
        </div>
      </div>

      {noScouting ? (
        <div className="card signin-prompt">
          <span className="muted">
            No scouting data for this team yet.
          </span>
          {user ? (
            <Link className="btn sm" href={`/scout?team=${number}`}>
              <IconPlus /> Log match
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {hasMatches || isLoading ? (
            <div className="tiles five">
              <Tile
                accent
                label="Rank"
                value={data?.rank ? `#${data.rank}` : "–"}
                sub={
                  data?.rank ? `of ${data.rankedOf} ranked` : "Not ranked yet"
                }
              />
              <Tile
                label="Avg total"
                value={ms?.total.avg}
                sub={`${ms?.total.count ?? 0} matches`}
              />
              <Tile label="Best match" value={ms?.total.best} />
              <Tile label="Avg auto" value={ms?.auto.avg} />
              <Tile label="Avg teleop" value={ms?.teleop.avg} />
            </div>
          ) : null}

          <div
            className={twoCol ? "grid grid-2" : ""}
            style={{ marginTop: hasMatches || isLoading ? 16 : 0 }}
          >
            {hasMatches || isLoading ? (
              <section className="card">
                <div className="card-head">
                  <h2 className="display">Match scores</h2>
                  <div className="legend">
                    <span>
                      <i style={{ background: "var(--red)" }} />
                      Auto
                    </span>
                    <span>
                      <i style={{ background: "var(--blue)" }} />
                      Teleop
                    </span>
                    <span>
                      <i style={{ background: "var(--signal)" }} />
                      Total
                    </span>
                  </div>
                </div>
                <div className="card-body">
                  {isLoading ? (
                    <SkeletonRows rows={4} />
                  ) : (
                    <ScoreChart matches={data?.matches ?? []} />
                  )}
                </div>
              </section>
            ) : null}

            {hasRobot || isLoading ? (
              <section className="card">
                <div className="card-head">
                  <h2 className="display">Robot</h2>
                </div>
                <div className="card-body">
                  {robot.length ? (
                    <dl className="kv" style={{ margin: 0 }}>
                      {robot.map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <PitNotes scrims={data?.scrimmages ?? []} />
                  )}
                </div>
              </section>
            ) : null}
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="seg" role="group" aria-label="Entries">
                <button
                  type="button"
                  aria-pressed={shownTab === "matches"}
                  onClick={() => setTab("matches")}
                >
                  Matches {data?.matches.length ?? ""}
                </button>
                <button
                  type="button"
                  aria-pressed={shownTab === "scrims"}
                  onClick={() => setTab("scrims")}
                >
                  Scrimmages {data?.scrimmages.length ?? ""}
                </button>
              </div>
            </div>
            {shownTab === "matches" ? (
              <MatchTable
                rows={data?.matches ?? []}
                onDelete={(id) => remove("matches", id)}
              />
            ) : (
              <ScrimTable
                rows={data?.scrimmages ?? []}
                onDelete={(id) => remove("scrimmages", id)}
              />
            )}
          </section>
        </>
      )}
      {toast.node}
    </>
  );
}

function Back() {
  return (
    <Link href="/rankings" className="btn ghost sm" style={{ paddingLeft: 6 }}>
      <IconArrowLeft /> Rankings
    </Link>
  );
}

function ScoreChart({ matches }: { matches: MatchDoc[] }) {
  const scored = matches.filter((m) => m.total !== null);
  if (!scored.length)
    return (
      <Empty title="No scores yet">Scores show up here once matches are logged.</Empty>
    );
  const max = Math.max(...scored.map((m) => m.total ?? 0), 1);
  return (
    <>
      <div className="chart">
        {scored.map((m) => {
          const total = m.total ?? 0;
          const split =
            m.auto !== null && m.teleop !== null && m.auto + m.teleop > 0;
          return (
            <div
              className="bar"
              key={m._id}
              title={`${m.label || "Match"}: ${total}`}
            >
              <div className="val">{total}</div>
              <div
                className="stack"
                style={{ height: `${(total / max) * 100}%` }}
              >
                {split ? (
                  <>
                    <div className="seg-auto" style={{ flex: m.auto ?? 0 }} />
                    <div className="seg-tele" style={{ flex: m.teleop ?? 0 }} />
                  </>
                ) : (
                  <div className="seg-total" style={{ flex: 1 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chart-labels">
        {scored.map((m, i) => (
          <span key={m._id}>{m.label || i + 1}</span>
        ))}
      </div>
    </>
  );
}

function PitNotes({ scrims }: { scrims: ScrimDoc[] }) {
  const obs = new Map<string, string>();
  for (const s of scrims)
    for (const [k, v] of meaningful(s.observations)) obs.set(k, v);
  if (!obs.size)
    return (
      <Empty title="No robot info yet">
        Add details in the sheet's Robot tab.
      </Empty>
    );
  return (
    <>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        From scrimmage pit notes:
      </p>
      <dl className="kv" style={{ margin: 0 }}>
        {[...obs].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

const SourceBadge = ({
  source,
  by,
}: {
  source: "sheet" | "manual";
  by?: CreatedBy | null;
}) => (
  <span
    className={`badge ${source === "manual" ? "good" : ""}`}
    title={by ? `Added by ${by.name}` : undefined}
    style={{ textTransform: "none", letterSpacing: 0 }}
  >
    {source === "manual" ? (by ? `App · ${by.name}` : "App") : "Sheet"}
  </span>
);

function MatchTable({
  rows,
  onDelete,
}: {
  rows: MatchDoc[];
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  if (!rows.length) return <Empty title="No matches logged" />;
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Match</th>
            <th className="r">Auto</th>
            <th className="r">Teleop</th>
            <th className="r">Total</th>
            <th>Notes</th>
            <th>Source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m._id}>
              <td className="num" style={{ fontWeight: 600 }}>
                {m.label || `#${i + 1}`}
              </td>
              <td className="r num">{fmt(m.auto)}</td>
              <td className="r num">{fmt(m.teleop)}</td>
              <td className="r num" style={{ fontWeight: 700 }}>
                {fmt(m.total)}
              </td>
              <td className="muted" style={{ maxWidth: 280 }}>
                {m.notes || "—"}
              </td>
              <td>
                <SourceBadge source={m.source} by={m.createdBy} />
              </td>
              <td className="r">
                {m.source === "manual" && user ? (
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => onDelete(m._id)}
                    aria-label="Delete match"
                  >
                    <IconTrash />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScrimTable({
  rows,
  onDelete,
}: {
  rows: ScrimDoc[];
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  if (!rows.length) return <Empty title="No scrimmage reports" />;
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Scrimmage</th>
            <th>Notes</th>
            <th className="r">Auto</th>
            <th className="r">Teleop</th>
            <th className="r">Total</th>
            <th>Source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const obs = meaningful(s.observations);
            return (
              <tr key={s._id}>
                <td style={{ fontWeight: 600 }}>{s.event}</td>
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
                <td className="r num">{fmt(s.auto)}</td>
                <td className="r num">{fmt(s.teleop)}</td>
                <td className="r num" style={{ fontWeight: 700 }}>
                  {fmt(s.total)}
                </td>
                <td>
                  <SourceBadge source={s.source} by={s.createdBy} />
                </td>
                <td className="r">
                  {s.source === "manual" && user ? (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => onDelete(s._id)}
                      aria-label="Delete entry"
                    >
                      <IconTrash />
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
