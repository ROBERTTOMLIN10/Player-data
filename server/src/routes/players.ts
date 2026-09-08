import { Router } from "express";
import { getDb } from "../db/connection.js";
import { CORE_METRIC_KEYS } from "../lib/metrics.js";

export const playersRouter = Router();

const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");
const sumSelects = CORE_METRIC_KEYS.map((k) => `SUM(${k}) AS sum_${k}`).join(", ");

playersRouter.get("/", (_req, res) => {
  const db = getDb();
  const players = db
    .prepare(
      `SELECT p.id, p.canonical_name, COUNT(s.id) AS games_played
       FROM players p
       LEFT JOIN gps_sessions s ON s.player_id = p.id
       GROUP BY p.id
       ORDER BY p.canonical_name ASC`,
    )
    .all();
  res.json(players);
});

playersRouter.get("/:id", (req, res) => {
  const db = getDb();
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });

  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId);
  if (!player) return res.status(404).json({ error: "player not found" });

  const sessions = db
    .prepare(
      `SELECT s.*, g.game_date, g.opponent, mp.minutes AS minutes_played, mp.started
       FROM gps_sessions s
       JOIN games g ON g.id = s.game_id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
       WHERE s.player_id = ?
       ORDER BY g.game_date ASC`,
    )
    .all(playerId);

  const seasonTotals = db
    .prepare(`SELECT ${avgSelects}, ${sumSelects}, COUNT(*) AS games_played FROM gps_sessions WHERE player_id = ?`)
    .get(playerId);

  res.json({ player, sessions, seasonTotals });
});
