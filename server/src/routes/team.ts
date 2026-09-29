import { Router } from "express";
import { computeFitness, FITNESS_AMBER, FITNESS_RED } from "../lib/fitness.js";
import { getSessionFlags } from "../lib/sessionFlags.js";
import { getDb } from "../db/connection.js";
import { requireCoach } from "../middleware/auth.js";
import { CORE_METRICS, CORE_METRIC_KEYS } from "../lib/metrics.js";

export const teamRouter = Router();

// GPS season summary (names each metric's top player): coaches only.
teamRouter.get("/summary", requireCoach, (_req, res) => {
  const db = getDb();

  const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");
  const seasonAverages = db.prepare(`SELECT ${avgSelects} FROM gps_sessions_valid`).get() as Record<string, number>;

  const trend = db
    .prepare(
      `SELECT g.id AS game_id, g.game_date, g.opponent, ${CORE_METRIC_KEYS.map((k) => `AVG(s.${k}) AS avg_${k}`).join(", ")}
       FROM games g
       JOIN gps_sessions_valid s ON s.game_id = g.id
       GROUP BY g.id
       ORDER BY g.game_date ASC`,
    )
    .all();

  const highs = CORE_METRICS.map((metric) => {
    const row = db
      .prepare(
        `SELECT s.${metric.key} AS value, p.canonical_name AS player_name, g.opponent, g.game_date, g.id AS game_id
         FROM gps_sessions_valid s
         JOIN players p ON p.id = s.player_id
         JOIN games g ON g.id = s.game_id
         WHERE s.${metric.key} IS NOT NULL
         ORDER BY s.${metric.key} DESC
         LIMIT 1`,
      )
      .get();
    return { metric: metric.key, label: metric.label, unit: metric.unit, best: row };
  });

  // Lowest single game per metric, from games the player got minutes in (a
  // fitness-only session would always be the low). Tracker glitches excluded.
  const lows = CORE_METRICS.map((metric) => {
    const row = db
      .prepare(
        `SELECT s.${metric.key} AS value, p.canonical_name AS player_name, g.opponent, g.game_date, g.id AS game_id
         FROM gps_sessions_valid s
         JOIN players p ON p.id = s.player_id
         JOIN games g ON g.id = s.game_id
         JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id AND mp.minutes > 0
         WHERE s.${metric.key} IS NOT NULL
         ORDER BY s.${metric.key} ASC
         LIMIT 1`,
      )
      .get();
    return { metric: metric.key, label: metric.label, unit: metric.unit, best: row };
  });

  res.json({ seasonAverages, trend, highs, lows });
});

