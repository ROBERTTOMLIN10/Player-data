// Temporary: full D1 squad sync test (v3). Removed before merge.
import { migrate } from "../../server/src/db/migrate.js";
import { getDb } from "../../server/src/db/connection.js";
import { syncAllTeams } from "../../server/src/teams/sync.js";

migrate();
const t0 = Date.now();
await syncAllTeams({ rosters: true });
console.log(`TOTAL ${Math.round((Date.now() - t0) / 1000)}s`);
const db = getDb();
const rows = db
  .prepare(
    `SELECT s.team_seo, s.host, s.platform, s.last_error,
       (SELECT COUNT(*) FROM team_players p WHERE p.team_seo = s.team_seo) AS players,
       (SELECT COUNT(*) FROM team_players p WHERE p.team_seo = s.team_seo AND p.photo_url IS NOT NULL) AS photos,
       (SELECT COUNT(*) FROM team_player_stats p WHERE p.team_seo = s.team_seo) AS stats,
       (SELECT COUNT(*) FROM team_boxscores b WHERE b.team_seo = s.team_seo) AS games,
       (SELECT COUNT(*) FROM team_player_games g WHERE g.team_seo = s.team_seo) AS lines
     FROM team_sites s ORDER BY s.platform, s.team_seo`,
  )
  .all() as Record<string, unknown>[];
const sum = (k: string) => rows.reduce((n, r) => n + Number(r[k]), 0);
console.log("SUMMARY", JSON.stringify({ teams: rows.length, players: sum("players"), photos: sum("photos"), stats: sum("stats"), games: sum("games"), lines: sum("lines") }));
for (const p of ["sidearm", "sidearm-classic", "other"]) {
  const r = rows.filter((x) => x.platform === p);
  console.log(p, r.length, "teams;", r.filter((x) => Number(x.players) > 0).length, "with roster;", r.filter((x) => Number(x.stats) > 0).length, "with stats;", r.filter((x) => Number(x.games) > 0).length, "with games");
}
for (const r of rows) if (r.platform === "other" || !Number(r.players) || !Number(r.stats) || (r.platform === "sidearm" && !Number(r.games))) console.log("ISSUE", JSON.stringify(r));
