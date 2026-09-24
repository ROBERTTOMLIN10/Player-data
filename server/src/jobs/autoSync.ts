import { syncSchedule, type SyncScheduleSummary } from "../import/syncSchedule.js";
import { syncMinutes, type SyncMinutesSummary } from "../import/importMinutes.js";
import { getDb } from "../db/connection.js";
import { shiftDate, teamClock } from "../lib/readiness.js";

// How often (in minutes) to automatically re-check fausports.com for schedule
// changes, new box scores, and updated minutes — so results/stats show up on
// their own after a game instead of requiring someone to click "Sync" in the
// Data page. Both syncSchedule() and syncMinutes() are cheap, idempotent
// upserts (keyed by date/opponent/player), so re-running them on a timer is
// safe. Only GPS file imports remain manual, since those come from files the
// coach uploads (Titan exports), not something published on the web.
const INTERVAL_MINUTES = Number(process.env.AUTO_SYNC_INTERVAL_MINUTES) || 30;
// After an FAU game, check far more often until its result and box score are in.
const GAME_INTERVAL_MINUTES = 5;
const INITIAL_DELAY_MS = 15_000; // let the server finish booting first

/** "7 p.m." / "7:30 PM" / "13:00" -> minutes after midnight; null for TBA or blank. */
export function parseGameTime(text: string | null): number | null {
  const m = (text ?? "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3]?.startsWith("p") || (!m[3] && Number(m[1]) >= 12)) hour += 12;
  return hour * 60 + Number(m[2] ?? 0);
}

/**
 * Is an FAU game waiting on its result? Played today or yesterday (team time),
 * kicked off at least 90 minutes ago (noon if the time isn't listed), within
 * the last 12 hours, and fausports.com doesn't have its result and box score yet.
 */
export function gameAwaitingResult(): { opponent: string; game_date: string } | null {
  const now = teamClock();
  const games = getDb()
    .prepare(
      `SELECT sg.game_date, sg.game_time, sg.opponent
       FROM schedule_games sg
       WHERE sg.game_date IN (?, ?)
         AND (sg.status IS NULL OR NOT EXISTS (SELECT 1 FROM game_team_totals t WHERE t.schedule_game_id = sg.id))`,
    )
    .all(now.date, shiftDate(now.date, -1)) as { game_date: string; game_time: string | null; opponent: string }[];
  for (const g of games) {
    const kickoff = parseGameTime(g.game_time) ?? 12 * 60;
    const minutesSince = now.minutes - kickoff + (g.game_date === now.date ? 0 : 24 * 60);
    if (minutesSince >= 90 && minutesSince <= 12 * 60) return g;
  }
  return null;
}

interface AutoSyncResult {
  schedule: SyncScheduleSummary | null;
  minutes: SyncMinutesSummary | null;
}

let started = false;
let running = false;
let lastRunAt: string | null = null;
let lastResult: AutoSyncResult | null = null;
let lastError: string | null = null;
let nextRunAt: string | null = null;

let lastRunMs = 0;

function currentIntervalMinutes() {
  return gameAwaitingResult() ? GAME_INTERVAL_MINUTES : INTERVAL_MINUTES;
}

function scheduleNextRunEstimate() {
  nextRunAt = new Date(Date.now() + currentIntervalMinutes() * 60_000).toISOString();
}

async function runOnce() {
  if (running) return;
  running = true;
  lastError = null;
  const result: AutoSyncResult = { schedule: null, minutes: null };

  console.log("[auto-sync] Checking fausports.com for schedule/box score updates...");
  try {
    result.schedule = await syncSchedule();
  } catch (err) {
    lastError = `schedule sync failed: ${(err as Error).message}`;
    console.error(`[auto-sync] ${lastError}`);
  }

  try {
    result.minutes = await syncMinutes();
  } catch (err) {
    const msg = `minutes sync failed: ${(err as Error).message}`;
    lastError = lastError ? `${lastError}; ${msg}` : msg;
    console.error(`[auto-sync] ${msg}`);
  }

  lastResult = result;
  lastRunAt = new Date().toISOString();
  lastRunMs = Date.now();
  running = false;
  scheduleNextRunEstimate();
  console.log(`[auto-sync] Done. Next check in ~${currentIntervalMinutes()} minute(s).`);
}

/** Runs every minute; syncs when the current interval (5 min after a game, else 30) has passed. */
function tick() {
  if (Date.now() - lastRunMs >= currentIntervalMinutes() * 60_000 - 5_000) void runOnce();
}

/**
 * Kicks off the background sync loop. Safe to call once at server startup;
 * subsequent calls are no-ops. Runs an initial check shortly after boot, then
 * every 30 minutes, or every 5 minutes once an FAU game should have finished
 * until its result and box score are in.
 */
export function startAutoSync() {
  if (started) return;
  started = true;
  console.log(
    `[auto-sync] Background sync enabled — will check fausports.com for schedule, game stats, and minutes updates every ${INTERVAL_MINUTES} minute(s), every ${GAME_INTERVAL_MINUTES} after a game until its box score is in.`,
  );
  scheduleNextRunEstimate();
  setTimeout(() => {
    void runOnce();
    setInterval(tick, 60_000);
  }, INITIAL_DELAY_MS);
}

export function getAutoSyncStatus() {
  return {
    enabled: started,
    intervalMinutes: INTERVAL_MINUTES,
    gameIntervalMinutes: GAME_INTERVAL_MINUTES,
    awaitingGame: gameAwaitingResult(),
    running,
    lastRunAt,
    lastResult,
    lastError,
    nextRunAt,
  };
}
