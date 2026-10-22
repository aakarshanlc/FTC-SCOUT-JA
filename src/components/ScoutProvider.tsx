"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  allTeams,
  loadTab,
  REFRESH_MS,
  SCRIMMAGE_TAB,
  type Row,
  type TeamInfo,
} from "@/lib/sheet";
import { REGION, SEASON, fetchEvents, type FtcEvent } from "@/lib/ftcscout";

export interface Banner {
  status: string;
  error: string;
}

/** One FTCScout API status line, shown by the floating info panel. */
export interface ApiRow {
  key: string;
  text: string;
  error: boolean;
}

interface ScoutData {
  teams: Row[];
  robots: Row[];
  matches: Row[];
  scrimmages: Row[];
  sheetEvents: Row[];
  ftcEvents: FtcEvent[];
  infos: TeamInfo[];
  champBanner: Banner;
  scrimBanner: Banner;
  eventsBanner: Banner;
  lastUpdated: Date | null;
  /** FTCScout load results/errors for the "i" status panel (insertion order). */
  apiRows: ApiRow[];
  /** Record (or, with null, clear) a FTCScout status line under a stable key. */
  reportApi: (key: string, entry: { text: string; error: boolean } | null) => void;
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
  const [sheetEvents, setSheetEvents] = useState<Row[]>([]);
  const [ftcEvents, setFtcEvents] = useState<FtcEvent[]>([]);

  const [champBanner, setChampBanner] = useState<Banner>({ status: "Loading data…", error: "" });
  const [scrimBanner, setScrimBanner] = useState<Banner>({
    status: "Loading scrimmages…",
    error: "",
  });
  const [eventsBanner, setEventsBanner] = useState<Banner>({
    status: "Loading events…",
    error: "",
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [apiMap, setApiMap] = useState<Record<string, { text: string; error: boolean }>>({});

  const reportApi = useCallback(
    (key: string, entry: { text: string; error: boolean } | null) => {
      setApiMap((prev) => {
        const old = prev[key];
        if (!entry) {
          if (!old) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        if (old && old.text === entry.text && old.error === entry.error) return prev;
        return { ...prev, [key]: entry };
      });
    },
    [],
  );

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

      // Sheet Events tab — optional, supplies dates for hand-entered events.
      // gviz falls back to the first tab for unknown names, so a stub result
      // is filtered away later (rows without a date are ignored).
      try {
        const ev = await loadTab("Events");
        if (!cancelled) setSheetEvents(ev);
      } catch {
        if (!cancelled) setSheetEvents([]);
      }

      // FTCScout season events (kickoff, qualifiers, championship…).
      try {
        const evts = await fetchEvents(SEASON, REGION);
        if (!cancelled) {
          setFtcEvents(evts);
          setEventsBanner({ status: "", error: "" });
          reportApi("events", {
            text: `FTCScout: ${evts.length} season events loaded for region "${REGION}"`,
            error: false,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setFtcEvents([]);
          const msg = `FTCScout events: ${err instanceof Error ? err.message : String(err)} — showing sheet events only.`;
          setEventsBanner({ status: "", error: msg });
          reportApi("events", { text: msg, error: true });
        }
      }

      if (!cancelled) setLastUpdated(new Date());
    }

    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reportApi]);

  const infos = useMemo(() => allTeams([teams, scrimmages, matches, robots]), [
    teams,
    scrimmages,
    matches,
    robots,
  ]);

  const apiRows = useMemo<ApiRow[]>(
    () => Object.entries(apiMap).map(([key, e]) => ({ key, ...e })),
    [apiMap],
  );

  const value: ScoutData = {
    apiRows,
    reportApi,
    teams,
    robots,
    matches,
    scrimmages,
    sheetEvents,
    ftcEvents,
    infos,
    champBanner,
    scrimBanner,
    eventsBanner,
    lastUpdated,
  };

  return <ScoutContext.Provider value={value}>{children}</ScoutContext.Provider>;
}
