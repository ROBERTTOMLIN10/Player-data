import { fetchConferences, fetchRankingTable, fetchScoreboard, fetchStatTable } from "../ncaa/client.js";
import { gamesOn, hasGamesOn, recordRanks, setCache, upsertGames } from "../ncaa/store.js";
import { shiftDate, teamToday } from "../lib/readiness.js";

/**
 * Keeps NCAA D1 men's soccer data fresh from NCAA.com:
 * - Today's scoreboard every minute while any game is live or about to start,
 *   every 15 minutes otherwise; yesterday's until every game is final.
 * - The whole season's results once a day (for standings).
 * - Stat leaders and rankings every 6 hours.
 * Set NCAA_SYNC=off to disable (e.g. local use without internet).
 */
export interface StatCategory {
  key: string; // e.g. "individual-570"
  kind: "individual" | "team";
  id: number;
  label: string;
  group: "Scoring" | "Shooting" | "Discipline" | "Results" | "Defense";
}

export const STAT_CATEGORIES: StatCategory[] = [
  { key: "individual-570", kind: "individual", id: 570, label: "Total Points", group: "Scoring" },
  { key: "individual-573", kind: "individual", id: 573, label: "Total Goals", group: "Scoring" },
  { key: "individual-568", kind: "individual", id: 568, label: "Total Assists", group: "Scoring" },
  { key: "individual-4", kind: "individual", id: 4, label: "Points Per Game", group: "Scoring" },
  { key: "individual-5", kind: "individual", id: 5, label: "Goals Per Game", group: "Scoring" },
  { key: "individual-909", kind: "individual", id: 909, label: "Game-Winning Goals", group: "Scoring" },
  { key: "individual-974", kind: "individual", id: 974, label: "Shots Per Game", group: "Shooting" },
  { key: "individual-976", kind: "individual", id: 976, label: "Shots on Goal Per Game", group: "Shooting" },
  { key: "team-30", kind: "team", id: 30, label: "Scoring Offense", group: "Scoring" },
  { key: "team-32", kind: "team", id: 32, label: "Goals Against Average", group: "Defense" },
  { key: "team-1222", kind: "team", id: 1222, label: "Goal Differential", group: "Results" },
  { key: "team-33", kind: "team", id: 33, label: "Win Percentage", group: "Results" },
  { key: "team-31", kind: "team", id: 31, label: "Shutout Percentage", group: "Defense" },
  { key: "team-975", kind: "team", id: 975, label: "Shots Per Game", group: "Shooting" },
  { key: "team-977", kind: "team", id: 977, label: "Shots on Goal Per Game", group: "Shooting" },
  { key: "team-1171", kind: "team", id: 1171, label: "Corner Kicks Per Game", group: "Shooting" },
  { key: "team-546", kind: "team", id: 546, label: "Fouls Per Game", group: "Discipline" },
  { key: "team-545", kind: "team", id: 545, label: "Yellow Cards", group: "Discipline" },
];

export const RANKINGS = [
  { key: "rankings-poll", slug: "united-soccer-coaches", label: "United Soccer Coaches Top 25" },
  { key: "rankings-rpi", slug: "ncaa-mens-soccer-rpi", label: "NCAA RPI" },
];

const SEASON_START_MONTH_DAY = "08-15";
const TICK_MS = 60_000;
const IDLE_REFRESH_MS = 15 * 60_000;
const STATS_REFRESH_MS = 6 * 60 * 60_000;

const lastRun: Record<string, number> = {};
let running = false;

function due(key: string, intervalMs: number): boolean {
  return Date.now() - (lastRun[key] ?? 0) >= intervalMs;
}

async function syncDate(date: string) {
  const games = await fetchScoreboard(date);
  upsertGames(games);
  lastRun[`date:${date}`] = Date.now();
  return games;
}

/** Fetches a date on demand (e.g. someone opens a past or future date), at most every 10 minutes. */
export async function ensureDate(date: string) {
  if (hasGamesOn(date) && !due(`date:${date}`, 10 * 60_000)) return;
  if (date > shiftDate(teamToday(), 60) || date < `${date.slice(0, 4)}-${SEASON_START_MONTH_DAY}`) return;
  try {
    await syncDate(date);
  } catch (err) {
    console.error(`[ncaa] scoreboard ${date} failed: ${(err as Error).message}`);
  }
}

/** Is any game today live, or starting within 10 minutes / already started but not final? */
function todayIsActive(today: string): boolean {
  const now = Date.now() / 1000;
  return gamesOn(today).some(
    (g) => g.state === "I" || (g.state !== "F" && g.start_epoch !== null && g.start_epoch - 600 <= now),
  );
}

export async function syncSeason(today = teamToday()) {
  const start = `${today.slice(0, 4)}-${SEASON_START_MONTH_DAY}`;
  for (let d = start; d <= today; d = shiftDate(d, 1)) {
    const final = gamesOn(d).every((g) => g.state === "F");
    if (hasGamesOn(d) && final && d < shiftDate(today, -1)) continue;
    try {
      await syncDate(d);
    } catch (err) {
      console.error(`[ncaa] scoreboard ${d} failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  // Upcoming week, for fixtures.
  for (let i = 1; i <= 7; i++) await ensureDate(shiftDate(today, i));
}

export async function syncStatsAndRankings() {
  try {
    setCache("conferences", await fetchConferences(Number(teamToday().slice(0, 4))));
  } catch (err) {
    console.error(`[ncaa] conferences failed: ${(err as Error).message}`);
  }
  for (const c of STAT_CATEGORIES) {
    try {
      // Team tables: every team (~5 pages) so conference views are complete. Players: top 200.
      const table = await fetchStatTable(c.kind, c.id, c.kind === "team" ? 6 : 4);
      setCache(`stats-${c.key}`, table);
      recordRanks(`stats-${c.key}`, table);
    } catch (err) {
      console.error(`[ncaa] stats ${c.label} failed: ${(err as Error).message}`);
    }
  }
  for (const r of RANKINGS) {
    try {
      const table = await fetchRankingTable(r.slug);
      if (table) {
        setCache(r.key, table);
        recordRanks(r.key, table);
      }
    } catch (err) {
      console.error(`[ncaa] ${r.label} failed: ${(err as Error).message}`);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  const today = teamToday();
  try {
    if (due("season", 24 * 60 * 60_000)) {
      lastRun.season = Date.now();
      await syncSeason(today);
    }
    if (due(`date:${today}`, todayIsActive(today) ? TICK_MS - 5_000 : IDLE_REFRESH_MS)) await syncDate(today);
    const yesterday = shiftDate(today, -1);
    if (!gamesOn(yesterday).every((g) => g.state === "F") && due(`date:${yesterday}`, IDLE_REFRESH_MS)) {
      await syncDate(yesterday);
    }
    if (due("stats", STATS_REFRESH_MS)) {
      lastRun.stats = Date.now();
      await syncStatsAndRankings();
    }
  } catch (err) {
    console.error(`[ncaa] sync failed: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

let started = false;

export function startNcaaSync() {
  if (started || process.env.NCAA_SYNC === "off") return;
  started = true;
  setTimeout(() => void tick(), 20_000); // let the server finish booting
  setInterval(() => void tick(), TICK_MS);
}
