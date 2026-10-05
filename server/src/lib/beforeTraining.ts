import { getDb } from "../db/connection.js";
import { availabilityOn, openIssuesOn, timeLabel, type Level, type Treatment } from "./care.js";
import { regionName } from "./careAlerts.js";
import { sendToUsers } from "./push.js";

/**
 * Pre practice: the players who may miss part or all of today's session, and
 * where each one is in the AT → coach process:
 *
 *   flagged → called in (an appointment the player accepts) → seen, AT recommends
 *   a play status → coach agrees or changes it (final; it becomes the day's play status)
 *
 * or the AT clears them ("fine to train"), or — for a known injury with nothing new —
 * the AT or a coach settles it as "still the same" (same play status as before). A player is on the list when their
 * check-in shows severe soreness, any soreness where they have an open injury, or
 * readiness at or below PRIORITY_READINESS, when they're already restricted (As
 * tolerated / Limited / Rehab only), or when the AT flags them by hand.
 */

export const PRIORITY_READINESS = 50;

export type ReasonKind = "severe" | "injury_area" | "low" | "restricted" | "manual";
export interface Reason {
  kind: ReasonKind;
  label: string;
}
export type CheckStage = "flagged" | "called_in" | "awaiting_coach" | "decided" | "cleared";

export interface TrainingCheck {
  player_id: number;
  check_date: string;
  flagged: number;
  flag_note: string | null;
  flagged_by: string | null;
  appointment_id: number | null;
  cleared_by: string | null;
  cleared_at: string | null;
  recommendation: Level | null;
  rec_note: string | null;
  recommended_by: string | null;
  recommended_at: string | null;
  decision: Level | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  kept_same: number; // settled as "still the same" (a known injury, nothing new)
}

export interface CareMessage {
  id: number;
  player_id: number;
  msg_date: string;
  author_role: "player" | "trainer" | "coach";
  author_email: string | null;
  body: string;
  quick: string | null;
  created_at: string;
}

const REASON_ORDER: ReasonKind[] = ["severe", "injury_area", "low", "restricted", "manual"];
const RESTRICTED: Level[] = ["as_tolerated", "limited", "rehab", "out"];
const LEVEL_LABEL: Record<Level, string> = { full: "Full", as_tolerated: "As tolerated", limited: "Limited", rehab: "Rehab only", out: "Out" };
const base = (region: string) => region.replace(/_(l|r)$/, "");
const sideOf = (region: string) => region.match(/_(l|r)$/)?.[1] ?? null;

/** Does a sore region on the check-in fall on an injury's area? (Same region, or same muscle when the injury has no side.) */
export function sameArea(sore: string, injuryRegion: string | null): boolean {
  if (!injuryRegion) return false;
  if (sore === injuryRegion) return true;
  return base(sore) === base(injuryRegion) && (!sideOf(sore) || !sideOf(injuryRegion));
}

export function stageOf(check: TrainingCheck | null, appointment: Treatment | null): CheckStage {
  if (check?.decision) return "decided";
  if (check?.recommendation) return "awaiting_coach";
  if (check?.cleared_at) return "cleared";
  if (appointment && appointment.status !== "cancelled") return "called_in";
  return "flagged";
}

export function messagesOn(date: string, playerId?: number): CareMessage[] {
  const db = getDb();
  return (
    playerId === undefined
      ? db.prepare("SELECT * FROM care_messages WHERE msg_date = ? ORDER BY created_at, id").all(date)
      : db.prepare("SELECT * FROM care_messages WHERE msg_date = ? AND player_id = ? ORDER BY created_at, id").all(date, playerId)
  ) as CareMessage[];
}

export function getCheck(playerId: number, date: string): TrainingCheck | null {
  return (getDb().prepare("SELECT * FROM training_checks WHERE player_id = ? AND check_date = ?").get(playerId, date) as TrainingCheck | undefined) ?? null;
}

/** Creates the day's row if needed, then applies the change. */
export function updateCheck(playerId: number, date: string, change: Partial<TrainingCheck>): TrainingCheck {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO training_checks (player_id, check_date) VALUES (?, ?)").run(playerId, date);
  const keys = Object.keys(change);
  if (keys.length) {
    db.prepare(`UPDATE training_checks SET ${keys.map((k) => `${k} = @${k}`).join(", ")}, updated_at = datetime('now') WHERE player_id = @pid AND check_date = @date`).run({
      ...change,
      pid: playerId,
      date,
    });
  }
  return getCheck(playerId, date)!;
}

