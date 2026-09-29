import { getDb } from "../db/connection.js";
import { samePersonScore } from "../import/samePerson.js";
import { teamToday } from "../lib/readiness.js";
import { classicBoxscore, classicRoster, classicSeasonStats, nuxtBoxscore, nuxtRoster, nuxtSeasonStats, type SquadPlayer } from "./readers.js";
import { discoverTeamSites, pool } from "./discover.js";
import { TEAM_SITES, type TeamPlatform } from "./sites.js";

/**
 * Keeps every readable D1 team's squad current from its athletics website:
 * rosters (photos, numbers, bios) weekly, and season stats plus each new box
 * score's player lines (game logs) daily and again in the hours after each of
 * their games. Several teams are read at once, but requests to any one site
 * are spaced out so we stay light on it.
 */

const PAUSE_MS = 300;
const TEAMS_AT_ONCE = 8;
const GAME_LENGTH_MS = 2 * 3600_000;
const AFTER_GAME_MS = 4 * 3600_000; // keep re-reading a team's stats this long after a game ends (sites post them at different speeds)
/** Team/totals lines some stats pages list alongside the players. */
const NOT_A_PLAYER = /^(team|tm|totals?|opponents?)$/i;
const isPlayer = (p: { name: string }) => !NOT_A_PLAYER.test(p.name.trim());
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

/** Some stats pages list a player twice (e.g. a transfer): keep the line with more games. */
function dedupe<T extends { key: string; gp: number | null }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) if (!byKey.has(r.key) || (r.gp ?? 0) > (byKey.get(r.key)!.gp ?? 0)) byKey.set(r.key, r);
  return [...byKey.values()];
}

type Site = { host: string; platform: TeamPlatform };

function siteOf(seo: string): Site {
  const row = getDb().prepare("SELECT host, platform FROM team_sites WHERE team_seo = ?").get(seo) as Site | undefined;
  const site = TEAM_SITES[seo] ?? row;
  if (!site || !site.host || !["sidearm", "sidearm-classic"].includes(site.platform)) throw new Error(`${seo}: no readable site`);
  return site;
}

export async function syncTeamRoster(seo: string) {
  const site = siteOf(seo);
  const players = site.platform === "sidearm" ? await nuxtRoster(site.host) : await classicRoster(site.host);
  saveRoster(seo, players);
  return players.length;
}

