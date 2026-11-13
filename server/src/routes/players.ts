import { Router } from "express";
import { getDb } from "../db/connection.js";
import { SESSION_ROLE_SQL } from "../lib/fitness.js";
import { CORE_METRIC_KEYS, GLITCH_TOP_SPEED_MPH } from "../lib/metrics.js";
import { withFlags } from "../lib/sessionFlags.js";
import { buildPlayerReport, seasonStart, type ReportGameStat, type ReportInput, type ReportSession } from "../lib/playerReport.js";
import { teamToday } from "../lib/readiness.js";
import { sendReportImage } from "../lib/reportImage.js";
import { OUR_TEAM } from "../lib/follows.js";
import { ncaaLogoUrl } from "../ncaa/client.js";
import { PROFILE_COLUMNS } from "../import/sidearmRoster.js";

export const playersRouter = Router();

const VALID = `(s.top_speed_mph IS NULL OR s.top_speed_mph <= ${GLITCH_TOP_SPEED_MPH})`;

// Position is scraped per-game from Sidearm box scores (values like "fwd",
// "mid", "def", "gk") and can vary game to game (subs, formation changes), so
// we take each player's most frequently recorded non-blank position across
// both player_game_stats (schedule sync) and minutes_played (legacy minutes
// sync) as their season "primary" position for grouping purposes.
// The fausports.com roster position wins (box score positions shift with subs
// and formations); the box score one covers players not on the roster.
// jersey_number is their squad number from the roster.
export const POSITION_SUBQUERY = `
  LEFT JOIN (
    SELECT pl.id AS player_id,
           COALESCE(CASE UPPER(r.position_short)
             WHEN 'FOR' THEN 'fwd' WHEN 'MID' THEN 'mid' WHEN 'DEF' THEN 'def' WHEN 'GK' THEN 'gk' END, bs.position) AS position,
           r.jersey_number, r.photo_url
    FROM players pl
    LEFT JOIN roster_players r ON r.player_id = pl.id
    LEFT JOIN (
    SELECT player_id, position
    FROM (
      SELECT player_id, position,
             ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY COUNT(*) DESC) AS rn
      FROM (
        SELECT player_id, position FROM player_game_stats WHERE position IS NOT NULL AND position <> ''
        UNION ALL
        SELECT player_id, position FROM minutes_played WHERE position IS NOT NULL AND position <> ''
      )
      GROUP BY player_id, position
    )
    WHERE rn = 1
    ) bs ON bs.player_id = pl.id
  ) pos ON pos.player_id = p.id
`;

playersRouter.get("/", (_req, res) => {
  const db = getDb();
  const players = db
    .prepare(
      `SELECT p.id, p.canonical_name, COUNT(CASE WHEN mp.minutes > 0 THEN 1 END) AS games_played,
              COUNT(s.id) AS sessions, pos.position, pos.jersey_number, pos.photo_url
       FROM players p
       LEFT JOIN gps_sessions s ON s.player_id = p.id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
       ${POSITION_SUBQUERY}
       GROUP BY p.id
       ORDER BY p.canonical_name ASC`,
    )
    .all();
  res.json(players);
});

// Photos and logos for the report PDF (only ones the app already stores).
playersRouter.get("/report-image", sendReportImage);

// The player's season report (for the PDF), optionally for a date range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.
playersRouter.get("/:id/report", (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });
  const report = playerReportFor(playerId, req.query.from, req.query.to);
  if (!report) return res.status(404).json({ error: "player not found" });
  res.json(report);
});

playersRouter.get("/:id", (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });

  const detail = getPlayerDetail(playerId);
  if (!detail) return res.status(404).json({ error: "player not found" });
  res.json(detail);
});

