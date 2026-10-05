import { getDb } from "../db/connection.js";
import { sendToUsers } from "./push.js";

/**
 * Phone alerts to the athletic trainer (and any coach who opts in) when a player's
 * morning check-in flags something to act on: severe or moderate soreness in a
 * body region, or readiness at or below a chosen %. Tapping one opens that
 * player's care panel on the Readiness board, so the AT can book them in.
 */

export interface CareAlertPrefs {
  severe: boolean;
  moderate: boolean;
  low_readiness: boolean;
  readiness_below: number;
}

export const READINESS_THRESHOLDS = [30, 40, 50, 60] as const;

const defaults = (role: string): CareAlertPrefs => {
  const on = role === "trainer";
  return { severe: on, moderate: on, low_readiness: on, readiness_below: 50 };
};

export function getAlertPrefs(userId: number): CareAlertPrefs {
  const db = getDb();
  const row = db.prepare("SELECT severe, moderate, low_readiness, readiness_below FROM care_alert_prefs WHERE user_id = ?").get(userId) as
    | { severe: number; moderate: number; low_readiness: number; readiness_below: number }
    | undefined;
  if (!row) {
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
    return defaults(user?.role ?? "coach");
  }
  return { severe: Boolean(row.severe), moderate: Boolean(row.moderate), low_readiness: Boolean(row.low_readiness), readiness_below: row.readiness_below };
}

export function saveAlertPrefs(userId: number, change: Partial<CareAlertPrefs>) {
  const next = { ...getAlertPrefs(userId), ...change };
  getDb()
    .prepare(
      `INSERT INTO care_alert_prefs (user_id, severe, moderate, low_readiness, readiness_below) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET severe = excluded.severe, moderate = excluded.moderate,
         low_readiness = excluded.low_readiness, readiness_below = excluded.readiness_below, updated_at = datetime('now')`,
    )
    .run(userId, Number(next.severe), Number(next.moderate), Number(next.low_readiness), next.readiness_below);
  return next;
}

const BASE_LABELS: Record<string, string> = {
  head: "Head", neck: "Neck", abs_upper: "Upper Abs", abs_lower: "Lower Abs", trap: "Trap", delt_front: "Front Shoulder",
  delt_rear: "Rear Shoulder", chest: "Chest", bicep: "Bicep", tricep: "Tricep", forearm: "Forearm / Wrist", hand: "Hand",
  oblique: "Oblique", upper_back: "Upper Back", lat: "Lat", lower_back: "Lower Back", hip_flexor: "Hip Flexor",
  groin: "Groin / Adductor", glute_med: "Outer Hip", glute: "Glute", quad_outer: "Outer Quad", quad_front: "Middle Quad",
  quad_inner: "Inner Quad", hamstring_outer: "Outer Hamstring", hamstring_inner: "Inner Hamstring", knee: "Knee", shin: "Shin",
  calf_outer: "Outer Calf", calf_inner: "Inner Calf", ankle: "Ankle", achilles: "Achilles", foot: "Foot",
};

/** "quad_front_l" → "Left Middle Quad" (same wording as the body map). */
export function regionName(id: string): string {
  const m = id.match(/^(.*)_(l|r)$/);
  if (m && BASE_LABELS[m[1]]) return `${m[2] === "l" ? "Left" : "Right"} ${BASE_LABELS[m[1]]}`;
  return BASE_LABELS[id] ?? id;
}

interface Concern {
  key: string;
  kind: "severe" | "moderate" | "low";
}

/**
 * Called after a player saves their check-in. Works out what's concerning, skips
 * anything already alerted today, and pushes one notification per staff member
 * whose settings match something new. Never throws (a failed alert mustn't fail
 * the player's check-in).
 */
export async function alertStaffForCheckin(playerId: number, date: string): Promise<{ sent: number; recipients: number }> {
  try {
    const db = getDb();
    const checkin = db
      .prepare(
        `SELECT c.id, c.readiness_score, c.notes, p.canonical_name AS name
           FROM readiness_checkins c JOIN players p ON p.id = c.player_id
          WHERE c.player_id = ? AND c.entry_date = ?`,
      )
      .get(playerId, date) as { id: number; readiness_score: number; notes: string | null; name: string } | undefined;
    if (!checkin) return { sent: 0, recipients: 0 };
    const sore = db.prepare("SELECT region, severity, note FROM readiness_soreness WHERE checkin_id = ? AND severity IN ('severe','moderate')").all(checkin.id) as {
      region: string;
      severity: "severe" | "moderate";
      note: string | null;
    }[];

    const already = new Set(
      (db.prepare("SELECT alert_key FROM checkin_alerts_sent WHERE player_id = ? AND entry_date = ?").all(playerId, date) as { alert_key: string }[]).map((r) => r.alert_key),
    );
    const staff = db.prepare("SELECT id FROM users WHERE role IN ('trainer','coach')").all() as { id: number }[];

    const sentKeys = new Set<string>();
    let sent = 0;
    let recipients = 0;
    for (const { id: userId } of staff) {
      const prefs = getAlertPrefs(userId);
      const concerns: Concern[] = [
        ...sore.filter((s) => prefs[s.severity]).map((s) => ({ key: `${s.severity}:${s.region}`, kind: s.severity })),
        ...(prefs.low_readiness && checkin.readiness_score <= prefs.readiness_below ? [{ key: `low:${prefs.readiness_below}`, kind: "low" as const }] : []),
      ];
      if (!concerns.some((c) => !already.has(c.key))) continue;

      // The message lists everything that matters to this person today, worst first.
      const parts = [
        ...sore.filter((s) => s.severity === "severe" && prefs.severe).map((s) => `${regionName(s.region)} severe`),
        ...sore.filter((s) => s.severity === "moderate" && prefs.moderate).map((s) => `${regionName(s.region)} moderate`),
        `Readiness ${checkin.readiness_score}%`,
      ];
      const note = checkin.notes?.trim() || sore.find((s) => s.note)?.note?.trim();
      const body = [parts.join(" · "), note ? `“${note.length > 80 ? `${note.slice(0, 79)}…` : note}”` : ""].filter(Boolean).join("\n");
      const r = await sendToUsers([userId], { title: `Check-in: ${checkin.name}`, body, url: `/readiness?care=${playerId}`, tag: `checkin-${playerId}-${date}` }, 60 * 60 * 12);
      sent += r.sent;
      if (r.sent) recipients += 1;
      for (const c of concerns) sentKeys.add(c.key);
    }
    const mark = db.prepare("INSERT OR IGNORE INTO checkin_alerts_sent (player_id, entry_date, alert_key) VALUES (?, ?, ?)");
    for (const k of sentKeys) mark.run(playerId, date, k);
    return { sent, recipients };
  } catch (err) {
    console.error(`[care-alerts] ${(err as Error).message}`);
    return { sent: 0, recipients: 0 };
  }
}
