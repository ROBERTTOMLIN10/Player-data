# FAU Men's Soccer dashboard: rules for the player PDF reports

These are standing rules from Rob (assistant coach). Follow them on every change to the PDFs, the report data, the GPS/minutes data, or the logos and photos.

## Data must be right (check before you finish)

- **Run `npm run check:reports`** after any change to the report (`server/src/lib/playerReport.ts`, `server/src/routes/players.ts`, `web/src/lib/playerPdf.ts`), to the GPS/minutes data, or after a sync. It recomputes every player's averages, ranks, match totals, GPS game counts and opponent logos from the raw database and fails if anything differs. Fix what it reports; don't loosen the check.
- **Per game, never per 90.** GPS totals include about 2.6 miles of warm-up running, so per-90 figures inflate short appearances. The PDFs show per-game averages and ranks only.
- **One ranking pool.** Everyone is ranked against teammates with 3+ games (so "of 21" means the same in every report). Players with fewer GPS games show "–", not a rank against a smaller pool.
- **Glitched sessions** (top speed above 25 mph, `GLITCH_TOP_SPEED_MPH`) are left out of averages and ranks, and the game page says so. Don't invent or patch the numbers; a corrected Titan export can be uploaded on the Data page with Replace.
- **Season totals** on page 3 (distance, sprint distance, load) add up exactly the games in the game-by-game table, with distances in miles, kilometres and yards.
- **Spelling and numbers:** every rank uses `ordinal()` from `web/src/lib/ordinal.ts` (1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st; never "3th"). Percent differences read `+25%`, `-12%` or `even`, never an ordinal. Read every word of visible text for typos.
- Never show an average, rank or total you haven't verified against the raw data.

## Logos and photos: crisp, sharp, no background

- **Opponents:** every NCAA D1 opponent uses its NCAA.com logo (transparent SVG, `ncaaLogoUrl(seo)`), matched by game date through `ncaa_games` (see `opponentLogos` in `playerReportFor`). Never use the schedule's fausports.com PNGs (small, some with white backgrounds). Non-D1 opponents (e.g. Miami Dade, PBA) show the initials tile.
- **FAU's own logo** is the NCAA.com `fla-atlantic` logo: in the bio on page 1 just before the number and name, and in the header of every other page just before the number and name.
- **Resolution:** SVG logos are rasterised large (FAU 1000px, opponents 700px) so they stay sharp at every size. Player photos stay at full detail (up to 1600px, high-quality JPEG); never shrink a photo to a thumbnail.
- The image route (`/api/players/report-image`) only passes through roster photos, schedule logos, and NCAA.com logos for teams the app has a game for.
- In the preview build (`tools/preview/`), our players' headshots are kept at 800x1000 and the FAU/opponent logos are embedded so preview PDFs match.

## Layout rules already agreed

- Page 3: no shots chart; season totals (distance, sprint distance in mi/km/yd, and load) fill the space under the game-by-game table down to the footer.
- Game pages (6 onward): no percent-vs-squad column before the yellow team rank.
- Page 1 "Per game" box (distance, sprint distance, load, sprints, explosive efforts: his number, the team's, his rank). No per-90 anywhere.

## After every change (so the preview always matches)

Rob wants to see every change in the preview on the right of the Claude app, at all times. The local folder, GitHub and the preview all use ONE branch: `claude/friendly-dijkstra-s2fxp1` (the hourly preview refresh builds from it). Do not work on any other branch.

1. `npm run build`, restart the dashboard on port 4000, and look at the change in the browser (for a PDF: generate a real one and check pages 1, 2, 3 and a game page; run `npm run check:reports`).
2. Commit and `git push` (one branch, so one push).
3. **Update the preview right away** (the `update-preview` skill): build with `tools/preview/build.sh` from a checkout of the pushed branch, publish `app.js`, `app.css` and `games.json`, open the artifact, and tell Rob what to click. Never finish a change without doing this, and never leave the preview behind the local app.
4. If the first publish is refused because the hourly job just published, read the live `app.js`, then publish again.

# Tables across the site

- **Every data table sorts on a header click.** Use `useTableSort` (`web/src/lib/useTableSort.ts`) and `SortTh` (`web/src/components/SortTh.tsx`) for any new or changed table: the first click sorts the column highest to lowest (newest first for dates, A to Z for names), the next click flips it, empty values stay at the bottom, and a red arrow marks the active column. Until a column is clicked, rows keep their natural order (e.g. newest first, or furthest behind first).
- A column's sort must match what is shown (e.g. a "3–2" score sorts by goals scored). Keep one sort key per visible column.
- Tables already covered: the player's GPS game table and match stats (coach player page and My GPS), team stats (players, goalkeepers, game log), GPS games and squad fitness, readiness, RPE sessions and scores, the home results table, NCAA player game logs, NCAA game lineups, the game roster table and the NCAA team squad.
