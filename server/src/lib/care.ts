import { getDb } from "../db/connection.js";
import { POSITION_SUBQUERY } from "../routes/players.js";
import { sendToUsers } from "./push.js";

/**
 * Player care for the AT view, the coaches and the player: each player's play
 * status for the day (as on the AT's injury report), treatment bookings,
 * coach/AT follow-up notes, and issues (injuries, general medical, physical-exam
 * follow-ups) with their return-to-play stage and daily notes.
 */

export const LEVELS = ["full", "as_tolerated", "limited", "rehab", "out"] as const;
export type Level = (typeof LEVELS)[number];
export const STAGES = ["rehab", "running", "modified", "full", "match_ready"] as const;
export const CATEGORIES = ["injury", "gen_med", "ppe"] as const;
export const KINDS = ["check", "proactive", "treatment", "rehab", "other"] as const;
export type Kind = (typeof KINDS)[number];
const KIND_LABEL: Record<Kind, string> = { check: "Pre-training check", proactive: "Proactive treatment", treatment: "Treatment", rehab: "Rehab", other: "Appointment" };
export const kindLabel = (k: Kind) => KIND_LABEL[k] ?? "Appointment";

export interface Availability {
  player_id: number;
  status_date: string; // the day it was set (it carries forward)
  level: Level;
  practice_note: string | null;
  bike: string | null;
  jogging: string | null;
  running: string | null;
  set_by: string | null;
  updated_at: string;
}

