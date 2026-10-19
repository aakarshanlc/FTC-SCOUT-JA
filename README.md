# FTC Scouting

FTC Scouting is a scouting dashboard for FIRST Tech Challenge (FTC): championship rankings, scrimmage results, and per-team scouting pages read live from a shared Google Sheet. It is built with Next.js, TypeScript, and Tailwind CSS, with a light/dark design system in plain CSS.

## Run locally

Use npm with the checked-in `package-lock.json`:

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js (usually `http://localhost:3000`). For a production build, run `npm run build`, then `npm start`.

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Championship teams ranked by average match score, with a number/name/organization filter |
| `/scrimmages` | Per-team scrimmage averages, an event dropdown, and Teams / Entries / High score / Average cards |
| `/team/[number]` | A team page: robot info, score charts, and the raw Matches and Scrimmages rows |

Everywhere else: the navbar has a global team search (number or name, Enter opens the top hit) and a 🌓 dark-mode toggle that persists in `localStorage` and otherwise follows the system preference. Tables sort by clicking a column header, rows link to the team page, and all data refreshes every 30 seconds.

## Content

All scouting data comes from the Google Sheet identified by `SHEET_ID` in [src/lib/sheet.ts](./src/lib/sheet.ts). It must be shared as **Anyone with the link**, and every tab it reads must exist with a header row:

| Tab | Read by | Expected columns |
| --- | --- | --- |
| `Teams` | Rankings, search | Number, Name, Organization |
| `Robot` | Team pages | Number, plus any robot details (Notes, …) |
| `Matches` | Rankings, team pages | Number, Total, Auto, Teleop, optional Match label |
| `Scrimmages` | Scrimmages page | Scrimmage, Number, Name, Organization, Auto, Teleop, Flower, Total |

Header matching is case-insensitive and ignores surrounding spaces: a column is found by the first header that *contains* a keyword (`number`, `name`, `organization`, `total`, …). Adding a column to a tab requires no code change unless you want it shown in a hand-built table.

A team is ranked only once it has logged matches or scrimmage entries; teams without a Number in the sheet are skipped because they cannot be looked up.

Implementation notes: [src/lib/sheet.ts](./src/lib/sheet.ts) holds fetching, normalization, aggregation, and ranking; [src/components/ScoutProvider.tsx](./src/components/ScoutProvider.tsx) loads the tabs and serves them through context; page components live under [src/app/](./src/app/). See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add tabs, columns, and pages.

## Validate

```bash
npm run check   # TypeScript
npm run build   # production build
```

## Deploy on Vercel

Import the repository into Vercel and set the production branch to `main`. Vercel should detect Next.js automatically. The install command is `npm install` and the build command is `npm run build`; the output is the Next.js default. Check the Vercel deployment log for the commit SHA and build errors when a GitHub push does not appear on the live site.

The Vercel project and its Git integration are configured in the Vercel dashboard; this repository has no checked-in `vercel.json` or project-link metadata.
