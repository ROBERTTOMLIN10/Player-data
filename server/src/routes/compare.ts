import { Router } from "express";
import { getDb } from "../db/connection.js";
import { CORE_METRIC_KEYS } from "../lib/metrics.js";

export const compareRouter = Router();

compareRouter.get("/", (req, res) => {
  const db = getDb();
  const idsParam = String(req.query.playerIds ?? "");
  const playerIds = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  if (playerIds.length === 0) {
    return res.status(400).json({ error: "playerIds query param required, e.g. ?playerIds=1,2" });
  }

  const placeholders = playerIds.map(() => "?").join(",");

  const sessions = db
    .prepare(
      `SELECT s.*, p.canonical_name AS player_name, g.game_date, g.opponent
       FROM gps_sessions s
       JOIN players p ON p.id = s.player_id
       JOIN games g ON g.id = s.game_id
       WHERE s.player_id IN (${placeholders})
       ORDER BY g.game_date ASC`,
    )
    .all(...playerIds);

  const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");
  const seasonAverages = db
    .prepare(
      `SELECT s.player_id, p.canonical_name AS player_name, ${avgSelects}
       FROM gps_sessions s
       JOIN players p ON p.id = s.player_id
       WHERE s.player_id IN (${placeholders})
       GROUP BY s.player_id`,
    )
    .all(...playerIds);

  const teamAverages = db.prepare(`SELECT ${avgSelects} FROM gps_sessions`).get();

  res.json({ sessions, seasonAverages, teamAverages });
});
