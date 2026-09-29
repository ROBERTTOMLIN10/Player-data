import { getDb } from "../db/connection.js";
import { teamToday } from "../lib/readiness.js";
import { classicRoster, classicSeasonStats, nuxtBoxscore, nuxtRoster, nuxtSeasonStats, type SquadPlayer } from "./readers.js";
import { TEAM_SITES } from "./sites.js";

/**
 * Keeps other teams' squads current from their athletics websites: rosters
 * (photos, numbers, bios) weekly and season stats daily, plus each new box
 * score's player lines for game logs. Requests are spaced out so we stay
 * light on their sites.
 */

const PAUSE_MS = 400;
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

const PLAYER_COLS = [
  "name", "jersey_number", "position_short", "position_long", "academic_year", "academic_year_long", "height_feet",
  "height_inches", "weight", "hometown", "high_school", "previous_school", "major", "birth_date", "is_captain", "instagram",
  "photo_url", "profile_url",
] as const;

function seedSites() {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO team_sites (team_seo, host, platform) VALUES (?, ?, ?)
     ON CONFLICT(team_seo) DO UPDATE SET host = excluded.host, platform = excluded.platform`,
  );
  for (const [seo, s] of Object.entries(TEAM_SITES)) upsert.run(seo, s.host, s.platform);
}

function saveRoster(seo: string, players: SquadPlayer[]) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO team_players (team_seo, player_key, ${PLAYER_COLS.join(", ")}) VALUES (?, ?, ${PLAYER_COLS.map(() => "?").join(", ")})`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM team_players WHERE team_seo = ?").run(seo);
    for (const p of players) insert.run(seo, p.key, ...PLAYER_COLS.map((c) => p[c] ?? (c === "is_captain" ? 0 : null)));
    db.prepare("UPDATE team_sites SET roster_synced_at = datetime('now') WHERE team_seo = ?").run(seo);
  })();
}

export async function syncTeamRoster(seo: string) {
  const site = TEAM_SITES[seo];
  const players = site.platform === "sidearm" ? await nuxtRoster(site.host) : await classicRoster(site.host);
  saveRoster(seo, players);
  return players.length;
}

export async function syncTeamStats(seo: string, year = Number(teamToday().slice(0, 4))) {
  const site = TEAM_SITES[seo];
  const db = getDb();
  const stats = site.platform === "sidearm" ? await nuxtSeasonStats(site.host, year) : await classicSeasonStats(site.host, year);

  const fieldCols = ["gp", "gs", "minutes", "goals", "assists", "points", "shots", "shots_on_goal", "yellow_cards", "red_cards", "game_winners", "pk_goals", "pk_attempts"] as const;
  const gkCols = ["gk_minutes", "goals_allowed", "gaa", "saves", "save_pct", "wins", "losses", "ties", "shutouts"] as const;
  db.transaction(() => {
    db.prepare("DELETE FROM team_player_stats WHERE team_seo = ?").run(seo);
    const field = db.prepare(
      `INSERT INTO team_player_stats (team_seo, player_key, name, jersey_number, ${fieldCols.join(", ")})
       VALUES (?, ?, ?, ?, ${fieldCols.map(() => "?").join(", ")})`,
    );
    for (const p of stats.players) field.run(seo, p.key, p.name, p.jersey_number, ...fieldCols.map((c) => p[c]));
    // Keepers: add their goalkeeping to their row (or a new row if they have no field line).
    const keeper = db.prepare(
      `INSERT INTO team_player_stats (team_seo, player_key, name, jersey_number, gp, gs, is_goalkeeper, ${gkCols.join(", ")})
       VALUES (?, ?, ?, ?, ?, ?, 1, ${gkCols.map(() => "?").join(", ")})
       ON CONFLICT(team_seo, player_key) DO UPDATE SET is_goalkeeper = 1,
         gp = COALESCE(team_player_stats.gp, excluded.gp), gs = COALESCE(team_player_stats.gs, excluded.gs),
         ${gkCols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    );
    for (const k of stats.keepers) keeper.run(seo, k.key, k.name, k.jersey_number, k.gp, k.gs, ...gkCols.map((c) => k[c]));
    db.prepare("UPDATE team_sites SET stats_synced_at = datetime('now'), last_error = NULL WHERE team_seo = ?").run(seo);
  })();

  // Game logs from box scores not read yet (finished games don't change).
  const read = new Set(
    (db.prepare("SELECT boxscore_url FROM team_boxscores WHERE team_seo = ?").all(seo) as { boxscore_url: string }[]).map((r) => r.boxscore_url),
  );
  let newGames = 0;
  for (const g of stats.games) {
    if (read.has(g.boxscoreUrl) || site.platform !== "sidearm") continue;
    await pause();
    try {
      const lines = await nuxtBoxscore(g.boxscoreUrl);
      const insert = db.prepare(
        `INSERT OR REPLACE INTO team_player_games (team_seo, player_key, game_date, opponent, home_away, result, started, minutes,
           goals, assists, shots, shots_on_goal, yellow_cards, red_cards, saves, goals_allowed, boxscore_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      db.transaction(() => {
        for (const l of lines)
          insert.run(seo, l.key, g.date, g.opponent, g.home ? "home" : "away", g.result, l.started ? 1 : 0, l.minutes, l.goals, l.assists,
            l.shots, l.shots_on_goal, l.yellow_cards, l.red_cards, l.saves, l.goals_allowed, g.boxscoreUrl);
        db.prepare("INSERT OR REPLACE INTO team_boxscores (team_seo, boxscore_url, game_date) VALUES (?, ?, ?)").run(seo, g.boxscoreUrl, g.date);
      })();
      newGames++;
    } catch (err) {
      console.error(`[teams] ${seo} box score ${g.boxscoreUrl} failed: ${(err as Error).message}`);
    }
  }
  return { players: stats.players.length, keepers: stats.keepers.length, newGames };
}

/** Every configured team: rosters when asked (weekly), stats + new box scores always (daily). */
export async function syncTeams({ rosters }: { rosters: boolean }) {
  seedSites();
  const db = getDb();
  for (const seo of Object.keys(TEAM_SITES)) {
    try {
      if (rosters) {
        const n = await syncTeamRoster(seo);
        await pause();
        console.log(`[teams] ${seo}: roster ${n}`);
      }
      const s = await syncTeamStats(seo);
      console.log(`[teams] ${seo}: stats ${s.players} players, ${s.keepers} keepers, ${s.newGames} new games`);
    } catch (err) {
      console.error(`[teams] ${seo} failed: ${(err as Error).message}`);
      db.prepare("UPDATE team_sites SET last_error = ? WHERE team_seo = ?").run((err as Error).message.slice(0, 300), seo);
    }
    await pause();
  }
}

/** What's due, from the stored sync times (so a server restart doesn't re-read everything): rosters weekly, stats daily. */
export function teamSyncDue(): { rosters: boolean; stats: boolean } {
  seedSites();
  const row = getDb()
    .prepare(
      `SELECT MIN(COALESCE(roster_synced_at, '0')) AS roster, MIN(COALESCE(stats_synced_at, '0')) AS stats FROM team_sites`,
    )
    .get() as { roster: string; stats: string };
  const older = (at: string, hours: number) => at === "0" || Date.now() - Date.parse(`${at.replace(" ", "T")}Z`) > hours * 3600_000;
  return { rosters: older(row.roster, 7 * 24), stats: older(row.stats, 20) };
}
