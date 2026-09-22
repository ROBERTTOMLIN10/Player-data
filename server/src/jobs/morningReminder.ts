import { getDb } from "../db/connection.js";
import { sendToUsers } from "../lib/push.js";
import { gameOnDate, teamClock } from "../lib/readiness.js";
import { getSetting, setSetting } from "../lib/settings.js";

/**
 * Morning check-in notifications, at team-local times:
 * - Reminder (default 7:30am): every player with notifications on.
 * - Follow-up (default 8:00am): only players who still haven't checked in.
 *
 * Checks the clock every minute and records the date each one was last sent,
 * so a restart never double-sends. If the server was down at send time it
 * catches up when it comes back; if both are overdue by then, only the
 * follow-up goes out so nobody gets two notifications in the same minute.
 */
const DEFAULTS = { time: "07:30", followupTime: "08:00" };
const CATCH_UP_MINUTES = 120;
const TICK_MS = 60_000;

export interface ReminderSettings {
  enabled: boolean;
  time: string; // "HH:MM", team-local
  followupEnabled: boolean;
  followupTime: string;
  lastSentDate: string | null;
  lastFollowupDate: string | null;
}

export function getReminderSettings(): ReminderSettings {
  return {
    enabled: getSetting("reminder_enabled") !== "false",
    time: getSetting("reminder_time") ?? DEFAULTS.time,
    followupEnabled: getSetting("followup_enabled") !== "false",
    followupTime: getSetting("followup_time") ?? DEFAULTS.followupTime,
    lastSentDate: getSetting("reminder_last_sent_date"),
    lastFollowupDate: getSetting("followup_last_sent_date"),
  };
}

export function updateReminderSettings(input: {
  enabled?: boolean;
  time?: string;
  followupEnabled?: boolean;
  followupTime?: string;
}) {
  if (input.enabled !== undefined) setSetting("reminder_enabled", String(input.enabled));
  if (input.time !== undefined) setSetting("reminder_time", input.time);
  if (input.followupEnabled !== undefined) setSetting("followup_enabled", String(input.followupEnabled));
  if (input.followupTime !== undefined) setSetting("followup_time", input.followupTime);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Player logins with a phone subscribed; optionally only those with no check-in for `date`. */
function playersToNotify(date: string, onlyMissing: boolean): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN push_subscriptions ps ON ps.user_id = u.id
       WHERE u.role = 'player'
         ${onlyMissing ? "AND NOT EXISTS (SELECT 1 FROM readiness_checkins rc WHERE rc.player_id = u.player_id AND rc.entry_date = ?)" : ""}`,
    )
    .all(...(onlyMissing ? [date] : [])) as { id: number }[];
  return rows.map((r) => r.id);
}

/** 7:30-style reminder to every subscribed player. */
export async function sendMorningReminder(date: string) {
  const game = gameOnDate(date);
  const userIds = playersToNotify(date, false);
  const result = await sendToUsers(userIds, {
    title: game ? `Game day vs ${game.opponent}` : "Morning check-in",
    body: game
      ? "Log your readiness and anything sore before warm-up. Takes 30 seconds."
      : "How are you feeling today? Log your readiness before training. Takes 30 seconds.",
    url: "/",
  });
  console.log(`[reminder] ${date}: reminder to ${userIds.length} player(s), ${result.sent} notification(s) sent.`);
  return { players: userIds.length, ...result };
}

/** 8:00-style nudge to players who still haven't checked in (also the coach's "send now"). */
export async function sendFollowup(date: string) {
  const game = gameOnDate(date);
  const userIds = playersToNotify(date, true);
  const result = await sendToUsers(userIds, {
    title: "Still need your check-in",
    body: game
      ? `Game day vs ${game.opponent}: coaches need your readiness before warm-up.`
      : "Coaches haven't got your readiness yet. Takes 30 seconds.",
    url: "/",
  });
  console.log(`[reminder] ${date}: follow-up to ${userIds.length} player(s) not checked in, ${result.sent} notification(s) sent.`);
  return { players: userIds.length, ...result };
}

/** Whether a send scheduled at `time` is due now and hasn't gone out today. */
function isDue(time: string, lastDate: string | null, date: string, minutes: number): boolean {
  const due = toMinutes(time);
  return lastDate !== date && minutes >= due && minutes <= due + CATCH_UP_MINUTES;
}

async function tick() {
  const s = getReminderSettings();
  const { date, minutes } = teamClock();
  // The main switch turns both off (days off / off-season).
  const followupDue = s.enabled && s.followupEnabled && isDue(s.followupTime, s.lastFollowupDate, date, minutes);
  const reminderDue = s.enabled && isDue(s.time, s.lastSentDate, date, minutes);

  try {
    // Dates are marked before sending so an error can't cause a repeat every minute.
    if (followupDue) {
      setSetting("followup_last_sent_date", date);
      if (reminderDue) setSetting("reminder_last_sent_date", date); // overdue: skip straight to the follow-up
      await sendFollowup(date);
    } else if (reminderDue) {
      setSetting("reminder_last_sent_date", date);
      await sendMorningReminder(date);
    }
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
