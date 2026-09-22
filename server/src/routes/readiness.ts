import { Router } from "express";
import { getDb } from "../db/connection.js";
import {
  attachSoreness,
  baselineFor,
  flagCheckin,
  gameOnDate,
  getCheckins,
  isIsoDate,
  shiftDate,
  teamToday,
  type CheckinRow,
} from "../lib/readiness.js";
import { POSITION_SUBQUERY } from "./players.js";

/** Coach views of player readiness check-ins. */
export const readinessRouter = Router();

// Squad board for one day: who has checked in, their scores, flags, and body-map selections.
readinessRouter.get("/squad", (req, res) => {
  const today = teamToday();
  const date = isIsoDate(req.query.date) ? req.query.date : today;
  const db = getDb();

  const checkins = attachSoreness(
    db.prepare("SELECT * FROM readiness_checkins WHERE entry_date = ?").all(date) as CheckinRow[],
  );
  const byPlayer = new Map(checkins.map((c) => [c.player_id, c]));

  // Expected to check in = players with a login; plus anyone who submitted
  // (e.g. an account deleted since) so no entry is ever hidden.
  const roster = db
    .prepare(
      `SELECT p.id AS player_id, p.canonical_name AS name, pos.position, u.id AS user_id
       FROM players p
       LEFT JOIN users u ON u.player_id = p.id
       ${POSITION_SUBQUERY}
       ORDER BY p.canonical_name ASC`,
    )
    .all() as Array<{ player_id: number; name: string; position: string | null; user_id: number | null }>;

  const players = roster
    .filter((p) => p.user_id !== null || byPlayer.has(p.player_id))
    .map((p) => {
      const entry = byPlayer.get(p.player_id) ?? null;
      const baseline = baselineFor(p.player_id, date);
      const flagged = entry ? flagCheckin(entry, baseline) : { status: "missing" as const, flags: [] };
      return {
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        hasAccount: p.user_id !== null,
        entry,
        baseline: baseline === null ? null : Math.round(baseline),
        ...flagged,
      };
    });

  const regionCounts: Record<string, { light: number; moderate: number; severe: number }> = {};
  for (const c of checkins) {
    for (const s of c.soreness) {
      regionCounts[s.region] ??= { light: 0, moderate: 0, severe: 0 };
      regionCounts[s.region][s.severity] += 1;
    }
  }

  const count = (status: string) => players.filter((p) => p.status === status).length;
  const scores = checkins.map((c) => c.readiness_score);
  res.json({
    date,
    today,
    game: gameOnDate(date),
    accountCount: roster.filter((p) => p.user_id !== null).length,
    summary: {
      expected: players.length,
      submitted: checkins.length,
      red: count("red"),
      amber: count("amber"),
      green: count("green"),
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    },
    players,
    regionCounts,
  });
});

// One player's check-in history (for the coach Players page).
readinessRouter.get("/player/:id", (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const today = teamToday();
  const entries = getCheckins(playerId, shiftDate(today, -(days - 1)), today).map((e) => ({
    ...e,
    ...flagCheckin(e, baselineFor(playerId, e.entry_date)),
  }));
  res.json({ today, entries });
});
