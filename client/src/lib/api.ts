// Empty = same origin: the API is served by this Next.js app at /api (one Vercel
// project). Set NEXT_PUBLIC_API_URL (e.g. http://localhost:4000) to use a
// separately running server instead.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const REFRESH_MS = 30_000;

export interface Stats {
  count: number;
  avg: number | null;
  best: number | null;
}

export interface ChampRow {
  number: string;
  name: string;
  org: string;
  avg: number | null;
  best: number | null;
  auto: number | null;
  teleop: number | null;
  played: number;
  rank: number | null;
}

export interface ScrimRow {
  number: string;
  name: string;
  org: string;
  auto: number | null;
  teleop: number | null;
  avgTotal: number | null;
  best: number | null;
  played: number;
  events: string[];
  observations: Record<string, string>;
  rank: number | null;
}

export interface MatchDoc {
  _id: string;
  team: string;
  label: string;
  auto: number | null;
  teleop: number | null;
  total: number | null;
  notes: string;
  source: "sheet" | "manual";
  createdBy?: CreatedBy | null;
  createdAt: string;
}

export interface ScrimDoc {
  _id: string;
  event: string;
  team: string;
  name: string;
  org: string;
  auto: number | null;
  teleop: number | null;
  total: number | null;
  observations: Record<string, string>;
  source: "sheet" | "manual";
  createdBy?: CreatedBy | null;
  createdAt: string;
}

export interface TeamDetail {
  number: string;
  name: string;
  org: string;
  robot: Record<string, string>;
  ftc: { name: string; school: string; city: string; rookieYear: number | null; website: string | null } | null;
  first: { fullName: string; robotName: string | null; city: string; lastSeason: number; robotNames: Record<string, string> } | null;
  rank: number | null;
  rankedOf: number;
  matchStats: { total: Stats; auto: Stats; teleop: Stats };
  scrimStats: { total: Stats };
  matches: MatchDoc[];
  scrimmages: ScrimDoc[];
}

export interface CalEvent {
  id: string;
  name: string;
  kind: string;
  start: string | null;
  end: string | null;
  location: string;
  website: string | null;
  liveStream: string | null;
  url: string | null;
  code: string | null;
  season: number | null;
  origin: "ftcscout" | "sheet" | "manual";
  finished: boolean;
  ongoing: boolean;
  hasMatches: boolean;
  entries: number;
  googleCalendar: string | null;
  _mongoId?: string;
}

export interface EventMatch {
  id: string;
  label: string;
  level: string;
  time: string | null;
  played: boolean;
  red: { teams: string[]; score: number | null };
  blue: { teams: string[]; score: number | null };
}

export interface SyncLog {
  _id: string;
  kind: "sheet" | "ftcscout";
  ok: boolean;
  message: string;
  counts: Record<string, number>;
  durationMs: number;
  createdAt: string;
}

export interface Overview {
  counts: {
    teams: number;
    rankedTeams: number;
    matches: number;
    scrimmageEntries: number;
    scrimmages: number;
    upcomingEvents: number;
    pastEvents: number;
    allTeams: number;
    ftcMatches: number;
    activeTeams: number;
    ftcEvents: number;
  };
  topTeams: ChampRow[];
  nextEvents: CalEvent[];
  recentScrimmageTeams: ScrimRow[];
  ftc: { season: number | null; top: FtcRankRow[]; seasons: FtcSeasonInfo[] };
  sync: { sheet: SyncLog | null; ftcscout: SyncLog | null };
  season: number;
  region: string;
}

