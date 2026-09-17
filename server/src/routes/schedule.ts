import { Router } from "express";
import { getDb } from "../db/connection.js";

export const scheduleRouter = Router();

// Full season schedule: past results + upcoming games, ordered chronologically.
scheduleRouter.get("/", (_req, res) => {
  const db = getDb();
  const games = db
    .prepare(
      `SELECT id, game_date, game_time, opponent, opponent_logo_url, location, home_away,
              is_conference, status, team_score, opponent_score, boxscore_url, recap_url
       FROM schedule_games
       ORDER BY game_date ASC`,
    )
    .all();
  res.json(games);
});

scheduleRouter.get("/:id", (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid schedule game id" });

  const game = db.prepare("SELECT * FROM schedule_games WHERE id = ?").get(id);
  if (!game) return res.status(404).json({ error: "schedule game not found" });

  const teamTotals = db.prepare("SELECT * FROM game_team_totals WHERE schedule_game_id = ?").all(id);

  const playerStats = db
    .prepare(
      `SELECT pgs.*, p.canonical_name AS player_name
       FROM player_game_stats pgs
       JOIN players p ON p.id = pgs.player_id
       WHERE pgs.schedule_game_id = ?
       ORDER BY pgs.started DESC, p.canonical_name ASC`,
    )
    .all(id);

  res.json({ game, teamTotals, playerStats });
});
