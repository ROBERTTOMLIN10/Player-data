import { getDb } from "../db/connection.js";
import type { AuthUser } from "./auth.js";

/**
 * Favorite (starred) teams and the game alerts each person wants for them.
 * FAU is starred for everyone by default (goal and final alerts on) until they
 * change it; a row with starred = 0 means they unstarred it.
 */

export const OUR_TEAM = process.env.NCAA_TEAM_SEO || "fla-atlantic";
export const ALERTS = ["kickoff", "goals", "halftime", "final", "red_cards"] as const;
export type Alert = (typeof ALERTS)[number];
export type AlertSettings = Record<Alert, boolean>;

const DEFAULT_ALERTS: AlertSettings = { kickoff: false, goals: true, halftime: false, final: true, red_cards: false };

/**
 * The users row that holds this person's favorites and phone. The coach login
 * set by ADMIN_USER/ADMIN_PASSWORD has no users row, so it gets one the first
 * time it's needed (its password can never match, so it can't be used to sign in).
 */
export function personalUserId(user: AuthUser): number | null {
  if (user.userId !== null) return user.userId;
  if (!user.email || user.email === "local") return null;
  const db = getDb();
  const row = db.prepare("SELECT id FROM users WHERE email = ?").get(user.email) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, '!', 'coach')").run(user.email).lastInsertRowid);
}

interface FollowRow extends Record<Alert, number> {
  team_seo: string;
  starred: number;
}

const toSettings = (r: FollowRow): AlertSettings => Object.fromEntries(ALERTS.map((a) => [a, r[a] === 1])) as AlertSettings;

/** This person's starred teams with their alert choices (FAU first). */
export function listFollows(userId: number): { seo: string; alerts: AlertSettings }[] {
  const rows = getDb().prepare("SELECT * FROM team_follows WHERE user_id = ?").all(userId) as FollowRow[];
  const out = rows.filter((r) => r.starred === 1).map((r) => ({ seo: r.team_seo, alerts: toSettings(r) }));
  if (!rows.some((r) => r.team_seo === OUR_TEAM)) out.push({ seo: OUR_TEAM, alerts: { ...DEFAULT_ALERTS } });
  return out.sort((a, b) => Number(b.seo === OUR_TEAM) - Number(a.seo === OUR_TEAM));
}

/** Star/unstar a team or change its alerts (unchanged fields keep their value, or the default for a new star). */
export function saveFollow(userId: number, seo: string, change: { starred?: boolean; alerts?: Partial<AlertSettings> }) {
  const db = getDb();
  const current = db.prepare("SELECT * FROM team_follows WHERE user_id = ? AND team_seo = ?").get(userId, seo) as FollowRow | undefined;
  const base: AlertSettings = current ? toSettings(current) : { ...DEFAULT_ALERTS };
  const alerts = { ...base, ...change.alerts };
  const starred = change.starred ?? (current ? current.starred === 1 : true);
  db.prepare(
    `INSERT INTO team_follows (user_id, team_seo, starred, kickoff, goals, halftime, final, red_cards, updated_at)
     VALUES (@userId, @seo, @starred, @kickoff, @goals, @halftime, @final, @red_cards, datetime('now'))
     ON CONFLICT(user_id, team_seo) DO UPDATE SET starred = excluded.starred, kickoff = excluded.kickoff, goals = excluded.goals,
       halftime = excluded.halftime, final = excluded.final, red_cards = excluded.red_cards, updated_at = excluded.updated_at`,
  ).run({ userId, seo, starred: starred ? 1 : 0, ...Object.fromEntries(ALERTS.map((a) => [a, alerts[a] ? 1 : 0])) });
}

/** Everyone who wants this alert for any of these teams (FAU's default included). */
export function followersFor(teams: string[], alert: Alert): number[] {
  const db = getDb();
  const ids = new Set<number>();
  for (const seo of teams) {
    const explicit = db
      .prepare(`SELECT user_id FROM team_follows WHERE team_seo = ? AND starred = 1 AND ${alert} = 1`)
      .all(seo) as { user_id: number }[];
    explicit.forEach((r) => ids.add(r.user_id));
    if (seo === OUR_TEAM && DEFAULT_ALERTS[alert]) {
      const byDefault = db
        .prepare("SELECT id FROM users u WHERE NOT EXISTS (SELECT 1 FROM team_follows f WHERE f.user_id = u.id AND f.team_seo = ?)")
        .all(seo) as { id: number }[];
      byDefault.forEach((r) => ids.add(r.id));
    }
  }
  return [...ids];
}
