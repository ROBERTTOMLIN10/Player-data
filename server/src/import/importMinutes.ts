import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { fetchScheduleGames, type SidearmScheduleGame } from "./sidearmSchedule.js";
import { fetchBoxscoreMinutes } from "./sidearmBoxscore.js";
import { matchSidearmPlayer } from "./matchSidearmPlayer.js";

interface LocalGame {
  id: number;
  game_date: string;
  opponent: string | null;
}

export interface SyncMinutesSummary {
  status: "ok" | "error";
  message: string;
  gamesMatched: number;
  gamesSkippedNoBoxscore: number;
  rowsUpserted: number;
  anomalies: string[];
  unmatchedPlayers: string[];
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function opponentsLookRelated(a: string | null, b: string): boolean {
  if (!a) return false;
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  return na.includes(nb) || nb.includes(na);
}

export async function syncMinutes(): Promise<SyncMinutesSummary> {
  const db = getDb();
  const localGames = db.prepare("SELECT id, game_date, opponent FROM games ORDER BY game_date").all() as LocalGame[];
  if (localGames.length === 0) {
    const message = "No games in the database yet — import a Titan file first.";
    console.log(message);
    return { status: "error", message, gamesMatched: 0, gamesSkippedNoBoxscore: 0, rowsUpserted: 0, anomalies: [], unmatchedPlayers: [] };
  }

  console.log("Fetching FAU schedule from fausports.com...");
  let scheduleGames: SidearmScheduleGame[];
  try {
    scheduleGames = await fetchScheduleGames();
  } catch (err) {
    const message = `Failed to fetch/parse the schedule page: ${(err as Error).message}`;
    console.error(message);
    return { status: "error", message, gamesMatched: 0, gamesSkippedNoBoxscore: 0, rowsUpserted: 0, anomalies: [], unmatchedPlayers: [] };
  }
  console.log(`Found ${scheduleGames.length} completed game(s) with a published box score.\n`);

  const upsertMinutes = db.prepare(`
    INSERT INTO minutes_played (game_id, player_id, minutes, started, position, source_url)
    VALUES (@game_id, @player_id, @minutes, @started, @position, @source_url)
    ON CONFLICT(game_id, player_id) DO UPDATE SET
      minutes = excluded.minutes,
      started = excluded.started,
      position = excluded.position,
      source_url = excluded.source_url
  `);

  let gamesMatched = 0;
  let gamesSkippedNoBoxscore = 0;
  let rowsUpserted = 0;
  const unmatchedPlayers: string[] = [];
  const anomalies: string[] = [];

  for (const game of localGames) {
    const scheduleMatch = scheduleGames.find((sg) => sg.gameDate === game.game_date);
    if (!scheduleMatch) {
      console.log(
        `- ${game.game_date} vs ${game.opponent ?? "?"}: no official box score found (likely an exhibition/scrimmage not on the published schedule). Skipping.`,
      );
      gamesSkippedNoBoxscore++;
      continue;
    }
    if (!opponentsLookRelated(game.opponent, scheduleMatch.opponent)) {
      console.warn(
        `  [warn] date matched (${game.game_date}) but opponent names differ: local="${game.opponent}" vs schedule="${scheduleMatch.opponent}". Proceeding with the date match, but double-check this pairing.`,
      );
    }

    console.log(`- ${game.game_date} vs ${scheduleMatch.opponent}: fetching ${scheduleMatch.boxscoreUrl}`);
    let rows;
    try {
      rows = await fetchBoxscoreMinutes(scheduleMatch.boxscoreUrl);
    } catch (err) {
      console.error(`  failed to fetch/parse box score: ${(err as Error).message}`);
      continue;
    }

    gamesMatched++;
    const runForGame = db.transaction(() => {
      for (const row of rows) {
        if (row.anomaly) anomalies.push(`  [${game.game_date} vs ${scheduleMatch.opponent}] ${row.anomaly}`);

        const match = matchSidearmPlayer(db, row.firstLast);
        if (!match.playerId) {
          unmatchedPlayers.push(`  [${game.game_date} vs ${scheduleMatch.opponent}] "${row.rawName}": ${match.note}`);
          continue;
        }
        if (match.matchedVia === "last-name") {
          console.log(`  [linked] ${match.note}`);
        }
        upsertMinutes.run({
          game_id: game.id,
          player_id: match.playerId,
          minutes: row.minutes,
          started: row.started ? 1 : 0,
          position: row.position,
          source_url: scheduleMatch.boxscoreUrl,
        });
        rowsUpserted++;
      }
    });
    runForGame();
  }

  const message = `Games matched: ${gamesMatched}, skipped (no box score): ${gamesSkippedNoBoxscore}, minutes rows upserted: ${rowsUpserted}.`;
  console.log(`\nDone. ${message}`);

  if (anomalies.length > 0) {
    console.log(`\n${anomalies.length} data anomaly(ies) from Sidearm (auto-resolved, worth a sanity check):`);
    for (const a of anomalies) console.log(a);
  }
  if (unmatchedPlayers.length > 0) {
    console.log(`\n${unmatchedPlayers.length} Sidearm player(s) could not be matched to a known player:`);
    for (const u of unmatchedPlayers) console.log(u);
    console.log(
      "\nTo resolve: confirm the correct player, then run e.g.\n" +
        "  INSERT INTO player_aliases (player_id, normalized_alias, raw_alias) VALUES (<id>, '<normalized first last>', '<raw name>');\n" +
        "and re-run the sync (it's safe to re-run).",
    );
  }

  return { status: "ok", message, gamesMatched, gamesSkippedNoBoxscore, rowsUpserted, anomalies, unmatchedPlayers };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  syncMinutes().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}
