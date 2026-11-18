# FTC Scout — notes for Claude and contributors

Scouting site for FIRST Tech Challenge teams in **Jamaica**. Two apps plus a database:

```
client/   Next.js 16 (App Router, React 19, SWR, Tailwind 4 + hand-written CSS)  :3000
server/   Express 5 + Mongoose, ESM, `node --watch`                              :4000
docker-compose.yml   MongoDB 8 (container ftc-scout-mongo, volume ftc-scout-mongo)
```

**Production = one Vercel project** (`ftc-scout-jamaica`, root `client/`, https://ftc-scout-jamaica.vercel.app).
The Express app from `server/` is mounted inside Next at `client/src/pages/api/[[...path]].js`
(server is linked as the `ftc-scout-server` package; the client's `postinstall` installs its deps).
`NEXT_PUBLIC_API_URL="/"` there means same-origin. Env on Vercel: `MONGODB_URI` (Atlas, Network Access
0.0.0.0/0), `FTC_API_USER`, `FTC_API_TOKEN`, optional `YOUTUBE_API_KEY`. Daily cron: `client/vercel.json`.
Deploys come from the fork `revolverking927/FTC-SCOUT-JA`, branch `video-lab`.

## Run

```bash
docker compose up -d                                   # MongoDB
cd server && npm install && npm run dev                # needs server/.env (copy .env.example)
cd client && npm install && npm run dev                # needs client/.env.local (copy .env.example)
cd server && npm run sync -- --full                    # one-off: re-import every data source
```

Checks: `cd client && npx tsc --noEmit && npx next build`. There are no automated tests yet.

## Data sources (all land in MongoDB; the client only talks to the Express API)

| Source | Code | What it provides |
| --- | --- | --- |
| Google Sheet (gviz CSV) | `server/src/services/sheet.js`, `sync.js` | Teams, Robot, Matches, Scrimmages, Events tabs. Rows are replaced on each sync; app entries (`source: "manual"`) are never touched. |
| FTCScout GraphQL | `services/ftcscout.js`, `ftcImport.js` | Region teams; per-season OPR/world rank (`TeamSeason`), event results + awards (`Participation`), matches with a Jamaican team (`FtcMatch`). Past seasons import once; recent seasons every 10 min. |
| FIRST FTC Events API | `services/firstImport.js` | Optional (`FTC_API_USER`/`FTC_API_TOKEN`). Official awards, alliance selections, Worlds advancement, robot names, sponsors, venues (`FirstEvent`). Every 15 min. Their website must **not** be scraped — API only, and keep the footer credit link. |
| YouTube (metadata only) | `services/youtube.js`, `routes/clips.js` | Match video. A `Recording` = video ID + event + wall-clock start; clips are computed start/end positions. **Never download videos.** Start time comes from the YouTube Data API (`YOUTUBE_API_KEY`), else the watch page (blocked from Vercel's IPs — don't work around the bot check), else oEmbed + one known match start ("anchor"). |

Rules that matter:
- **Jamaica only.** FTCScout's JM region and FIRST event lists include foreign teams; team lists keep only `country === "Jamaica"`. Visiting teams still appear on event pages. Scrimmages held abroad show under "Jamaican teams abroad".
- Names/schools from the sheet win; FTCScout/FIRST only fill empty fields.
- FTCScout season `2025` = the 2025–26 game season (its championship is in Feb 2026). UI shows `seasonLabel(2025)` → "2025–26".

## Server routes

- `/api/*` (`routes/api.js`): overview, teams (scouting rankings), search, matches/scrimmages/events CRUD for app entries, sync.
- `/api/ftc/*` (`routes/ftc.js`): seasons, OPR rankings, team history, team matches (with `clip`), event detail (rankings, matches with `clip`, awards preferring FIRST's list, alliances, advancement, registered teams, venue).
- `/api/clips/*` (`routes/clips.js`): recordings CRUD; POST takes `{url, season, eventCode}` (or `anchorMatchId` + `anchorAt` for non-livestream uploads); PATCH `{matchId, at}` fine-tunes all clips. Rejects unplayable videos.
- `/api/scrims/*` (`routes/scrimmages.js`): merged scrimmage list + detail (teams, matches, benchmarks, robot-build breakdown from pit notes).
- `/events.ics`: subscribable calendar (the Events page has Google/Apple/Outlook subscribe links; feed asks apps to refresh every 6h).
- `/api/updates/*` (`routes/updates.js`, `services/mail.js`, `services/updates.js`): email updates. Double opt-in sign-up (`Subscriber`, unconfirmed rows expire in 7 days), confirm/unsubscribe by token (unsubscribe deletes the row), admin `POST /send`. The daily cron also sends event reminders 7 days and 1 day out, logged in `MailLog` so nothing goes twice. Needs `SMTP_URL` + `MAIL_FROM`; without them emails print to the server log locally and sign-up is off on Vercel.

## Client pages

`/` overview · `/rankings` (FTCScout OPR by season | our scouting) · `/scrimmages` (All scrimmages list; opening one slides in a tab — state in `?open=a,b&s=a`) · `/events` and `/events/[season]/[code]` · `/team/[number]` (competition history, Watch buttons) · `/clips` (Video: paste YouTube link → clips) · `/scout` (data entry) · `/about` · `/privacy` · `/updates` (email sign-up, plus `/updates/confirm` and `/updates/unsubscribe`, which act on a button press so email link scanners can't trigger them) · `/admin` (team, invites, email updates).

Copy style: write like a person. No em dashes in UI text, no hype; short plain sentences. Public pages never show internal status (sheet sync, API host); scouts see a small "Synced …" note next to Sync now.

Shared UI: `components/ui.tsx` (tiles, tables, toast), `components/ftc.tsx` (MatchList with Watch buttons, AwardList, SeasonChips), `components/ClipPlayer.tsx` (pop-up player), `lib/youtube.ts` (IFrame API loader), `lib/api.ts` (types + fetch helpers), `lib/format.ts`.

## Gotchas

- **Cache Components is enabled.** Client components using `useParams`/`usePathname`/`useSearchParams` must be under `<Suspense>` or `next build` fails (`CLIENT_HOOK_DYNAMIC`). Pattern: `page.tsx` (server) wraps a `*-view.tsx` client component in Suspense.
- **Stale CSS / hydration mismatches in dev** after editing `globals.css` or the nav: stop the client dev server and `rm -rf client/.next` — a plain restart may keep serving the old chunk.
- The server restarts on every save (`node --watch`); retry API calls made right after edits.
- Adding the `pages/` dir widened Next's hook types: `useParams()/useSearchParams()/usePathname()` are typed nullable — use `!` (they're never null in the App Router).
- Design tokens live at the top of `client/src/app/globals.css` (light + `[data-theme="dark"]`); fonts are Barlow Condensed (display), Inter (body), JetBrains Mono (numbers) via `--ff-*` variables.
- Never commit `server/.env` (FIRST API token) or `client/.env.local`; `.env.example` files are committed.
