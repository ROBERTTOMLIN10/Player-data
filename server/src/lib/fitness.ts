import { getDb } from "../db/connection.js";
import { shiftDate } from "./readiness.js";

/**
 * Fitness vs the match group. Players wear trackers for the warm-up and the
 * post-game fitness work even when they don't get on the pitch, so a GPS load
 * with no minutes is still training load (just not a game played). To keep
 * non-playing players on track with the ones gaining match fitness, each
 * player's load over a window is compared with what the players who got
 * minutes averaged in those same games.
 */
export const FITNESS_WINDOWS = [7, 28] as const;
export const FITNESS_AMBER = 85; // % of match load: below this is amber
export const FITNESS_RED = 70; // below this is red

/**
 * SQL for one session's role. `played`: logged minutes. `box_score`: the game
 * has minutes data at all (preseason exhibitions often don't), so no minutes
 * means "didn't play" rather than "unknown".
 */
export const SESSION_ROLE_SQL = `
  CASE WHEN mp.minutes > 0 THEN 1 ELSE 0 END AS played,
  EXISTS (SELECT 1 FROM minutes_played x WHERE x.game_id = s.game_id) AS box_score`;

export type FitnessStatus = "ok" | "amber" | "red";

export interface FitnessWindow {
  days: number;
  games: number; // tracked games in the window
  load: number; // the player's total load
  matchLoad: number; // what a player getting minutes averaged over the same games
  pct: number | null; // load / matchLoad, %
  status: FitnessStatus | null;
}

export interface PlayerFitness {
  playerId: number;
  name: string;
  gamesPlayed: number; // logged minutes
  fitnessSessions: number; // load but no minutes, in games with a box score
  otherSessions: number; // load in games without a box score (minutes unknown)
  windows: FitnessWindow[];
}

export function fitnessStatus(pct: number | null): FitnessStatus | null {
  if (pct === null) return null;
  return pct < FITNESS_RED ? "red" : pct < FITNESS_AMBER ? "amber" : "ok";
}

interface SessionRow {
  player_id: number;
  name: string;
  game_id: number;
  game_date: string;
  load: number | null;
  played: number;
  box_score: number;
}

/** Every player with a tracked session, with their load vs the match group. Windows end at the latest tracked game. */
export function computeFitness(): { asOf: string | null; players: PlayerFitness[] } {
  const rows = getDb()
    .prepare(
      `SELECT s.player_id, p.canonical_name AS name, s.game_id, g.game_date, s.load, ${SESSION_ROLE_SQL}
       FROM gps_sessions s
       JOIN games g ON g.id = s.game_id
       JOIN players p ON p.id = s.player_id
       LEFT JOIN minutes_played mp ON mp.game_id = s.game_id AND mp.player_id = s.player_id`,
    )
    .all() as SessionRow[];
  if (rows.length === 0) return { asOf: null, players: [] };

  // Match load per game: the average load of players who logged minutes, or of
  // everyone tracked when the game has no box score.
  const games = new Map<number, { date: string; match: number }>();
  const byGame = new Map<number, SessionRow[]>();
  for (const r of rows) byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r]);
  for (const [id, list] of byGame) {
    const group = list[0].box_score ? list.filter((r) => r.played) : list;
    const loads = group.map((r) => r.load).filter((l): l is number => l !== null);
    games.set(id, { date: list[0].game_date, match: loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0 });
  }
  const asOf = [...games.values()].reduce((max, g) => (g.date > max ? g.date : max), "");

  const byPlayer = new Map<number, SessionRow[]>();
  for (const r of rows) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);

  const players = [...byPlayer.values()].map((list): PlayerFitness => {
    const windows = FITNESS_WINDOWS.map((days): FitnessWindow => {
      const from = shiftDate(asOf, -(days - 1));
      const windowGames = [...games.entries()].filter(([, g]) => g.date >= from && g.date <= asOf);
      const matchLoad = windowGames.reduce((sum, [, g]) => sum + g.match, 0);
      const ids = new Set(windowGames.map(([id]) => id));
      const load = list.filter((r) => ids.has(r.game_id)).reduce((sum, r) => sum + (r.load ?? 0), 0);
      const pct = matchLoad > 0 ? Math.round((load / matchLoad) * 100) : null;
      return { days, games: windowGames.length, load: Math.round(load), matchLoad: Math.round(matchLoad), pct, status: fitnessStatus(pct) };
    });
    return {
      playerId: list[0].player_id,
      name: list[0].name,
      gamesPlayed: list.filter((r) => r.played).length,
      fitnessSessions: list.filter((r) => !r.played && r.box_score).length,
      otherSessions: list.filter((r) => !r.box_score).length,
      windows,
    };
  });
  // Furthest behind first.
  players.sort((a, b) => (a.windows[1].pct ?? 999) - (b.windows[1].pct ?? 999) || a.name.localeCompare(b.name));
  return { asOf, players };
}
