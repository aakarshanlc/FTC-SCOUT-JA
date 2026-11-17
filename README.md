# FTC Scout

Scouting dashboard for FIRST Tech Challenge Jamaica: championship rankings, scrimmage pit reports, the season calendar, and per-team scouting pages.

```
ftc-scout/
├── client/   Next.js 16 front end (App Router, React 19, SWR)      → http://localhost:3000
├── server/   Express 5 + Mongoose API                               → http://localhost:4000
└── docker-compose.yml   MongoDB 8
```

## How data flows

- **Google Sheet → MongoDB.** The server pulls the scouting sheet (tabs `Teams`, `Robot`, `Matches`, `Scrimmages`, `Events`) every `SYNC_INTERVAL_SECONDS` and on **Sync now**. Sheet rows are replaced on each sync, so edit those rows in the sheet.
- **FTCScout → MongoDB.** Season events for the region are pulled from the FTCScout GraphQL API. Per-event match results are proxied live (cached 60s).
- **App → MongoDB.** Matches, scrimmage reports and events logged on the **Scout** page are saved with `source: "manual"`. The sync never touches them, and they can be deleted from the team page.

The client only talks to the Express API (`NEXT_PUBLIC_API_URL`) and refreshes every 30 seconds.

## Run locally

Requires Node 20.6+ and Docker (or any MongoDB at `MONGODB_URI`).

```bash
docker compose up -d                       # MongoDB on :27017
cd server && cp .env.example .env && npm install && npm run dev
cd client && cp .env.example .env.local && npm install && npm run dev
```

Open http://localhost:3000. `npm run sync` in `server/` does a one-off pull without starting the API.

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/health` | DB status |
| GET | `/api/overview` | Dashboard summary |
| GET | `/api/teams?q=` | Championship standings |
| POST | `/api/teams` | Add a team |
| GET | `/api/teams/:number` | Team detail: stats, rank, matches, scrimmages, robot |
| GET | `/api/search?q=` | Team search |
| GET / POST | `/api/matches` | List (`?team=`) / log a match |
| DELETE | `/api/matches/:id` | Delete an app-logged match |
| GET / POST | `/api/scrimmages` | Standings (`?event=`) / log a report |
| DELETE | `/api/scrimmages/:id` | Delete an app-logged report |
| GET / POST | `/api/events` | `{ upcoming, past }` / add an event |
| DELETE | `/api/events/:id` | Delete an app-added event |
| GET | `/api/events/:code/matches` | FTCScout match results |
| GET / POST | `/api/sync` | Sync history / sync now |
| GET | `/events.ics` | Subscribable iCalendar feed |

## Configuration

`server/.env` sets `PORT`, `MONGODB_URI`, `CLIENT_ORIGIN` (CORS), `SHEET_ID`, `SYNC_INTERVAL_SECONDS`, `FTC_SEASON` and `FTC_REGION`. `client/.env.local` sets `NEXT_PUBLIC_API_URL`. The sheet must be shared as **Anyone with the link**. Headers are matched case-insensitively by keyword (`number`, `name`, `total`, …).
