import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { fillMinutesFromBoxScores } from "./importMinutes.js";
import { fetchScheduleGames, type SidearmScheduleGame } from "./sidearmSchedule.js";
import { fetchBoxscoreDetails } from "./sidearmBoxscore.js";
import { matchSidearmPlayer } from "./matchSidearmPlayer.js";

export interface SyncScheduleSummary {
  status: "ok" | "error";
  message: string;
  gamesUpserted: number;
  gamesWithStatsSynced: number;
  playerRowsUpserted: number;
  anomalies: string[];
  unmatchedPlayers: string[];
}

/**
 * Pulls the full season schedule (past + upcoming) from fausports.com and
 * upserts it into schedule_games, then — for every completed game with a
 * published box score — fetches the full stat line (goals/assists/points/
 * cards/goalkeeper stats) and upserts player_game_stats + game_team_totals.
 * Safe to re-run any time (e.g. weekly, or after each game) — everything is
 * keyed by (game_date, opponent) / (schedule_game_id, player_id) so re-runs
 * simply refresh existing rows.
 */
export async function syncSchedule(): Promise<SyncScheduleSummary> {
  const db = getDb();

  console.log("Fetching FAU schedule from fausports.com...");
  let scheduleGames: SidearmScheduleGame[];
  try {
    scheduleGames = await fetchScheduleGames();
  } catch (err) {
    const message = `Failed to fetch/parse the schedule page: ${(err as Error).message}`;
    console.error(message);
    return { status: "error", message, gamesUpserted: 0, gamesWithStatsSynced: 0, playerRowsUpserted: 0, anomalies: [], unmatchedPlayers: [] };
  }
  console.log(`Found ${scheduleGames.length} schedule entries for the season.\n`);

  const upsertGame = db.prepare(`
    INSERT INTO schedule_games (
      game_date, game_time, opponent, opponent_logo_url, location, home_away,
      is_conference, status, team_score, opponent_score, boxscore_url, recap_url, raw_json, updated_at
    ) VALUES (
      @game_date, @game_time, @opponent, @opponent_logo_url, @location, @home_away,
      @is_conference, @status, @team_score, @opponent_score, @boxscore_url, @recap_url, @raw_json, datetime('now')
    )
    ON CONFLICT(game_date, opponent) DO UPDATE SET
      game_time = excluded.game_time,
      opponent_logo_url = excluded.opponent_logo_url,
      location = excluded.location,
      home_away = excluded.home_away,
      is_conference = excluded.is_conference,
      status = excluded.status,
      team_score = excluded.team_score,
      opponent_score = excluded.opponent_score,
      boxscore_url = excluded.boxscore_url,
      recap_url = excluded.recap_url,
      raw_json = excluded.raw_json,
      updated_at = datetime('now')
  `);

  const getGameId = db.prepare("SELECT id FROM schedule_games WHERE game_date = ? AND opponent = ?");

  let gamesUpserted = 0;
  const gameIds: { id: number; sg: SidearmScheduleGame }[] = [];
  const runUpserts = db.transaction(() => {
    for (const sg of scheduleGames) {
      upsertGame.run({
        game_date: sg.gameDate,
        game_time: sg.gameTime,
        opponent: sg.opponent,
        opponent_logo_url: sg.opponentLogoUrl,
        location: sg.location,
        home_away: sg.homeAway,
        is_conference: sg.isConference ? 1 : 0,
        status: sg.status,
        team_score: sg.teamScore,
        opponent_score: sg.opponentScore,
        boxscore_url: sg.boxscoreUrl,
        recap_url: sg.recapUrl,
        raw_json: JSON.stringify(sg.raw),
      });
      gamesUpserted++;
      const row = getGameId.get(sg.gameDate, sg.opponent) as { id: number } | undefined;
      if (row) gameIds.push({ id: row.id, sg });
    }
  });
  runUpserts();

  const upsertPlayerStats = db.prepare(`
    INSERT INTO player_game_stats (
      schedule_game_id, player_id, minutes, started, position, goals, assists, points,
      shots, shots_on_goal, fouls, yellow_cards, red_cards, is_goalie, saves, goals_allowed,
      shutout, source_url, raw_json
    ) VALUES (
      @schedule_game_id, @player_id, @minutes, @started, @position, @goals, @assists, @points,
      @shots, @shots_on_goal, @fouls, @yellow_cards, @red_cards, @is_goalie, @saves, @goals_allowed,
      @shutout, @source_url, @raw_json
    )
    ON CONFLICT(schedule_game_id, player_id) DO UPDATE SET
      minutes = excluded.minutes,
      started = excluded.started,
      position = excluded.position,
      goals = excluded.goals,
      assists = excluded.assists,
      points = excluded.points,
      shots = excluded.shots,
      shots_on_goal = excluded.shots_on_goal,
      fouls = excluded.fouls,
      yellow_cards = excluded.yellow_cards,
      red_cards = excluded.red_cards,
      is_goalie = excluded.is_goalie,
      saves = excluded.saves,
      goals_allowed = excluded.goals_allowed,
      shutout = excluded.shutout,
      source_url = excluded.source_url,
      raw_json = excluded.raw_json
  `);

  const upsertTeamTotals = db.prepare(`
    INSERT INTO game_team_totals (
      schedule_game_id, side, team_name, goals, assists, points, shots, shots_on_goal,
      saves, corners, fouls, offsides, yellow_cards, red_cards, raw_json
    ) VALUES (
      @schedule_game_id, @side, @team_name, @goals, @assists, @points, @shots, @shots_on_goal,
      @saves, @corners, @fouls, @offsides, @yellow_cards, @red_cards, @raw_json
    )
    ON CONFLICT(schedule_game_id, side) DO UPDATE SET
      team_name = excluded.team_name,
      goals = excluded.goals,
      assists = excluded.assists,
      points = excluded.points,
      shots = excluded.shots,
      shots_on_goal = excluded.shots_on_goal,
      saves = excluded.saves,
      corners = excluded.corners,
      fouls = excluded.fouls,
      offsides = excluded.offsides,
      yellow_cards = excluded.yellow_cards,
      red_cards = excluded.red_cards,
      raw_json = excluded.raw_json
  `);

  let gamesWithStatsSynced = 0;
  let playerRowsUpserted = 0;
  const anomalies: string[] = [];
  const unmatchedPlayers: string[] = [];

  for (const { id: scheduleGameId, sg } of gameIds) {
    if (!sg.boxscoreUrl) continue; // upcoming game, or no box score published

    console.log(`- ${sg.gameDate} vs ${sg.opponent}: fetching ${sg.boxscoreUrl}`);
    let details;
    try {
      details = await fetchBoxscoreDetails(sg.boxscoreUrl);
    } catch (err) {
      console.error(`  failed to fetch/parse box score: ${(err as Error).message}`);
      continue;
    }

    gamesWithStatsSynced++;
    const runForGame = db.transaction(() => {
      for (const row of details.players) {
        if (row.anomaly) anomalies.push(`  [${sg.gameDate} vs ${sg.opponent}] ${row.anomaly}`);

        const match = matchSidearmPlayer(db, row.firstLast);
        if (!match.playerId) {
          unmatchedPlayers.push(`  [${sg.gameDate} vs ${sg.opponent}] "${row.rawName}": ${match.note}`);
          continue;
        }
        if (match.matchedVia === "last-name") {
          console.log(`  [linked] ${match.note}`);
        }
        upsertPlayerStats.run({
          schedule_game_id: scheduleGameId,
          player_id: match.playerId,
          minutes: row.minutes,
          started: row.started ? 1 : 0,
          position: row.position,
          goals: row.goals,
          assists: row.assists,
          points: row.points,
          shots: row.shots,
          shots_on_goal: row.shotsOnGoal,
          fouls: row.fouls,
          yellow_cards: row.yellowCards,
          red_cards: row.redCards,
          is_goalie: row.isGoalie ? 1 : 0,
          saves: row.saves,
          goals_allowed: row.goalsAllowed,
          shutout: row.shutout ? 1 : 0,
          source_url: sg.boxscoreUrl,
          raw_json: JSON.stringify(row),
        });
        playerRowsUpserted++;
      }

      upsertTeamTotals.run({
        schedule_game_id: scheduleGameId,
        side: "FAU",
        team_name: details.fauTotals.teamName,
        goals: details.fauTotals.goals,
        assists: details.fauTotals.assists,
        points: details.fauTotals.points,
        shots: details.fauTotals.shots,
        shots_on_goal: details.fauTotals.shotsOnGoal,
        saves: details.fauTotals.saves,
        corners: details.fauTotals.corners,
        fouls: details.fauTotals.fouls,
        offsides: details.fauTotals.offsides,
        yellow_cards: details.fauTotals.yellowCards,
        red_cards: details.fauTotals.redCards,
        raw_json: JSON.stringify(details.fauTotals.raw),
      });
      upsertTeamTotals.run({
        schedule_game_id: scheduleGameId,
        side: "opponent",
        team_name: details.opponentTotals.teamName,
        goals: details.opponentTotals.goals,
        assists: details.opponentTotals.assists,
        points: details.opponentTotals.points,
        shots: details.opponentTotals.shots,
        shots_on_goal: details.opponentTotals.shotsOnGoal,
        saves: details.opponentTotals.saves,
        corners: details.opponentTotals.corners,
        fouls: details.opponentTotals.fouls,
        offsides: details.opponentTotals.offsides,
        yellow_cards: details.opponentTotals.yellowCards,
        red_cards: details.opponentTotals.redCards,
        raw_json: JSON.stringify(details.opponentTotals.raw),
      });
    });
    runForGame();
  }

  const message = `Schedule games synced: ${gamesUpserted}, box scores processed: ${gamesWithStatsSynced}, player stat rows upserted: ${playerRowsUpserted}.`;
  console.log(`\nDone. ${message}`);

  if (anomalies.length > 0) {
    console.log(`\n${anomalies.length} data anomaly(ies) from Sidearm (auto-resolved, worth a sanity check):`);
    for (const a of anomalies) console.log(a);
  }
  if (unmatchedPlayers.length > 0) {
    console.log(`\n${unmatchedPlayers.length} Sidearm player(s) could not be matched to a known player:`);
    for (const u of unmatchedPlayers) console.log(u);
  }

  // New box scores: give the matching GPS games their minutes right away.
  fillMinutesFromBoxScores();
  return { status: "ok", message, gamesUpserted, gamesWithStatsSynced, playerRowsUpserted, anomalies, unmatchedPlayers };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  syncSchedule().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}
