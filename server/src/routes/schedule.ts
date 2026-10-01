import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireCoach } from "../middleware/auth.js";

export const scheduleRouter = Router();

const OUR_TEAM = process.env.NCAA_TEAM_SEO || "fla-atlantic";

// Full season schedule: past results + upcoming games, ordered chronologically.
// Each game is matched (by date) to NCAA.com's game, for the game page and the opponent's team page.
// Open to players as well as coaches.
scheduleRouter.get("/", (_req, res) => {
  const db = getDb();
  const games = db
    .prepare(
      `SELECT s.id, s.game_date, s.game_time, s.opponent, s.opponent_logo_url, s.location, s.home_away,
              s.is_conference, s.status, s.team_score, s.opponent_score, s.boxscore_url, s.recap_url,
              n.contest_id AS ncaa_game_id,
              CASE WHEN n.home_seo = @us THEN n.away_seo ELSE n.home_seo END AS opponent_seo
       FROM schedule_games s
       LEFT JOIN ncaa_games n ON n.contest_id = (
         SELECT contest_id FROM ncaa_games WHERE game_date = substr(s.game_date, 1, 10) AND (home_seo = @us OR away_seo = @us) LIMIT 1
       )
       ORDER BY s.game_date ASC`,
    )
    .all({ us: OUR_TEAM });
  res.json(games);
});

// Per-game box score with every player's line: coaches only.
scheduleRouter.get("/:id", requireCoach, (req, res) => {
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