/** Season profile for one player (GPS sessions, averages, box score stats). Shared with the player's own view. */
export function getPlayerDetail(playerId: number) {
  const db = getDb();
  const player = db
    .prepare(`SELECT p.*, pos.position, pos.jersey_number FROM players p ${POSITION_SUBQUERY} WHERE p.id = ?`)
    .get(playerId);
  if (!player) return null;

  const sessions = db
    .prepare(
      `SELECT s.*, g.game_date, g.opponent, mp.minutes AS minutes_played, mp.started, ${SESSION_ROLE_SQL}
       FROM gps_sessions s
       JOIN games g ON g.id = s.game_id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
       WHERE s.player_id = ?
       ORDER BY g.game_date ASC`,
    )
    .all(playerId) as { id: number }[];

  const seasonTotals = db
    .prepare(
      // Games played = logged minutes. Load from warm-up/fitness-only sessions still counts in the totals.
      // Averages and totals leave out glitched sessions (see GLITCH_TOP_SPEED_MPH).
      `SELECT ${CORE_METRIC_KEYS.map((k) => `AVG(CASE WHEN ${VALID} THEN s.${k} END) AS avg_${k}`).join(", ")},
              ${CORE_METRIC_KEYS.map((k) => `SUM(CASE WHEN ${VALID} THEN s.${k} END) AS sum_${k}`).join(", ")},
              COUNT(CASE WHEN mp.minutes > 0 THEN 1 END) AS games_played, COUNT(*) AS sessions
       FROM gps_sessions s
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id
       WHERE s.player_id = ?`,
    )
    .get(playerId);

  const gameStats = db
    .prepare(
      `SELECT pgs.*, sg.game_date, sg.opponent, sg.opponent_logo_url, sg.status, sg.team_score, sg.opponent_score
       FROM player_game_stats pgs
       JOIN schedule_games sg ON sg.id = pgs.schedule_game_id
       WHERE pgs.player_id = ?
       ORDER BY sg.game_date ASC`,
    )
    .all(playerId);

  const statTotals = db
    .prepare(
      `SELECT COALESCE(SUM(goals), 0) AS goals, COALESCE(SUM(assists), 0) AS assists,
              COALESCE(SUM(points), 0) AS points, COALESCE(SUM(shots), 0) AS shots,
              COALESCE(SUM(shots_on_goal), 0) AS shots_on_goal, COALESCE(SUM(yellow_cards), 0) AS yellow_cards,
              COALESCE(SUM(red_cards), 0) AS red_cards, COUNT(*) AS games_with_stats
       FROM player_game_stats WHERE player_id = ?`,
    )
    .get(playerId);

  // Profile from the fausports.com roster (photo, height, year, hometown...), when they're on it.
  const profile =
    db
      .prepare(
        `SELECT ${PROFILE_COLUMNS.join(", ")}, position_short, academic_year FROM roster_players WHERE player_id = ? LIMIT 1`,
      )
      .get(playerId) ?? null;

  return { player, profile, sessions: withFlags(sessions), seasonTotals, gameStats, statTotals };
}

const isoDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The season report for one player (shared with the player's own download). Defaults to this season so far. */
export function playerReportFor(playerId: number, from: unknown, to: unknown) {
  const detail = getPlayerDetail(playerId);
  if (!detail) return null;
  const today = teamToday();
  const teamSessions = getDb()
    .prepare(
      `SELECT s.*, g.game_date, g.opponent, mp.minutes AS minutes_played, mp.started
       FROM gps_sessions s JOIN games g ON g.id = s.game_id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id`,
    )
    .all() as ReportSession[];
  const positions = Object.fromEntries(
    (getDb().prepare(`SELECT p.id, pos.position FROM players p ${POSITION_SUBQUERY}`).all() as { id: number; position: string | null }[]).map((r) => [r.id, r.position]),
  );
  // Each opponent's NCAA.com logo (transparent vector), matched by game date: the schedule's own
  // fausports.com logos are small PNGs, some with white backgrounds.
  const opponentLogos = Object.fromEntries(
    (
      getDb()
        .prepare(
          `SELECT substr(game_date, 1, 10) AS day, CASE WHEN home_seo = @us THEN away_seo ELSE home_seo END AS seo
           FROM ncaa_games WHERE home_seo = @us OR away_seo = @us`,
        )
        .all({ us: OUR_TEAM }) as { day: string; seo: string | null }[]
    )
      .filter((r) => r.seo)
      .map((r) => [r.day, ncaaLogoUrl(r.seo as string)]),
  );
  return buildPlayerReport({
    positions,
    opponentLogos,
    player: detail.player as ReportInput["player"],
    profile: detail.profile as Record<string, unknown> | null,
    sessions: detail.sessions as unknown as ReportSession[],
    gameStats: detail.gameStats as ReportGameStat[],
    teamSessions,
    from: isoDay(from) ? from : seasonStart(today),
    to: isoDay(to) ? to : today,
    generated: today,
  });
}
