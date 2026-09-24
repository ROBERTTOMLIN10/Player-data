import { Router } from "express";
import { SESSION_ROLE_SQL } from "../lib/fitness.js";
import { getDb } from "../db/connection.js";
import { CORE_METRIC_KEYS } from "../lib/metrics.js";
import { withFlags } from "../lib/sessionFlags.js";

export const gamesRouter = Router();

const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");
const maxSelects = CORE_METRIC_KEYS.map((k) => `MAX(${k}) AS max_${k}`).join(", ");

gamesRouter.get("/", (_req, res) => {
  const db = getDb();
  const games = db
    .prepare(
      `SELECT g.id, g.game_date, g.opponent, g.source_file,
              COUNT(s.id) AS player_count, ${avgSelects}
       FROM games g
       LEFT JOIN gps_sessions s ON s.game_id = g.id
       GROUP BY g.id
       ORDER BY g.game_date ASC`,
    )
    .all();
  res.json(games);
});

gamesRouter.get("/:id", (req, res) => {
  const db = getDb();
  const gameId = Number(req.params.id);
  if (!Number.isInteger(gameId)) return res.status(400).json({ error: "invalid game id" });

  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
  if (!game) return res.status(404).json({ error: "game not found" });

  const sessions = db
    .prepare(
      `SELECT s.*, p.canonical_name AS player_name, mp.minutes AS minutes_played, mp.started, ${SESSION_ROLE_SQL}
       FROM gps_sessions s
       JOIN players p ON p.id = s.player_id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
       WHERE s.game_id = ?
       ORDER BY p.canonical_name ASC`,
    )
    .all(gameId) as { id: number }[];

  const teamAverages = db
    .prepare(`SELECT ${avgSelects}, ${maxSelects} FROM gps_sessions_valid WHERE game_id = ?`)
    .get(gameId);

  res.json({ game, sessions: withFlags(sessions), teamAverages });
});

gamesRouter.get("/:id/zones", (req, res) => {
  const db = getDb();
  const gameId = Number(req.params.id);
  const playerId = req.query.playerId ? Number(req.query.playerId) : null;
  if (!Number.isInteger(gameId)) return res.status(400).json({ error: "invalid game id" });

  const params: (number | null)[] = [gameId];
  let playerFilter = "";
  if (playerId) {
    playerFilter = "AND s.player_id = ?";
    params.push(playerId);
  }

  const zones = db
    .prepare(
      `SELECT z.zone_group, z.zone_label, z.value, z.unit, s.player_id, p.canonical_name AS player_name
       FROM gps_zone_metrics z
       JOIN gps_sessions s ON s.id = z.gps_session_id
       JOIN players p ON p.id = s.player_id
       WHERE s.game_id = ? ${playerFilter}`,
    )
    .all(...params);

  res.json(zones);
});