export async function syncTeamStats(seo: string, year = Number(teamToday().slice(0, 4))) {
  const site = siteOf(seo);
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
    for (const p of dedupe(stats.players.filter(isPlayer))) field.run(seo, p.key, p.name, p.jersey_number, ...fieldCols.map((c) => p[c]));
    // Keepers: add their goalkeeping to their row (or a new row if they have no field line).
    const keeper = db.prepare(
      `INSERT INTO team_player_stats (team_seo, player_key, name, jersey_number, gp, gs, is_goalkeeper, ${gkCols.join(", ")})
       VALUES (?, ?, ?, ?, ?, ?, 1, ${gkCols.map(() => "?").join(", ")})
       ON CONFLICT(team_seo, player_key) DO UPDATE SET is_goalkeeper = 1,
         gp = COALESCE(team_player_stats.gp, excluded.gp), gs = COALESCE(team_player_stats.gs, excluded.gs),
         ${gkCols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    );
    for (const k of dedupe(stats.keepers.filter(isPlayer))) keeper.run(seo, k.key, k.name, k.jersey_number, k.gp, k.gs, ...gkCols.map((c) => k[c]));
    db.prepare("UPDATE team_sites SET stats_synced_at = datetime('now'), last_error = NULL WHERE team_seo = ?").run(seo);
  })();

  // Game logs from box scores not read yet (finished games don't change). Box score keys are matched to the squad's
  // (by id, else by name, since sites sometimes use a different id or spelling there).
  const known = squadKeys(seo);
  const read = new Set(
    (db.prepare("SELECT boxscore_url FROM team_boxscores WHERE team_seo = ?").all(seo) as { boxscore_url: string }[]).map((r) => r.boxscore_url),
  );
  let newGames = 0;
  for (const g of stats.games) {
    if (read.has(g.boxscoreUrl) || !g.result) continue;
    await pause();
    try {
      const lines = (site.platform === "sidearm" ? await nuxtBoxscore(g.boxscoreUrl) : await classicBoxscore(g.boxscoreUrl)).map((l) => ({
        ...l,
        key: known.resolve(l.key, l.name),
      }));
      const insert = db.prepare(
        `INSERT OR REPLACE INTO team_player_games (team_seo, player_key, game_date, opponent, home_away, result, started, minutes,
           goals, assists, shots, shots_on_goal, yellow_cards, red_cards, saves, goals_allowed, boxscore_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      db.transaction(() => {
        for (const l of lines.filter(isPlayer))
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

function squadKeys(seo: string) {
  const rows = getDb()
    .prepare("SELECT player_key AS key, name FROM team_players WHERE team_seo = ? UNION SELECT player_key, name FROM team_player_stats WHERE team_seo = ?")
    .all(seo, seo) as { key: string; name: string }[];
  const keys = new Set(rows.map((r) => r.key));
  return {
    resolve(key: string, name: string) {
      if (keys.has(key)) return key;
      const hits = rows.filter((r) => samePersonScore(name, r.name) >= 2);
      return hits.length === 1 ? hits[0].key : key;
    },
  };
}

/** Reads the given teams' rosters and stats (several teams at once). */
export async function syncTeams(work: { rosters: string[]; stats: string[] }) {
  seedSites();
  await discoverTeamSites().catch((err) => console.error(`[teams] discovery failed: ${(err as Error).message}`));
  const db = getDb();
  const rosters = new Set(work.rosters);
  const seos = [...new Set([...work.rosters, ...work.stats])];
  const t0 = Date.now();
  await pool(seos, TEAMS_AT_ONCE, async (seo) => {
    // A roster page we can't read doesn't stop the stats (the squad then comes from the stats table).
    if (rosters.has(seo)) {
      try {
        const n = await syncTeamRoster(seo);
        console.log(`[teams] ${seo}: roster ${n}`);
      } catch (err) {
        console.error(`[teams] ${seo} roster failed: ${(err as Error).message}`);
        db.prepare("UPDATE team_sites SET last_error = ?, roster_synced_at = datetime('now') WHERE team_seo = ?").run((err as Error).message.slice(0, 300), seo);
      }
      await pause();
    }
    try {
      const s = await syncTeamStats(seo);
      console.log(`[teams] ${seo}: stats ${s.players} players, ${s.keepers} keepers, ${s.newGames} new games`);
    } catch (err) {
      console.error(`[teams] ${seo} failed: ${(err as Error).message}`);
      db.prepare("UPDATE team_sites SET last_error = ? WHERE team_seo = ?").run((err as Error).message.slice(0, 300), seo);
    }
    await pause();
  });
  if (seos.length) console.log(`[teams] ${seos.length} teams read in ${Math.round((Date.now() - t0) / 1000)}s`);
}

/** Every readable team: rosters when asked, stats always. */
export async function syncAllTeams({ rosters }: { rosters: boolean }) {
  seedSites();
  await discoverTeamSites().catch((err) => console.error(`[teams] discovery failed: ${(err as Error).message}`));
  const all = readableTeams().map((t) => t.team_seo);
  await syncTeams({ rosters: rosters ? all : [], stats: all });
}

function readableTeams() {
  return getDb()
    .prepare("SELECT team_seo, roster_synced_at, stats_synced_at FROM team_sites WHERE host != '' AND platform IN ('sidearm', 'sidearm-classic')")
    .all() as { team_seo: string; roster_synced_at: string | null; stats_synced_at: string | null }[];
}

const ms = (at: string | null) => (at ? Date.parse(`${at.replace(" ", "T")}Z`) : 0);

/**
 * Which teams are due, from the stored sync times (so a restart doesn't
 * re-read everything): rosters weekly; stats daily, and on every check in the
 * few hours after a team's game ends until a read lands after that window.
 */
export function teamSyncDue(): { rosters: string[]; stats: string[] } {
  seedSites();
  const now = Date.now();
  const year = teamToday().slice(0, 4);
  const lastGameEnd = new Map(
    (getDb()
      .prepare(
        `SELECT seo, MAX(start_epoch) AS start FROM (
           SELECT home_seo AS seo, start_epoch FROM ncaa_games WHERE state = 'F' AND game_date LIKE ?
           UNION ALL SELECT away_seo, start_epoch FROM ncaa_games WHERE state = 'F' AND game_date LIKE ?)
         GROUP BY seo`,
      )
      .all(`${year}-%`, `${year}-%`) as { seo: string; start: number | null }[]).map((r) => [r.seo, (r.start ?? 0) * 1000 + GAME_LENGTH_MS]),
  );
  const rosters: string[] = [];
  const stats: string[] = [];
  for (const t of readableTeams()) {
    if (now - ms(t.roster_synced_at) > 7 * 86400_000) rosters.push(t.team_seo);
    const end = lastGameEnd.get(t.team_seo) ?? 0;
    const afterGame = end < now && ms(t.stats_synced_at) < end + AFTER_GAME_MS;
    if (now - ms(t.stats_synced_at) > 20 * 3600_000 || afterGame) stats.push(t.team_seo);
  }
  return { rosters, stats };
}
