// FTCScout API client.
// The REST API has no "list events" route, so events come from the GraphQL
// endpoint's eventsSearch query. It is CORS-open, so the browser can call it.

export const FTC_API = "https://api.ftcscout.org/graphql";
export const FTC_WEB = "https://www.ftcscout.org";
export const SEASON = 2026; // season year of the championship (2026-2027 game season)
export const REGION = "JM"; // FTCScout region code — "JM" = all Jamaican teams
export const EVENT_CODE = "JMCMP"; // championship event code — match scores come from here

export interface FtcEvent {
  code: string;
  name: string;
  type: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
  published: boolean;
  ongoing: boolean;
  finished: boolean;
  hasMatches: boolean;
  timezone: string;
  website: string | null;
  liveStreamURL: string | null;
  address: string | null;
  location: { city: string | null; state: string | null; country: string | null } | null;
}

interface GqlResponse {
  data?: { eventsSearch?: FtcEvent[] };
  errors?: { message: string }[];
}

const EVENTS_QUERY = `
  query ($season: Int!, $region: RegionOption, $limit: Int) {
    eventsSearch(season: $season, region: $region, limit: $limit) {
      code
      name
      type
      start
      end
      published
      ongoing
      finished
      hasMatches
      timezone
      website
      liveStreamURL
      address
      location {
        city
        state
        country
      }
    }
  }
`;

/** All FTCScout events for a season + region (throws on network/API errors). */
export async function fetchEvents(season = SEASON, region = REGION): Promise<FtcEvent[]> {
  const res = await fetch(FTC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: EVENTS_QUERY, variables: { season, region, limit: 100 } }),
  });
  if (!res.ok) throw new Error(`FTCScout responded HTTP ${res.status}`);
  const body = (await res.json()) as GqlResponse;
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data?.eventsSearch ?? [];
}

/** Link to the event on ftcscout.org (schedules, rankings, awards). */
export const ftcEventUrl = (season: number, code: string): string =>
  `${FTC_WEB}/events/${season}/${code}`;

/** "Jamaica College · Kingston 6, Jamaica" — address, then city/country. */
export const ftcEventLocation = (e: FtcEvent): string => {
  const place = [e.location?.city, e.location?.country].filter(Boolean).join(", ");
  return [e.address, place].filter(Boolean).join(" · ");
};

// per-event match schedules (REST — GraphQL has no lightweight list shape for these)

export const FTC_REST = "https://api.ftcscout.org/rest/v1";

export interface FtcMatchTeam {
  teamNumber: number | string;
  alliance?: string | null;
  noShow?: boolean;
}

export interface FtcAlliance {
  totalPoints?: number | null;
  totalPointsNp?: number | null; // penalties excluded — preferred when present
}

export interface FtcMatch {
  id: number;
  tournamentLevel?: string | null;
  scheduledStartTime?: string | null;
  actualStartTime?: string | null;
  hasBeenPlayed?: boolean;
  teams?: FtcMatchTeam[];
  scores?: { red?: FtcAlliance | null; blue?: FtcAlliance | null } | null;
}

/** "Q3", "DE #12", "Quals #7" — same labelling as the standalone app. */
export const matchLabel = (m: FtcMatch): string =>
  m.tournamentLevel === "Quals"
    ? `Q${m.id}`
    : `${m.tournamentLevel === "DoubleElim" ? "DE" : m.tournamentLevel || "Match"} #${m.id}`;

export const allianceScore = (a?: FtcAlliance | null): number | null =>
  a ? (a.totalPointsNp ?? a.totalPoints ?? null) : null;

/** All matches for one event (throws on network/API errors). */
export async function fetchEventMatches(season: number, code: string): Promise<FtcMatch[]> {
  const res = await fetch(`${FTC_REST}/events/${season}/${code}/matches`);
  if (!res.ok) throw new Error(`FTCScout responded HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("unexpected matches payload");
  return data as FtcMatch[];
}