export interface SearchHit {
  number: string;
  name: string;
  org: string;
  rank: number | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include", // send the sign-in cookie (also across local dev ports)
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, `Can't reach the API at ${API_URL}. Is the server running?`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`, body.code);
  return body as T;
}

export const fetcher = <T,>(path: string) => request<T>(path);
export const post = <T,>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) });
export const del = (path: string) => request<void>(path, { method: "DELETE" });

// ───────── FTCScout history ─────────

export interface Quick {
  value: number | null;
  rank: number | null;
}

export interface FtcSeasonInfo {
  season: number;
  teams: number;
  matches: number;
}

export interface FtcRankRow {
  number: string;
  name: string;
  org: string;
  opr: number | null;
  auto: number | null;
  dc: number | null;
  eg: number | null;
  worldRank: number | null;
  worldCount: number | null;
  events: number;
  wins: number;
  losses: number;
  ties: number;
  best: number | null;
  awards: number;
  rank: number | null;
}

export interface FtcAward {
  type: string;
  label?: string; // official FIRST award name, when known
  school?: string | null;
  placement: number;
  personName?: string | null;
  season?: number;
  eventCode?: string;
  eventName?: string;
  number?: string;
  name?: string;
}

export interface Participation {
  season: number;
  eventCode: string;
  eventName: string;
  eventType: string;
  start: string | null;
  end: string | null;
  remote: boolean;
  location: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  rp: number | null;
  qualMatchesPlayed: number | null;
  opr: { auto: number | null; dc: number | null; total: number | null } | null;
  avg: { auto: number | null; dc: number | null; total: number | null } | null;
  max: number | null;
  awards: FtcAward[];
  alliance?: { seed: number; role: string } | null;
  advanced?: { criteria: string; to: string | null; declined: boolean } | null;
}

export interface FtcTeamSeason {
  season: number;
  opr: Quick | null;
  auto: Quick | null;
  dc: Quick | null;
  eg: Quick | null;
  worldCount: number | null;
  regionRank: number | null;
  regionCount: number | null;
  events: Participation[];
}

export interface FtcAlliance {
  teams: string[];
  noShow: string[];
  score: number | null;
  total: number | null;
  auto: number | null;
  dc: number | null;
}

export interface FtcMatch {
  _id: string;
  season: number;
  eventCode: string;
  eventName: string;
  matchId: number;
  label: string;
  level: string;
  played: boolean;
  time: string | null;
  red: FtcAlliance;
  blue: FtcAlliance;
  clip?: MatchClip | null;
}

/** Where a match is inside an event recording (see /clips). */
export interface MatchClip {
  recording: string;
  videoId: string;
  start: number;
  end: number;
  url: string;
  calibrated: boolean;
}

export interface FtcEventDetail {
  season: number;
  code: string;
  name: string;
  kind: string;
  start: string | null;
  end: string | null;
  location: string;
  website: string | null;
  liveStream: string | null;
  url: string | null;
  rankings: {
    number: string;
    name: string;
    rank: number | null;
    wins: number | null;
    losses: number | null;
    ties: number | null;
    rp: number | null;
    played: number | null;
    opr: number | null;
    oprAuto: number | null;
    oprDc: number | null;
    avg: number | null;
    max: number | null;
  }[];
  awards: FtcAward[];
  matches: FtcMatch[];
  teamNames: Record<string, string>;
  venue: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  fieldCount: number | null;
  volunteerUrl: string | null;
  alliances: FirstAlliance[];
  advancement: { advancesTo: string | null; slots: number | null; teams: { team: string; name: string; slot: number; criteria: string; declined: boolean }[] } | null;
  registered: { number: string; name: string; city: string; robotName: string | null; played: boolean }[];
}

export interface FirstTeamRef {
  team: string;
  name: string;
}

export interface FirstAlliance {
  number: number;
  name: string;
  captain: FirstTeamRef | null;
  picks: FirstTeamRef[];
  backup: FirstTeamRef | null;
  result: "Winner" | "Finalist" | null;
}

// ───────── Match video (YouTube recordings clipped into matches) ─────────

export interface Clip {
  matchId: number;
  label: string;
  level: string;
  red: FtcAlliance;
  blue: FtcAlliance;
  matchStart: number;
  start: number;
  end: number;
  url: string;
}

export interface Recording {
  _id: string;
  videoId: string;
  title: string;
  channel: string | null;
  lengthSeconds: number | null;
  season: number;
  eventCode: string;
  videoStart: string;
  shift: number;
  calibrated: boolean;
  source: "youtube-live" | "manual";
  clipCount?: number;
  clips?: Clip[];
  teamNames?: Record<string, string>;
}

export interface ClipEvent {
  season: number;
  code: string;
  name: string;
  first: string;
  last: string;
  matches: number;
}

export const patch = <T,>(path: string, data?: unknown) =>
  fetch(`${API_URL}${path}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, body.error || `Request failed (${r.status})`);
    return body as T;
  });

// ───────── Accounts ─────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "scout";
  active: boolean;
  pending: boolean; // invited, hasn't set a password yet
  lastLoginAt: string | null;
  createdAt: string | null;
  inviteExpires?: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  setupNeeded: boolean;
  setupEnabled: boolean;
}

/** Who added an app entry. */
export interface CreatedBy {
  id: string;
  name: string;
}
