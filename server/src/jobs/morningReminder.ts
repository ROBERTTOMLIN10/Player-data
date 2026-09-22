import { getDb } from "../db/connection.js";
import { sendToUsers } from "../lib/push.js";
import { gameOnDate, teamClock } from "../lib/readiness.js";
import { getSetting, setSetting } from "../lib/settings.js";

/**
 * Morning check-in reminder: a push notification at the configured team-local
 * time (default 7:30am Eastern) to every player with notifications on who
 * hasn't checked in yet that day. Checks the clock every minute and records the
 * last sent date, so a restart never double-sends; if the server was down at
 * reminder time it still sends when it comes back, up to 2 hours late.
 */
const DEFAULT_TIME = "07:30";
const CATCH_UP_MINUTES = 120;
const TICK_MS = 60_000;

export interface ReminderSettings {
  enabled: boolean;
  time: string; // "HH:MM", team-local
  lastSentDate: string | null;
}

export function getReminderSettings(): ReminderSettings {
  return {
    enabled: getSetting("reminder_enabled") !== "false",
    time: getSetting("reminder_time") ?? DEFAULT_TIME,
    lastSentDate: getSetting("reminder_last_sent_date"),
  };
}

export function updateReminderSettings(input: { enabled?: boolean; time?: string }) {
  if (input.enabled !== undefined) setSetting("reminder_enabled", String(input.enabled));
  if (input.time !== undefined) setSetting("reminder_time", input.time);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Player logins that have a phone subscribed but no check-in for `date`. */
function playersToRemind(date: string): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN push_subscriptions ps ON ps.user_id = u.id
       WHERE u.role = 'player'
         AND NOT EXISTS (SELECT 1 FROM readiness_checkins rc WHERE rc.player_id = u.player_id AND rc.entry_date = ?)`,
    )
    .all(date) as { id: number }[];
  return rows.map((r) => r.id);
}

export async function sendMorningReminders(date: string) {
  const game = gameOnDate(date);
  const userIds = playersToRemind(date);
  const result = await sendToUsers(userIds, {
    title: game ? `Game day vs ${game.opponent}` : "Morning check-in",
    body: game
      ? "Log your readiness and anything sore before warm-up. Takes 30 seconds."
      : "How are you feeling today? Log your readiness before training. Takes 30 seconds.",
    url: "/",
  });
  console.log(`[reminder] ${date}: ${userIds.length} player(s) not checked in, ${result.sent} notification(s) sent.`);
  return { players: userIds.length, ...result };
}

async function tick() {
  const settings = getReminderSettings();
  if (!settings.enabled) return;
  const { date, minutes } = teamClock();
  if (settings.lastSentDate === date) return;
  const due = toMinutes(settings.time);
  if (minutes < due || minutes > due + CATCH_UP_MINUTES) return;

  // Mark first so an error mid-send can't cause repeat notifications every minute.
  setSetting("reminder_last_sent_date", date);
  try {
    await sendMorningReminders(date);
  } catch (err) {
    console.error(`[reminder] failed: ${(err as Error).message}`);
  }
}

let started = false;

export function startMorningReminder() {
  if (started) return;
  started = true;
  setInterval(() => void tick(), TICK_MS);
  void tick();
}
