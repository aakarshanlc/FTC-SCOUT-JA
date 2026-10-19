"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useScout } from "@/components/ScoutProvider";
import { Chart, Empty, KeyValue, RawTable, StatCard } from "@/components/ui";
import { agg, champRows, col, esc, rowsFor } from "@/lib/sheet";

type TabId = "overview" | "matches" | "scrims";

export default function TeamPage() {
  const params = useParams<{ number: string }>();
  const number = decodeURIComponent(params.number ?? "");
  // Remount when the team changes so the selected tab resets to Overview.
  return <TeamView key={number} number={number} />;
}

function TeamView({ number }: { number: string }) {
  const router = useRouter();
  const { teams, robots, matches, scrimmages, infos } = useScout();
  const [tab, setTab] = useState<TabId>("overview");

  const info = infos.find((t) => t.number === number) ?? { name: "", org: "" };
  const mrows = rowsFor(matches, number);
  const srows = rowsFor(scrimmages, number);
  const robot = rowsFor(robots, number)[0];
  const ms = agg(mrows, "total");
  const ss = agg(srows, "total");

  const champ = useMemo(() => champRows(teams, matches, infos), [teams, matches, infos]);
  const mine = champ.find((r) => r.number === number);
  const ranked = champ.filter((r) => r.played).length;

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  const tabs: [TabId, string][] = [
    ["overview", "Overview"],
    ["matches", `Matches (${mrows.length})`],
    ["scrims", `Scrimmages (${srows.length})`],
  ];

  let body: React.ReactNode;
  if (tab === "overview") {
    const kv = robot
      ? Object.entries(robot).filter(([k, v]) => !k.includes("NUMBER") && !k.includes("DRIVETRAIN") && v)
      : [];
    body = (
      <>
        <div className="card pad">
          <h3>Robot Info</h3>
          {kv.length ? (
            <div className="kv-grid">
              {kv.map(([k, v]) => (
                <KeyValue key={k} k={k} v={v} />
              ))}
            </div>
          ) : (
            <p className="empty nopad">No robot info yet.</p>
          )}
        </div>
        <Chart
          title="Championship match scores"
          vals={ms.vals}
          labels={mrows.map((r, i) => col(r, "match") || String(i + 1))}
        />
        <Chart
          title="Scrimmage scores"
          vals={ss.vals}
          labels={srows.map((r, i) => col(r, "scrimmage") || String(i + 1))}
        />
        {!ms.vals.length && !ss.vals.length ? <Empty>No scores logged yet.</Empty> : null}
      </>
    );
  } else if (tab === "matches") {
    body = (
      <div className="card">
        <RawTable rows={mrows} />
      </div>
    );
  } else {
    body = (
      <div className="card">
        <RawTable rows={srows} />
      </div>
    );
  }

  return (
    <>
      <span className="back" onClick={back}>
        ← Back
      </span>
      <div className="teamhead">
        <span className="big">{esc(number)}</span>
        <span className="nm">{esc(info.name || "Unknown team")}</span>
        <div className="muted">{esc(info.org)}</div>
      </div>
      <div className="stats">
        <StatCard
          label="Avg match score"
          value={ms.avg}
          sub={mine?.rank ? `Rank #${mine.rank} of ${ranked}` : ""}
        />
        <StatCard label="Best match" value={ms.best} />
        <StatCard label="Matches logged" value={ms.count} />
        <StatCard label="Avg scrimmage" value={ss.avg} sub={ss.count ? `${ss.count} entries` : ""} />
        <StatCard label="Best scrimmage" value={ss.best} />
      </div>
      <div id="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
    </>
  );
}
