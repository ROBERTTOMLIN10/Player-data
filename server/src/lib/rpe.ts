import { getDb } from "../db/connection.js";
import { attachSoreness, flagCheckin, baselineFor, shiftDate, type CheckinRow } from "./readiness.js";

/**
 * Post-training RPE (rate of perceived exertion, 1–10), logged by coaches
 * after each session. Averages use the same windows as the rest of the app:
 * "7-day" and "Last Month" (the last 28 days).
 */
export const RPE_WINDOWS = [
  { key: "week", days: 7 },
  { key: "month", days: 28 },
] as const;

/** One logged score; the averages and flags only need the date, session and score. */
export interface RpeEntry {
  session_date: string;
  session: number;
  rpe: number;
}

export interface RpeScore extends RpeEntry {
  player_id: number;
}

export interface KeeperRpeScore extends RpeEntry {
  keeper_name: string;
}

export interface RpeAverages {
  week: number | null; // 7-day
  month: number | null; // Last Month
  weekSessions: number;
  monthSessions: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function averagesFor(scores: RpeEntry[], asOf: string): RpeAverages {
  const within = (days: number) => scores.filter((s) => s.session_date > shiftDate(asOf, -days) && s.session_date <= asOf);
  const avg = (list: RpeEntry[]) => (list.length ? round1(list.reduce((a, s) => a + s.rpe, 0) / list.length) : null);
  const week = within(7);
  const month = within(28);
  return { week: avg(week), month: avg(month), weekSessions: week.length, monthSessions: month.length };
}

export function scoresFor(playerIds: number[] | null, from: string, to: string): RpeScore[] {
  const db = getDb();
  const where = playerIds ? `AND player_id IN (${playerIds.map(() => "?").join(",") || "NULL"})` : "";
  return db
    .prepare(
      `SELECT player_id, session_date, session, rpe FROM rpe_scores
       WHERE session_date BETWEEN ? AND ? ${where}
       ORDER BY session_date DESC, session DESC`,
    )
    .all(from, to, ...(playerIds ?? [])) as RpeScore[];
}

/** Keepers' scores (roster goalkeepers who aren't players in the app). */
export function keeperScoresFor(from: string, to: string): KeeperRpeScore[] {
  return getDb()
    .prepare(
      `SELECT keeper_name, session_date, session, rpe FROM keeper_rpe_scores
       WHERE session_date BETWEEN ? AND ?
       ORDER BY session_date DESC, session DESC`,
    )
    .all(from, to) as KeeperRpeScore[];
}

/** Goalkeepers on the roster who aren't players in the app (their RPE is logged separately). */
export function rosterKeepers(): { name: string; jersey_number: string | null }[] {
  return getDb()
    .prepare(
      `SELECT player_name AS name, jersey_number FROM roster_players
       WHERE UPPER(position_short) = 'GK' AND player_id IS NULL
       ORDER BY CAST(jersey_number AS INTEGER), player_name`,
    )
    .all() as { name: string; jersey_number: string | null }[];
}

/**
 * Flags to help plan the next session's load, for one player's score:
 * - well above their own Last Month average (2.5+ points, with 3+ earlier sessions)
 * - a hard session (7+) on a day their readiness check-in was amber or red
 * - a high 7-day average (7.5+ over 3+ sessions)
 */
export function planningFlags(score: RpeEntry | null, history: RpeEntry[], readinessStatus: string | null): string[] {
  const flags: string[] = [];
  if (score) {
    const earlier = history.filter(
      (s) =>
        (s.session_date < score.session_date || (s.session_date === score.session_date && s.session < score.session)) &&
        s.session_date > shiftDate(score.session_date, -28),
    );
    if (earlier.length >= 3) {
      const usual = earlier.reduce((a, s) => a + s.rpe, 0) / earlier.length;
      if (score.rpe >= usual + 2.5) flags.push(`Well above usual (${round1(usual)})`);
    }
    if (score.rpe >= 7 && (readinessStatus === "red" || readinessStatus === "amber"))
      flags.push(`Hard session on ${readinessStatus === "red" ? "low" : "reduced"} readiness`);
  }
  const asOf = score?.session_date ?? history[0]?.session_date;
  if (asOf) {
    const week = averagesFor(history, asOf);
    if (week.week !== null && week.weekSessions >= 3 && week.week >= 7.5) flags.push(`High 7-day average (${week.week})`);
  }
  return flags;
}

/** Each player's readiness traffic light on a date (null when they didn't check in). */
export function readinessStatusOn(date: string): Map<number, { status: string; score: number }> {
  const rows = attachSoreness(getDb().prepare("SELECT * FROM readiness_checkins WHERE entry_date = ?").all(date) as CheckinRow[]);
  return new Map(rows.map((c) => [c.player_id, { status: flagCheckin(c, baselineFor(c.player_id, date)).status, score: c.readiness_score }]));
}

/** Plain-language band for a score, shared with the web app's colours. */
export function rpeBand(rpe: number): "easy" | "moderate" | "hard" | "very hard" {
  return rpe <= 3 ? "easy" : rpe <= 6 ? "moderate" : rpe <= 8 ? "hard" : "very hard";
}
