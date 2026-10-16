"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  allTeams,
  loadTab,
  REFRESH_MS,
  SCRIMMAGE_TAB,
  type Row,
  type TeamInfo,
} from "@/lib/sheet";

export interface Banner {
  status: string;
  error: string;
}

interface ScoutData {
  teams: Row[];
  robots: Row[];
  matches: Row[];
  scrimmages: Row[];
  infos: TeamInfo[];
  champBanner: Banner;
  scrimBanner: Banner;
  lastUpdated: Date | null;
}

const ScoutContext = createContext<ScoutData | null>(null);

export function useScout(): ScoutData {
  const ctx = useContext(ScoutContext);
  if (!ctx) throw new Error("useScout must be used inside <ScoutProvider>");
  return ctx;
}

export default function ScoutProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Row[]>([]);
  const [robots, setRobots] = useState<Row[]>([]);
  const [matches, setMatches] = useState<Row[]>([]);
  const [scrimmages, setScrimmages] = useState<Row[]>([]);

  const [champBanner, setChampBanner] = useState<Banner>({ status: "Loading data…", error: "" });
  const [scrimBanner, setScrimBanner] = useState<Banner>({
    status: "Loading scrimmages…",
    error: "",
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      // Championship tabs — a failure here must not block the scrimmage view.
      try {
        const [t, r, m] = await Promise.all([
          loadTab("Teams"),
          loadTab("Robot"),
          loadTab("Matches"),
        ]);
        if (cancelled) return;
        setTeams(t);
        setRobots(r);
        setMatches(m);
        setChampBanner({ status: "", error: "" });
      } catch (err) {
        if (cancelled) return;
        setChampBanner({ status: "", error: err instanceof Error ? err.message : String(err) });
      }

      // Scrimmages tab loaded separately so a missing tab can't break Championship.
      try {
        const s = await loadTab(SCRIMMAGE_TAB);
        if (cancelled) return;
        setScrimmages(s);
        setScrimBanner({ status: "", error: "" });
      } catch (err) {
        if (cancelled) return;
        setScrimBanner({ status: "", error: err instanceof Error ? err.message : String(err) });
        setScrimmages([]);
      }

      if (!cancelled) setLastUpdated(new Date());
    }

    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const infos = useMemo(() => allTeams([teams, scrimmages, matches, robots]), [
    teams,
    scrimmages,
    matches,
    robots,
  ]);

  const value: ScoutData = {
    teams,
    robots,
    matches,
    scrimmages,
    infos,
    champBanner,
    scrimBanner,
    lastUpdated,
  };

  return <ScoutContext.Provider value={value}>{children}</ScoutContext.Provider>;
}
