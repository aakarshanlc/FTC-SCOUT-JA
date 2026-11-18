"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipPlayer } from "./ClipPlayer";
import type { FtcAward, FtcMatch } from "@/lib/api";
import { awardName, eventTitle, seasonLabel } from "@/lib/format";
import { Empty } from "./ui";

/** Matches with both alliances; `focus` highlights one team and colours W/L for it. */
export function MatchList({
  matches,
  focus,
  names = {},
}: {
  matches: FtcMatch[];
  focus?: string;
  names?: Record<string, string>;
}) {
  const [playing, setPlaying] = useState<FtcMatch | null>(null);
  if (!matches.length) return <Empty title="No matches" />;
  const anyClip = matches.some((m) => m.clip);
  return (
    <div className="tablewrap">
      {playing?.clip ? <ClipPlayer match={playing} clip={playing.clip} names={names} onClose={() => setPlaying(null)} /> : null}
      <table className="data">
        <thead>
          <tr>
            <th>Match</th>
            {focus ? <th className="hide-sm">Result</th> : null}
            <th className="r">Red alliance</th>
            <th className="r">Blue alliance</th>
            {anyClip ? <th className="r">Video</th> : null}
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const r = m.red.score;
            const b = m.blue.score;
            const done = m.played && r !== null && b !== null;
            const side = focus ? (m.red.teams.includes(focus) ? "red" : "blue") : null;
            const mine = side === "red" ? r : b;
            const theirs = side === "red" ? b : r;
            const result = !done || mine === null || theirs === null ? null : mine > theirs ? "W" : mine < theirs ? "L" : "T";
            return (
              <tr key={m._id}>
                <td>
                  <div className="num" style={{ fontWeight: 700 }}>
                    {m.label}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.level}
                  </div>
                  {focus && result ? (
                    /* On phones the Result column is hidden; show the outcome here instead. */
                    <span className={`badge show-sm ${result === "W" ? "good" : result === "L" ? "red" : ""}`} style={{ marginTop: 4 }}>
                      {result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
                    </span>
                  ) : null}
                </td>
                {focus ? (
                  <td className="hide-sm">
                    {result ? (
                      <span className={`badge ${result === "W" ? "good" : result === "L" ? "red" : ""}`}>
                        {result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
                      </span>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                ) : null}
                <td>
                  <Side color="red" a={m.red} win={done && r! > b!} focus={focus} names={names} />
                </td>
                <td>
                  <Side color="blue" a={m.blue} win={done && b! > r!} focus={focus} names={names} />
                </td>
                {anyClip ? (
                  <td className="r">
                    {m.clip ? (
                      <button type="button" className="btn sm primary" onClick={() => setPlaying(m)} aria-label={`Watch ${m.label}`}>
                        ▶<span className="hide-sm-inline"> Watch</span>
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Side({
  color,
  a,
  win,
  focus,
  names,
}: {
  color: "red" | "blue";
  a: FtcMatch["red"];
  win: boolean;
  focus?: string;
  names: Record<string, string>;
}) {
  return (
    <span className={`alliance ${color}${win ? " win" : ""}`}>
      <span className="teams" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        {a.teams.map((t) => (
          <Link
            key={t}
            href={`/team/${t}`}
            title={names[t]}
            onClick={(e) => e.stopPropagation()}
            style={{
              fontWeight: t === focus ? 700 : 400,
              color: t === focus ? "var(--ink)" : undefined,
              textDecoration: a.noShow.includes(t) ? "line-through" : undefined,
            }}
          >
            {t}
          </Link>
        ))}
      </span>
      <span className="sc" title={a.total !== null && a.total !== a.score ? `${a.total} with penalties` : undefined}>
        {a.score ?? "–"}
      </span>
    </span>
  );
}

const MEDAL: Record<string, string> = { Inspire: "signal", Winner: "signal", Finalist: "blue" };

export function AwardList({ awards, showTeam, showEvent }: { awards: FtcAward[]; showTeam?: boolean; showEvent?: boolean }) {
  if (!awards.length) return <Empty title="No awards yet" />;
  return (
    <ul className="awards">
      {awards.map((a, i) => (
        <li key={`${a.type}-${a.placement}-${a.number ?? ""}-${a.eventCode ?? ""}-${i}`}>
          <span className={`award-icon ${MEDAL[a.type] ?? ""}`} aria-hidden>
            ★
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{a.label ?? awardName(a.type, a.placement)}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {showTeam && a.number ? (
                <Link href={`/team/${a.number}`} style={{ color: "var(--ink-2)", fontWeight: 600 }}>
                  {a.number} {a.name}
                </Link>
              ) : null}
              {a.personName ? `${showTeam && a.number ? " · " : ""}${a.personName}` : ""}
              {showEvent && a.eventCode && a.season ? (
                <Link href={`/events/${a.season}/${a.eventCode}`} style={{ color: "var(--ink-2)" }}>
                  {eventTitle(a.eventName)} · {seasonLabel(a.season)}
                </Link>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SeasonChips({
  seasons,
  value,
  onChange,
}: {
  seasons: number[];
  value: number | null;
  onChange: (s: number) => void;
}) {
  return (
    <div className="chips" role="group" aria-label="Season">
      {seasons.map((s) => (
        <button key={s} type="button" className="chip" aria-pressed={value === s} onClick={() => onChange(s)}>
          {seasonLabel(s)}
        </button>
      ))}
    </div>
  );
}
