import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { averagesFor, planningFlags, readinessStatusOn, scoresFor, type RpeScore } from "../lib/rpe.js";
import { gameOnDate, isIsoDate, shiftDate, teamToday } from "../lib/readiness.js";
import { POSITION_SUBQUERY } from "./players.js";

/** Coach RPE: quick post-session logging, squad trends, and one player's history. */
export const rpeRouter = Router();

interface SquadRow {
  player_id: number;
  name: string;
  position: string | null;
  jersey_number: string | null;
}

/** Players who log RPE: this season's roster when it's been synced, otherwise everyone in the app. */
function squad(): SquadRow[] {
  const db = getDb();
  const onRoster = (db.prepare("SELECT COUNT(*) AS n FROM roster_players WHERE player_id IS NOT NULL").get() as { n: number }).n > 0;
  return db
    .prepare(
      `SELECT p.id AS player_id, p.canonical_name AS name, pos.position, pos.jersey_number
       FROM players p ${POSITION_SUBQUERY}
       ${onRoster ? "WHERE p.id IN (SELECT player_id FROM roster_players WHERE player_id IS NOT NULL)" : ""}
       ORDER BY p.canonical_name ASC`,
    )
    .all() as SquadRow[];
}

const sessionOf = (v: unknown) => (Number(v) === 2 ? 2 : 1);

// One session's logging sheet: every player, their score (or not yet), averages and planning flags.
rpeRouter.get("/session", (req, res) => {
  const today = teamToday();
  const date = isIsoDate(req.query.date) ? req.query.date : today;
  const session = sessionOf(req.query.session);
  const players = squad();
  const history = scoresFor(null, shiftDate(date, -60), date);
  const readiness = readinessStatusOn(date);
  const byPlayer = new Map<number, RpeScore[]>();
  for (const s of history) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);

  const rows = players.map((p) => {
    const mine = (byPlayer.get(p.player_id) ?? []).filter(
      (s) => s.session_date < date || (s.session_date === date && s.session <= session),
    );
    const score = mine.find((s) => s.session_date === date && s.session === session) ?? null;
    const r = readiness.get(p.player_id) ?? null;
    return {
      ...p,
      rpe: score?.rpe ?? null,
      averages: averagesFor(mine, date),
      readiness: r,
      flags: planningFlags(score, mine, r?.status ?? null),
    };
  });
  const logged = rows.filter((r) => r.rpe !== null);
  const sessions = (
    getDb().prepare("SELECT DISTINCT session FROM rpe_scores WHERE session_date = ? ORDER BY session").all(date) as { session: number }[]
  ).map((s) => s.session);
  res.json({
    date,
    today,
    session,
    sessions,
    game: gameOnDate(date),
    summary: {
      expected: rows.length,
      logged: logged.length,
      average: logged.length ? Math.round((logged.reduce((a, r) => a + r.rpe!, 0) / logged.length) * 10) / 10 : null,
    },
    players: rows,
  });
});

const scoreInput = z.object({
  player_id: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.union([z.literal(1), z.literal(2)]).default(1),
  rpe: z.number().int().min(1).max(10).nullable(), // null clears it
});

// Log (or correct, or clear) one player's score for a session.
rpeRouter.put("/score", (req, res) => {
  const parsed = scoreInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "RPE must be a whole number from 1 to 10." });
  const { player_id, date, session, rpe } = parsed.data;
  if (date > teamToday()) return res.status(400).json({ error: "Can't log RPE for a future session." });
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM players WHERE id = ?").get(player_id)) return res.status(404).json({ error: "Player not found." });
  if (rpe === null) {
    db.prepare("DELETE FROM rpe_scores WHERE player_id = ? AND session_date = ? AND session = ?").run(player_id, date, session);
  } else {
    db.prepare(
      `INSERT INTO rpe_scores (player_id, session_date, session, rpe, logged_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(player_id, session_date, session) DO UPDATE SET rpe = excluded.rpe, logged_by = excluded.logged_by, logged_at = datetime('now')`,
    ).run(player_id, date, session, rpe, req.user?.email ?? null);
  }
  res.json({ player_id, date, session, rpe });
});

// Squad trends: each player's latest score, 7-day and Last Month averages and flags, plus the squad's daily average.
rpeRouter.get("/trends", (_req, res) => {
  const today = teamToday();
  const players = squad();
  const history = scoresFor(null, shiftDate(today, -60), today);
  const byPlayer = new Map<number, RpeScore[]>();
  for (const s of history) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  const lastDate = history[0]?.session_date ?? null;
  const readiness = lastDate ? readinessStatusOn(lastDate) : new Map();

  const rows = players.map((p) => {
    const mine = byPlayer.get(p.player_id) ?? [];
    const last = mine[0] ?? null;
    return {
      ...p,
      last,
      averages: averagesFor(mine, today),
      flags: last && last.session_date === lastDate ? planningFlags(last, mine, readiness.get(p.player_id)?.status ?? null) : [],
    };
  });

  const byDay = new Map<string, number[]>();
  for (const s of history.filter((s) => s.session_date > shiftDate(today, -28)))
    byDay.set(s.session_date, [...(byDay.get(s.session_date) ?? []), s.rpe]);
  const daily = [...byDay]
    .map(([date, list]) => ({ date, average: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10, logged: list.length }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ today, lastSession: lastDate, players: rows, daily, squad: averagesFor(history, today) });
});

/** One player's scores over the last `days` days, with averages and flags (shared with the player's own view). */
export function playerRpe(playerId: number, days: number) {
  const today = teamToday();
  const scores = scoresFor([playerId], shiftDate(today, -Math.max(days, 60)), today);
  const last = scores[0] ?? null;
  const readiness = last ? readinessStatusOn(last.session_date).get(playerId) ?? null : null;
  return {
    today,
    entries: scores.filter((s) => s.session_date > shiftDate(today, -days)),
    latest: last,
    averages: averagesFor(scores, today),
    flags: planningFlags(last, scores, readiness?.status ?? null),
  };
}

rpeRouter.get("/player/:id", (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });
  res.json(playerRpe(playerId, Math.min(Math.max(Number(req.query.days) || 30, 1), 365)));
});
