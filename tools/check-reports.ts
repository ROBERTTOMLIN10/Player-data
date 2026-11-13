/**
 * Checks every player's PDF report data against the raw database, independently of the report code.
 * Run it after any change to the report, the GPS/minutes data, or a sync:
 *
 *   npm run check:reports
 *
 * It exits non-zero (and lists what's wrong) if anything doesn't add up. What it checks:
 *   1. Season averages, team ranks and "of N" for every physical metric, recomputed from the raw GPS rows.
 *   2. Match totals (goals, assists, points, minutes, cards) against the box-score rows.
 *   3. The number of GPS games in the report against the GPS rows in range.
 *   4. Opponent logos: every game against an NCAA D1 team uses that team's NCAA.com logo (crisp, transparent).
 *   5. The ordinal helper (1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st) for every number the PDF could print.
 *   6. No "NaN" / "undefined" text anywhere in a report.
 */
import { getDb } from "../server/src/db/connection.js";
import { playerReportFor } from "../server/src/routes/players.js";
import { GLITCH_TOP_SPEED_MPH } from "../server/src/lib/metrics.js";
import { seasonStart } from "../server/src/lib/playerReport.js";
import { teamToday } from "../server/src/lib/readiness.js";
import { OUR_TEAM } from "../server/src/lib/follows.js";
import { ncaaLogoUrl } from "../server/src/ncaa/client.js";
import { ordinal } from "../web/src/lib/ordinal.js";

const db = getDb();
const problems: string[] = [];
const fail = (who: string, what: string) => problems.push(`${who}: ${what}`);

// ---- 5. Ordinals ----------------------------------------------------------------------------
for (let n = -300; n <= 1500; n++) {
  const a = Math.abs(n);
  const t = a % 100;
  const want = `${n}${t >= 11 && t <= 13 ? "th" : a % 10 === 1 ? "st" : a % 10 === 2 ? "nd" : a % 10 === 3 ? "rd" : "th"}`;
  if (ordinal(n) !== want) fail("ordinal", `${n} printed as "${ordinal(n)}", should be "${want}"`);
}

// ---- Raw data ---------------------------------------------------------------------------------
const today = teamToday();
const from = seasonStart(today);
type Row = Record<string, number | string | null> & { player_id: number; game_date: string; minutes: number | null };
const sessions = db
  .prepare(
    `SELECT s.*, g.game_date, mp.minutes AS minutes
     FROM gps_sessions s JOIN games g ON g.id = s.game_id
     LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
     WHERE g.game_date >= ? AND g.game_date <= ?`,
  )
  .all(from, today) as Row[];
