// Temporary: full D1 squad sync test with the remaining teams. Removed before merge.
import { migrate } from "../../server/src/db/migrate.js";
import { getDb } from "../../server/src/db/connection.js";
import { syncAllTeams } from "../../server/src/teams/sync.js";

migrate();
getDb().prepare("UPDATE team_sites SET discovered_at = NULL WHERE platform = 'other'").run(); // as if a day has passed
const t0 = Date.now();
await syncAllTeams({ rosters: true });
console.log(`TOTAL ${Math.round((Date.now() - t0) / 1000)}s`);
const rows = getDb()
  .prepare(
    `SELECT s.team_seo, s.host, s.platform, s.stats_team_id, s.roster_url, s.last_error,
       (SELECT COUNT(*) FROM team_players p WHERE p.team_seo = s.team_seo) AS players,
       (SELECT COUNT(*) FROM team_players p WHERE p.team_seo = s.team_seo AND p.photo_url IS NOT NULL) AS photos,
       (SELECT COUNT(*) FROM team_player_stats p WHERE p.team_seo = s.team_seo) AS stats,
       (SELECT COUNT(*) FROM team_boxscores b WHERE b.team_seo = s.team_seo) AS games,
       (SELECT COUNT(*) FROM team_player_games g WHERE g.team_seo = s.team_seo) AS lines,
       (SELECT COUNT(DISTINCT g.player_key) FROM team_player_games g WHERE g.team_seo = s.team_seo
          AND g.player_key NOT IN (SELECT player_key FROM team_players p WHERE p.team_seo = s.team_seo)) AS orphan_lines
     FROM team_sites s ORDER BY s.platform, s.team_seo`,
  )
  .all() as Record<string, unknown>[];
const sum = (k: string) => rows.reduce((n, r) => n + Number(r[k]), 0);
console.log("SUMMARY", JSON.stringify({ teams: rows.length, players: sum("players"), photos: sum("photos"), stats: sum("stats"), games: sum("games"), lines: sum("lines") }));
for (const p of ["sidearm", "sidearm-classic", "wmt", "other"]) {
  const r = rows.filter((x) => x.platform === p);
  console.log(p, r.length, "teams;", r.filter((x) => Number(x.players) > 0).length, "roster;", r.filter((x) => Number(x.stats) > 0).length, "stats;", r.filter((x) => Number(x.games) > 0).length, "games;", r.filter((x) => Number(x.photos) > 0).length, "photos");
}
const focus = ["ucf","stanford","ucla","clemson","virginia","virginia-tech","penn-st","san-diego-st","san-jose-st","seattle","northwestern","old-dominion","st-thomas-mn","kentucky","notre-dame","south-carolina","stony-brook","quinnipiac","oral-roberts","central-conn-st","bradley","george-mason","louisville","syracuse","wake-forest","colgate","ga-southern","george-washington","uiw"];
for (const r of rows) if (focus.includes(String(r.team_seo)) || r.platform === "other" || !Number(r.players) || !Number(r.stats)) console.log("TEAM", JSON.stringify(r));