// Season stat totals (goals/assists/points/cards) + per-game log, sourced from
// player_game_stats/game_team_totals (independent of GPS import status).
// Public box score data, so players can see it too (the Home page's record).
teamRouter.get("/stats", (_req, res) => {
  const db = getDb();

  const seasonTotals = db
    .prepare(
      `SELECT COALESCE(SUM(goals), 0) AS goals, COALESCE(SUM(assists), 0) AS assists,
              COALESCE(SUM(points), 0) AS points, COALESCE(SUM(shots), 0) AS shots,
              COALESCE(SUM(shots_on_goal), 0) AS shots_on_goal, COALESCE(SUM(yellow_cards), 0) AS yellow_cards,
              COALESCE(SUM(red_cards), 0) AS red_cards, COALESCE(SUM(fouls), 0) AS fouls
       FROM game_team_totals WHERE side = 'FAU'`,
    )
    .get();

  const record = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'W' THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN status = 'L' THEN 1 ELSE 0 END) AS losses,
         SUM(CASE WHEN status = 'T' THEN 1 ELSE 0 END) AS ties
       FROM schedule_games WHERE status IS NOT NULL`,
    )
    .get();

  const gameLog = db
    .prepare(
      `SELECT sg.id AS schedule_game_id, sg.game_date, sg.opponent, sg.opponent_logo_url, sg.status, sg.team_score, sg.opponent_score,
              fau.goals, fau.assists, fau.points, fau.shots, fau.shots_on_goal, fau.saves, fau.corners,
              fau.fouls, fau.offsides, fau.yellow_cards, fau.red_cards
       FROM schedule_games sg
       JOIN game_team_totals fau ON fau.schedule_game_id = sg.id AND fau.side = 'FAU'
       ORDER BY sg.game_date ASC`,
    )
    .all();

  // Every player on the roster, even without a box score line yet (zeros), plus
  // goalkeepers from the box scores (they wear no tracker, so they aren't players in the app).
  // A game counts when there's a box score line (started is never NULL on one) with minutes, or no minutes data.
  const PLAYED = "CASE WHEN started IS NOT NULL AND (minutes IS NULL OR minutes > 0) THEN 1 ELSE 0 END";
  const COLS = ["minutes", "started", "goals", "assists", "points", "shots", "shots_on_goal", "yellow_cards", "red_cards"];
  const topScorers = db
    .prepare(
      `SELECT player_id, player_name, is_goalkeeper,
              (SELECT r.jersey_number FROM roster_players r
               WHERE r.player_id = t.player_id OR (t.player_id IS NULL AND r.player_name = t.player_name)) AS jersey_number,
              (SELECT r.photo_url FROM roster_players r
               WHERE r.player_id = t.player_id OR (t.player_id IS NULL AND r.player_name = t.player_name)) AS photo_url,
              COALESCE(SUM(${PLAYED}), 0) AS games_played,
              COALESCE(SUM(started), 0) AS games_started,
              ROUND(COALESCE(SUM(minutes), 0)) AS minutes,
              COALESCE(SUM(goals), 0) AS goals, COALESCE(SUM(assists), 0) AS assists, COALESCE(SUM(points), 0) AS points,
              COALESCE(SUM(shots), 0) AS shots, COALESCE(SUM(shots_on_goal), 0) AS shots_on_goal,
              COALESCE(SUM(yellow_cards), 0) AS yellow_cards, COALESCE(SUM(red_cards), 0) AS red_cards
       FROM (
         SELECT p.id AS player_id, p.canonical_name AS player_name, 0 AS is_goalkeeper, ${COLS.map((c) => `pgs.${c}`).join(", ")}
         FROM players p LEFT JOIN player_game_stats pgs ON pgs.player_id = p.id
         UNION ALL
         SELECT NULL, player_name, 1, ${COLS.join(", ")}
         FROM goalkeeper_game_stats
         UNION ALL
         SELECT NULL, player_name, 1, ${COLS.map(() => "0").join(", ")}
         FROM roster_players WHERE UPPER(position_short) = 'GK' AND player_id IS NULL
       ) t
       GROUP BY COALESCE(player_id, 'gk:' || player_name)
       ORDER BY points DESC, goals DESC, minutes DESC, player_name ASC`,
    )
    .all();

  // Every keeper on the roster or in a box score, including ones yet to play.
  const KEEPER_PLAYED = "CASE WHEN k.id IS NOT NULL AND (k.minutes IS NULL OR k.minutes > 0) THEN 1 ELSE 0 END";
  const goalkeepers = db
    .prepare(
      `SELECT n.player_name, r.jersey_number, r.photo_url,
              SUM(${KEEPER_PLAYED}) AS games_played, COALESCE(SUM(k.started), 0) AS games_started,
              ROUND(COALESCE(SUM(k.minutes), 0)) AS minutes,
              COALESCE(SUM(k.saves), 0) AS saves, COALESCE(SUM(k.goals_allowed), 0) AS goals_allowed,
              COALESCE(SUM(k.shutout), 0) AS shutouts
       FROM (
         SELECT player_name FROM roster_players WHERE UPPER(position_short) = 'GK' AND player_id IS NULL
         UNION SELECT player_name FROM goalkeeper_game_stats
       ) n
       LEFT JOIN roster_players r ON r.player_name = n.player_name
       LEFT JOIN goalkeeper_game_stats k ON k.player_name = n.player_name
       GROUP BY n.player_name
       ORDER BY minutes DESC, CAST(r.jersey_number AS INTEGER) ASC, n.player_name ASC`,
    )
    .all();

  res.json({ seasonTotals, record, gameLog, topScorers, goalkeepers });
});

/** Coaches: every player's load vs the players getting minutes (see lib/fitness.ts). */
teamRouter.get("/fitness", requireCoach, (_req, res) => {
  res.json({ ...computeFitness(), thresholds: { amber: FITNESS_AMBER, red: FITNESS_RED } });
});

/** Coaches: GPS sessions that need checking (tracker glitches and big spikes), newest first. */
teamRouter.get("/flags", requireCoach, (_req, res) => {
  const flags = getSessionFlags();
  if (!flags.size) return res.json([]);
  const ids = [...flags.keys()];
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.game_id, s.player_id, s.load, s.distance_mi, s.top_speed_mph, p.canonical_name AS player_name,
              g.game_date, g.opponent, g.source_file
       FROM gps_sessions s JOIN players p ON p.id = s.player_id JOIN games g ON g.id = s.game_id
       WHERE s.id IN (${ids.map(() => "?").join(",")})
       ORDER BY g.game_date DESC, p.canonical_name`,
    )
    .all(...ids) as { id: number }[];
  res.json(rows.map((r) => ({ ...r, flag: flags.get(r.id) })));
});