/** The before-training list for a day, most urgent first. */
export function beforeTraining(date: string) {
  const db = getDb();
  const players = db.prepare("SELECT p.id, p.canonical_name AS name FROM players p").all() as { id: number; name: string }[];
  const names = new Map(players.map((p) => [p.id, p.name]));
  const checkins = db
    .prepare("SELECT id, player_id, readiness_score, notes, submitted_at, updated_at FROM readiness_checkins WHERE entry_date = ?")
    .all(date) as { id: number; player_id: number; readiness_score: number; notes: string | null; submitted_at: string; updated_at: string | null }[];
  const soreness = db
    .prepare("SELECT s.checkin_id, s.region, s.severity, s.note FROM readiness_soreness s JOIN readiness_checkins c ON c.id = s.checkin_id WHERE c.entry_date = ?")
    .all(date) as { checkin_id: number; region: string; severity: "light" | "moderate" | "severe"; note: string | null }[];
  const availability = availabilityOn(date);
  const issues = openIssuesOn(date).filter((i) => i.category === "injury");
  const checks = new Map((db.prepare("SELECT * FROM training_checks WHERE check_date = ?").all(date) as TrainingCheck[]).map((c) => [c.player_id, c]));
  const treatments = db.prepare("SELECT * FROM treatments WHERE treat_date = ? AND status <> 'cancelled' ORDER BY treat_time").all(date) as Treatment[];
  const messages = messagesOn(date);

  const ids = new Set<number>([...checkins.map((c) => c.player_id), ...availability.keys(), ...checks.keys()]);
  const items = [];
  for (const playerId of ids) {
    if (!names.has(playerId)) continue;
    const checkin = checkins.find((c) => c.player_id === playerId) ?? null;
    const sore = checkin ? soreness.filter((s) => s.checkin_id === checkin.id) : [];
    const myIssues = issues.filter((i) => i.player_id === playerId);
    const av = availability.get(playerId) ?? null;
    const check = checks.get(playerId) ?? null;

    const reasons: Reason[] = [];
    for (const s of sore) {
      const injury = myIssues.find((i) => sameArea(s.region, i.region));
      if (injury) reasons.push({ kind: "injury_area", label: `${regionName(s.region)} ${s.severity} · ${injury.description}` });
      else if (s.severity === "severe") reasons.push({ kind: "severe", label: `${regionName(s.region)} severe` });
    }
    if (checkin && checkin.readiness_score <= PRIORITY_READINESS) reasons.push({ kind: "low", label: `Readiness ${checkin.readiness_score}%` });
    if (av && RESTRICTED.includes(av.level))
      reasons.push({ kind: "restricted", label: `${av.level === "out" ? "Out" : `On ${LEVEL_LABEL[av.level]}`}${av.practice_note ? ` · ${av.practice_note}` : ""}` });
    if (check?.flagged) reasons.push({ kind: "manual", label: check.flag_note ? `Flagged: ${check.flag_note}` : "Flagged by the AT" });
    // Someone the staff already acted on today stays on the list, even if their check-in changed.
    if (!reasons.length && !check?.appointment_id && !check?.recommendation && !check?.decision) continue;
    reasons.sort((a, b) => REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind));

    const mine = treatments.filter((t) => t.player_id === playerId);
    const appointment = (check?.appointment_id ? mine.find((t) => t.id === check.appointment_id) : null) ?? null;
    items.push({
      player_id: playerId,
      name: names.get(playerId)!,
      reasons,
      checkin: checkin
        ? { readiness_score: checkin.readiness_score, notes: checkin.notes, submitted_at: checkin.updated_at ?? checkin.submitted_at, soreness: sore.map(({ region, severity, note }) => ({ region, severity, note })) }
        : null,
      availability: av,
      check,
      appointment,
      appointments: mine,
      messages: messages.filter((m) => m.player_id === playerId),
      stage: stageOf(check, appointment),
    });
  }
  // Needs a decision first; within that, the most serious reason first.
  const stageRank: Record<CheckStage, number> = { awaiting_coach: 0, flagged: 1, called_in: 2, decided: 3, cleared: 4 };
  const reasonRank = (r: Reason[]) => (r.length ? REASON_ORDER.indexOf(r[0].kind) : 9);
  items.sort((a, b) => stageRank[a.stage] - stageRank[b.stage] || reasonRank(a.reasons) - reasonRank(b.reasons) || a.name.localeCompare(b.name));
  return { date, threshold: PRIORITY_READINESS, items };
}

export type BeforeTrainingItem = ReturnType<typeof beforeTraining>["items"][number];

// ---- Phone notifications -------------------------------------------------------------

const usersWithRole = (role: string) => (getDb().prepare("SELECT id FROM users WHERE role = ?").all(role) as { id: number }[]).map((r) => r.id);
const playerUser = (playerId: number) => (getDb().prepare("SELECT id FROM users WHERE player_id = ?").get(playerId) as { id: number } | undefined)?.id;
export const playerName = (playerId: number) => (getDb().prepare("SELECT canonical_name AS name FROM players WHERE id = ?").get(playerId) as { name: string } | undefined)?.name ?? "Player";
export const levelLabel = (l: Level) => LEVEL_LABEL[l];

async function push(userIds: number[], title: string, body: string, url: string, tag: string) {
  try {
    await sendToUsers(userIds, { title, body, url, tag }, 12 * 60 * 60);
  } catch (err) {
    console.error(`[care] push failed: ${(err as Error).message}`);
  }
}

export const notify = {
  /** To the player: the AT wants to see them / sent a message. */
  player: (playerId: number, title: string, body: string, tag: string) => {
    const id = playerUser(playerId);
    return id ? push([id], title, body, "/?view=athletic-training", tag) : Promise.resolve();
  },
  /** To every athletic trainer: a player replied or asked for a time. */
  trainers: (playerId: number, title: string, body: string, tag: string) => push(usersWithRole("trainer"), title, body, `/injuries?player=${playerId}`, tag),
  /** To every coach: the AT has a recommendation waiting for them. */
  coaches: (title: string, body: string, tag: string) => push(usersWithRole("coach"), title, body, "/readiness?view=practice", tag),
};

/** "Today at 7:30 AM" / "Oct 6 at 3:00 PM". */
export function whenLabel(t: Pick<Treatment, "treat_date" | "treat_time">, today: string): string {
  const day = t.treat_date === today ? "today" : new Date(`${t.treat_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = timeLabel(t.treat_time);
  return time ? `${day} at ${time}` : day;
}