export interface Treatment {
  id: number;
  player_id: number;
  treat_date: string;
  treat_time: string | null;
  kind: Kind;
  reason: string | null;
  instructions: string | null;
  status: "pending" | "booked" | "attended" | "missed" | "declined" | "cancelled";
  awaiting: "player" | "trainer" | null;
  requested_by: "trainer" | "player";
  player_note: string | null;
  attended_marked_by: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface CareNote {
  id: number;
  player_id: number;
  note_date: string;
  author_email: string | null;
  author_role: string;
  body: string;
  created_at: string;
}

export interface Issue {
  id: number;
  player_id: number;
  category: (typeof CATEGORIES)[number];
  description: string;
  region: string | null;
  side: "left" | "right" | "both" | null;
  injury_date: string | null;
  expected_return: string | null;
  stage: (typeof STAGES)[number];
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Each player's play status on a day: the most recent one set on or before it. */
export function availabilityOn(date: string): Map<number, Availability> {
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM player_availability a
       JOIN (SELECT player_id, MAX(status_date) AS d FROM player_availability WHERE status_date <= ? GROUP BY player_id) m
         ON m.player_id = a.player_id AND m.d = a.status_date`,
    )
    .all(date) as Availability[];
  return new Map(rows.map((r) => [r.player_id, r]));
}

function byPlayer<T extends { player_id: number }>(rows: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const r of rows) out.set(r.player_id, [...(out.get(r.player_id) ?? []), r]);
  return out;
}

/** Issues still open on a day, each with how many days since it happened and its latest daily note. */
export function openIssuesOn(date: string) {
  const db = getDb();
  const issues = db
    .prepare("SELECT * FROM injuries WHERE (closed_at IS NULL OR closed_at > ?) AND (injury_date IS NULL OR injury_date <= ?) ORDER BY injury_date DESC")
    .all(date, date) as Issue[];
  const latestLog = db.prepare("SELECT * FROM rehab_logs WHERE injury_id = ? AND log_date <= ? ORDER BY log_date DESC, id DESC LIMIT 1");
  return issues.map((i) => ({
    ...i,
    days: i.injury_date ? daysBetween(i.injury_date, date) : null,
    latestLog: (latestLog.get(i.id, date) as { log_date: string; activities: string; notes: string | null } | undefined) ?? null,
  }));
}

/** Everything about the squad's care on one day (the board, the injury report). */
export function careDay(date: string) {
  const db = getDb();
  const roster = db
    .prepare(
      `SELECT p.id AS player_id, p.canonical_name AS name, pos.position, u.id AS user_id
       FROM players p LEFT JOIN users u ON u.player_id = p.id
       ${POSITION_SUBQUERY}
       ORDER BY p.canonical_name ASC`,
    )
    .all() as { player_id: number; name: string; position: string | null; user_id: number | null }[];
  const availability = availabilityOn(date);
  const treatments = byPlayer(db.prepare("SELECT * FROM treatments WHERE treat_date = ? AND status <> 'cancelled' ORDER BY treat_time").all(date) as Treatment[]);
  const messages = byPlayer(db.prepare("SELECT * FROM care_messages WHERE msg_date = ? ORDER BY created_at, id").all(date) as { player_id: number }[]);
  const notes = byPlayer(db.prepare("SELECT * FROM care_notes WHERE note_date = ? ORDER BY created_at").all(date) as CareNote[]);
  const issues = byPlayer(openIssuesOn(date));
  const players = roster
    .filter((p) => p.user_id !== null || availability.has(p.player_id) || treatments.has(p.player_id) || issues.has(p.player_id))
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      availability: availability.get(p.player_id) ?? null,
      treatments: treatments.get(p.player_id) ?? [],
      notes: notes.get(p.player_id) ?? [],
      messages: messages.get(p.player_id) ?? [],
      issues: issues.get(p.player_id) ?? [],
    }));
  return { date, players };
}

export type CareDayPlayer = ReturnType<typeof careDay>["players"][number];

/** One player's care: today, recent play status, open and past issues, recent notes and treatments. */
export function playerCare(playerId: number, date: string) {
  const db = getDb();
  const day = careDay(date).players.find((p) => p.player_id === playerId) ?? null;
  const history = db
    .prepare("SELECT * FROM player_availability WHERE player_id = ? AND status_date <= ? ORDER BY status_date DESC LIMIT 30")
    .all(playerId, date) as Availability[];
  const pastIssues = db.prepare("SELECT * FROM injuries WHERE player_id = ? AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20").all(playerId) as Issue[];
  const recentNotes = db
    .prepare("SELECT * FROM care_notes WHERE player_id = ? AND note_date <= ? ORDER BY note_date DESC, created_at DESC LIMIT 30")
    .all(playerId, date) as CareNote[];
  const treatments = db
    .prepare("SELECT * FROM treatments WHERE player_id = ? AND treat_date >= date(?, '-14 days') ORDER BY treat_date DESC, treat_time DESC")
    .all(playerId, date) as Treatment[];
  return { date, day, history, pastIssues, recentNotes, treatments };
}

/** An issue with its stage history, daily notes and the player's pain for that body part from their check-ins. */
export function issueDetail(id: number) {
  const db = getDb();
  const issue = db.prepare("SELECT * FROM injuries WHERE id = ?").get(id) as Issue | undefined;
  if (!issue) return null;
  const player = db.prepare("SELECT id, canonical_name AS name FROM players WHERE id = ?").get(issue.player_id) as { id: number; name: string };
  const stages = db.prepare("SELECT * FROM injury_stage_history WHERE injury_id = ? ORDER BY stage_date, id").all(id);
  const logs = db.prepare("SELECT * FROM rehab_logs WHERE injury_id = ? ORDER BY log_date DESC, id DESC").all(id);
  const from = issue.injury_date ?? issue.created_at.slice(0, 10);
  // Pain trend: the player's soreness for this body part each day (0 none, 1 light, 2 moderate, 3 severe), with their readiness.
  const checkins = db
    .prepare(
      `SELECT c.entry_date AS date, c.readiness_score AS readiness, c.muscle_soreness,
              MAX(CASE s.severity WHEN 'severe' THEN 3 WHEN 'moderate' THEN 2 WHEN 'light' THEN 1 END) AS pain
       FROM readiness_checkins c
       LEFT JOIN readiness_soreness s ON s.checkin_id = c.id AND s.region = ?
       WHERE c.player_id = ? AND c.entry_date >= date(?, '-7 days')
       GROUP BY c.id ORDER BY c.entry_date`,
    )
    .all(issue.region ?? "", issue.player_id, from) as { date: string; readiness: number; muscle_soreness: number; pain: number | null }[];
  const availability = db
    .prepare("SELECT * FROM player_availability WHERE player_id = ? AND status_date >= date(?, '-1 days') ORDER BY status_date")
    .all(issue.player_id, from) as Availability[];
  return {
    issue,
    player,
    stages,
    logs,
    painTrend: checkins.map((c) => ({ ...c, pain: issue.region ? (c.pain ?? 0) : null })),
    availability,
  };
}

/** "14:00" → "2:00 PM". */
export function timeLabel(hhmm: string | null): string | null {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Tells the player on their phone about an appointment the AT booked or changed (they can accept or ask for another time). */
export async function notifyTreatment(t: Treatment, changed: boolean, today: string) {
  const user = getDb().prepare("SELECT id FROM users WHERE player_id = ?").get(t.player_id) as { id: number } | undefined;
  if (!user) return;
  const when = [t.treat_date === today ? "today" : null, timeLabel(t.treat_time)].filter(Boolean).join(" at ");
  const what = [kindLabel(t.kind), t.reason].filter(Boolean).join(" · ");
  const ask = t.status === "pending" && t.awaiting === "player" ? " Tap to accept or pick another time." : "";
  try {
    await sendToUsers(
      [user.id],
      {
        title: changed ? `Appointment updated: ${what}` : `Athletic trainer: ${what}`,
        body: `${when ? `Come in ${when}.` : "See the athletic trainer."}${t.instructions ? ` ${t.instructions}` : ""}${ask}`,
        url: "/",
        tag: `treatment-${t.id}`,
      },
      12 * 60 * 60,
    );
  } catch (err) {
    console.error(`[care] treatment push failed: ${(err as Error).message}`);
  }
}
