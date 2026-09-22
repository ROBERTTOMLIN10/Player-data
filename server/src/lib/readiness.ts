import { getDb } from "../db/connection.js";
import type { Severity } from "./bodyRegions.js";

// Check-in dates follow the team's local calendar, not the server's (Render
// runs in UTC, which would roll "today" over at 8pm in Florida).
const TEAM_TIMEZONE = process.env.TEAM_TIMEZONE || "America/New_York";

export function teamToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function gameOnDate(date: string): { opponent: string; game_time: string | null; home_away: string | null } | null {
  const row = getDb()
    .prepare("SELECT opponent, game_time, home_away FROM schedule_games WHERE game_date = ? ORDER BY id LIMIT 1")
    .get(date) as { opponent: string; game_time: string | null; home_away: string | null } | undefined;
  return row ?? null;
}

export interface WellnessInput {
  sleep_quality: number;
  energy: number;
  muscle_soreness: number;
  stress: number;
  mood: number;
}

export function readinessScore(w: WellnessInput): number {
  const sum = w.sleep_quality + w.energy + w.muscle_soreness + w.stress + w.mood;
  return Math.round((sum / 25) * 100);
}

export interface SorenessRow {
  region: string;
  severity: Severity;
  note: string | null;
}

export interface CheckinRow extends WellnessInput {
  id: number;
  player_id: number;
  entry_date: string;
  is_game_day: number;
  sleep_hours: number | null;
  readiness_score: number;
  notes: string | null;
  submitted_at: string;
  updated_at: string;
}

export type CheckinWithSoreness = CheckinRow & { soreness: SorenessRow[] };

export function attachSoreness(checkins: CheckinRow[]): CheckinWithSoreness[] {
  if (checkins.length === 0) return [];
  const ids = checkins.map((c) => c.id);
  const rows = getDb()
    .prepare(
      `SELECT checkin_id, region, severity, note FROM readiness_soreness
       WHERE checkin_id IN (${ids.map(() => "?").join(",")})
       ORDER BY CASE severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END, region`,
    )
    .all(...ids) as (SorenessRow & { checkin_id: number })[];
  const byCheckin = new Map<number, SorenessRow[]>();
  for (const r of rows) {
    const list = byCheckin.get(r.checkin_id) ?? [];
    list.push({ region: r.region, severity: r.severity, note: r.note });
    byCheckin.set(r.checkin_id, list);
  }
  return checkins.map((c) => ({ ...c, soreness: byCheckin.get(c.id) ?? [] }));
}

export function getCheckins(playerId: number, fromDate: string, toDate: string): CheckinWithSoreness[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM readiness_checkins
       WHERE player_id = ? AND entry_date BETWEEN ? AND ?
       ORDER BY entry_date DESC`,
    )
    .all(playerId, fromDate, toDate) as CheckinRow[];
  return attachSoreness(rows);
}

/**
 * Coach-facing traffic light for a check-in:
 * - red: readiness under 60%, or any severe soreness
 * - amber: under 75%, moderate soreness, under 6h sleep, or 15+ points below
 *   the player's own recent baseline
 * - green: everything else
 */
export function flagCheckin(
  checkin: CheckinWithSoreness,
  baseline: number | null,
): { status: "red" | "amber" | "green"; flags: string[] } {
  const flags: string[] = [];
  let status: "red" | "amber" | "green" = "green";
  const raise = (level: "red" | "amber") => {
    if (level === "red" || status === "green") status = level;
  };

  if (checkin.readiness_score < 60) {
    flags.push("Low readiness");
    raise("red");
  } else if (checkin.readiness_score < 75) {
    raise("amber");
  }
  if (checkin.soreness.some((s) => s.severity === "severe")) {
    flags.push("Severe soreness");
    raise("red");
  } else if (checkin.soreness.some((s) => s.severity === "moderate")) {
    flags.push("Moderate soreness");
    raise("amber");
  }
  if (checkin.sleep_hours !== null && checkin.sleep_hours < 6) {
    flags.push("Short sleep");
    raise("amber");
  }
  if (baseline !== null && checkin.readiness_score <= baseline - 15) {
    flags.push(`${Math.round(baseline - checkin.readiness_score)} below usual`);
    raise("amber");
  }
  return { status, flags };
}

/** Average score over the player's previous 7 days (needs 3+ entries to count). */
export function baselineFor(playerId: number, date: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT AVG(readiness_score) AS avg, COUNT(*) AS n FROM readiness_checkins
       WHERE player_id = ? AND entry_date >= ? AND entry_date < ?`,
    )
    .get(playerId, shiftDate(date, -7), date) as { avg: number | null; n: number };
  return row.n >= 3 && row.avg !== null ? row.avg : null;
}