const valid = (s: Row) => !(typeof s.top_speed_mph === "number" && s.top_speed_mph > GLITCH_TOP_SPEED_MPH);
const anyMinutes = sessions.some((s) => s.minutes != null);
const counted = sessions.filter((s) => valid(s) && (anyMinutes ? s.minutes != null && s.minutes > 0 : s.minutes == null || s.minutes > 0));
const byPlayer = new Map<number, Row[]>();
for (const s of counted) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
const mostGames = Math.max(0, ...[...byPlayer.values()].map((r) => r.length));
const minGames = Math.max(1, Math.min(3, mostGames));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const values = (rows: Row[], k: string) => rows.map((r) => r[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
const ncaaOpponent = new Map(
  (
    db
      .prepare(
        `SELECT substr(game_date, 1, 10) AS day, CASE WHEN home_seo = @us THEN away_seo ELSE home_seo END AS seo
         FROM ncaa_games WHERE home_seo = @us OR away_seo = @us`,
      )
      .all({ us: OUR_TEAM }) as { day: string; seo: string | null }[]
  )
    .filter((r) => r.seo)
    .map((r) => [r.day, r.seo as string]),
);

// ---- Each player's report ---------------------------------------------------------------------
const players = db.prepare("SELECT id, canonical_name FROM players ORDER BY canonical_name").all() as { id: number; canonical_name: string }[];
let checkedPlayers = 0;
let checkedValues = 0;
for (const p of players) {
  const mineAll = sessions.filter((s) => s.player_id === p.id);
  const hasStats = (db.prepare("SELECT COUNT(*) AS n FROM player_game_stats WHERE player_id = ?").get(p.id) as { n: number }).n > 0;
  if (!mineAll.length && !hasStats) continue;
  const report = playerReportFor(p.id, undefined, undefined) as any;
  if (!report) {
    fail(p.canonical_name, "no report could be built");
    continue;
  }
  checkedPlayers++;
  const who = p.canonical_name;

  // 1. Averages and ranks
  const mine = byPlayer.get(p.id) ?? [];
  for (const m of report.physical as { key: string; label: string; avg: number | null; rank: number | null; of: number }[]) {
    const wantAvg = mean(values(mine, m.key));
    if ((wantAvg === null) !== (m.avg === null) || (wantAvg !== null && Math.abs(wantAvg - (m.avg as number)) > 1e-6)) {
      fail(who, `${m.label} average is ${m.avg}, raw data says ${wantAvg}`);
    }
    const pool = [...byPlayer.entries()]
      .filter(([, rows]) => rows.length >= minGames)
      .map(([pid, rows]) => ({ pid, v: mean(values(rows, m.key)) }))
      .filter((r): r is { pid: number; v: number } => r.v !== null)
      .sort((a, b) => b.v - a.v);
    const at = pool.findIndex((r) => r.pid === p.id);
    const wantRank = at >= 0 ? at + 1 : null;
    if (m.rank !== wantRank || m.of !== pool.length) fail(who, `${m.label} rank is ${m.rank}/${m.of}, raw data says ${wantRank}/${pool.length}`);
    checkedValues++;
  }

  // 2. Match totals
  const t = db
    .prepare(
      `SELECT COALESCE(SUM(goals),0) AS goals, COALESCE(SUM(assists),0) AS assists, COALESCE(SUM(points),0) AS points,
              COALESCE(SUM(minutes),0) AS minutes, COALESCE(SUM(yellow_cards),0) AS yellow, COALESCE(SUM(red_cards),0) AS red
       FROM player_game_stats pgs JOIN schedule_games sg ON sg.id = pgs.schedule_game_id
       WHERE pgs.player_id = ? AND sg.game_date >= ? AND sg.game_date <= ?`,
    )
    .get(p.id, from, today) as Record<string, number>;
  const rt = report.match.totals;
  for (const [key, want, got] of [
    ["goals", t.goals, rt.goals],
    ["assists", t.assists, rt.assists],
    ["points", t.points, rt.points],
    ["minutes", Math.round(t.minutes), rt.minutes],
    ["yellow cards", t.yellow, rt.yellow_cards],
    ["red cards", t.red, rt.red_cards],
  ] as [string, number, number][]) {
    if (want !== got) fail(who, `${key} total is ${got}, box scores say ${want}`);
  }

  // 3. GPS game count
  if (report.gpsGames.length !== mineAll.length) fail(who, `${report.gpsGames.length} GPS games in the report, ${mineAll.length} GPS rows in the data`);

  // 4. Opponent logos
  for (const g of [...report.gpsGames, ...report.match.games] as { game_date: string; opponent: string; opponent_logo_url?: string | null }[]) {
    const seo = ncaaOpponent.get(g.game_date.slice(0, 10));
    if (seo && g.opponent_logo_url !== ncaaLogoUrl(seo)) fail(who, `${g.game_date} ${g.opponent}: logo is ${g.opponent_logo_url ?? "missing"}, should be the NCAA.com logo for ${seo}`);
  }

  // 6. No broken text
  const text = JSON.stringify(report);
  if (/\bNaN\b|\bundefined\b|\bInfinity\b/.test(text)) fail(who, 'the report contains "NaN", "undefined" or "Infinity"');
}

console.log(`Checked ${checkedPlayers} players: ${checkedValues} averages and ranks, match totals, GPS game counts and opponent logos; ordinals for -300..1500.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("All good: every number checked matches the raw data.");
