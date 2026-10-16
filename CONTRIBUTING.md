# Contributing

## Project layout

```
src/app/                  Next.js App Router — layout, /, /scrimmages, /team/[number]
src/components/           Navbar (search + theme), ScoutProvider (data), UI primitives
src/lib/sheet.ts          Google Sheets fetching, aggregation, ranking, sorting
src/app/globals.css       The light/dark design system (plain CSS over Tailwind's reset)
```

Pages are client components: they read sheet data from `useScout()` and never fetch for themselves. `ScoutProvider` loads each tab in its own `try`/`catch` and refreshes everything every 30 seconds, so a missing `Scrimmages` tab can never break the Championship view.

## Changing the data source

The sheet is identified by `SHEET_ID` in [src/lib/sheet.ts](./src/lib/sheet.ts). To point the app at a different sheet, change that constant and confirm:

1. The sheet is shared as **Anyone with the link** (the `gviz/tq?tqx=out:csv` endpoint answers for anonymous readers).
2. Every tab listed in the README exists and has a header row.
3. Tab names match exactly, including spaces — `SCRIMMAGE_TAB` is looked up by name.

Adding a *new* tab means adding a `loadTab("TabName")` call in `ScoutProvider` and a place to render the rows. Load optional tabs in their own `try`/`catch` so one missing tab cannot blank the rest of the dashboard.

## Columns and lookups

Rows are normalized to upper-cased, trimmed headers by `normalizeRow`, then read through `col(row, …words)`, which returns the value of the first column whose header **contains** one of the given words. Consequences worth remembering:

- `col(row, "number")` matches `Number`, `TEAM NUMBER`, `number `, etc.
- Keywords are upper-cased before matching, so the casing of the header never matters.
- Keywords are substrings, so `"name"` can also match `TEAM NAME` — put the specific column first if ordering matters, and prefer distinctive keywords.
- Keep the `Number` column numeric and consistent; `rowsFor` compares it as a trimmed string, and rows without one are skipped by the ranking tables.

Aggregation goes through `agg(rows, field)` (count / average / best / raw values) and `champRows` / `scrimRows`, which also attach `rank` — rank 1 is the best average among teams that have actually played.

## Styling

[globals.css](./src/app/globals.css) carries the design system as plain CSS custom properties. Every colour comes from a token in `:root`, and dark mode is a second set of tokens under `:root[data-theme="dark"]` — **add new tokens to both blocks**, or they will vanish in one theme. A tiny inline script in [layout.tsx](./src/app/layout.tsx) applies the stored (or system) theme before paint so there is no flash.

Tailwind stays available for utilities, but the component look (`.card`, `.stat`, `.pill`, `.banner`, tables) lives in globals.css so it can respond to the theme tokens. Prefer extending a class there over hard-coding colours in JSX.

## Adding a page

1. Create `src/app/your-page/page.tsx` with `"use client"` and read data from `useScout()` — pages should not fetch.
2. Keep search boxes, dropdowns, and the selected tab in `useState` so a background refresh does not wipe the user's view.
3. Reuse `Banner`, `StatCard`, `SortableTable`, `RawTable`, and `Chart` from [src/components/ui.tsx](./src/components/ui.tsx) instead of re-implementing them.
4. Add the route to the navbar's `LINKS` in [src/components/Navbar.tsx](./src/components/Navbar.tsx) if it deserves a top-level link.

## Validate before you push

```bash
bun run check   # tsc --noEmit
bun run build   # production build, also runs Next's TypeScript pass
```

Both must pass. For behaviour, run `bun run dev` and check: the ranking table loads and sorts on header clicks, the filter narrows by number/name/organization, a row click opens the team page and Back returns, the navbar search's Enter opens the top hit, the event dropdown filters the scrimmage table, the 🌓 button switches themes and survives a reload, and a failing tab shows its error banner without blanking the other pages.
