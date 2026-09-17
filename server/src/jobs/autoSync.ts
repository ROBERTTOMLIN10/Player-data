import { syncSchedule, type SyncScheduleSummary } from "../import/syncSchedule.js";
import { syncMinutes, type SyncMinutesSummary } from "../import/importMinutes.js";

// How often (in minutes) to automatically re-check fausports.com for schedule
// changes, new box scores, and updated minutes — so results/stats show up on
// their own after a game instead of requiring someone to click "Sync" in the
// Data page. Both syncSchedule() and syncMinutes() are cheap, idempotent
// upserts (keyed by date/opponent/player), so re-running them on a timer is
// safe. Only GPS file imports remain manual, since those come from files the
// coach uploads (Titan exports), not something published on the web.
const INTERVAL_MINUTES = Number(process.env.AUTO_SYNC_INTERVAL_MINUTES) || 30;
const INITIAL_DELAY_MS = 15_000; // let the server finish booting first

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

function scheduleNextRunEstimate() {
  nextRunAt = new Date(Date.now() + INTERVAL_MINUTES * 60_000).toISOString();
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
  running = false;
  scheduleNextRunEstimate();
  console.log(`[auto-sync] Done. Next check in ~${INTERVAL_MINUTES} minute(s).`);
}

/**
 * Kicks off the background sync loop. Safe to call once at server startup;
 * subsequent calls are no-ops. Runs an initial check shortly after boot, then
 * repeats on a fixed interval for the lifetime of the process.
 */
export function startAutoSync() {
  if (started) return;
  started = true;
  console.log(
    `[auto-sync] Background sync enabled — will check fausports.com for schedule, game stats, and minutes updates every ${INTERVAL_MINUTES} minute(s).`,
  );
  scheduleNextRunEstimate();
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MINUTES * 60_000);
  }, INITIAL_DELAY_MS);
}

export function getAutoSyncStatus() {
  return {
    enabled: started,
    intervalMinutes: INTERVAL_MINUTES,
    running,
    lastRunAt,
    lastResult,
    lastError,
    nextRunAt,
  };
}
