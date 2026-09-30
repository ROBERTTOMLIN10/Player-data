// Temporary: conference stats JSON for the last three teams (v3). Removed before merge.
import fs from "node:fs";
const UA = "Mozilla/5.0 (compatible; FAU men's soccer staff app)";
fs.mkdirSync("probe-out", { recursive: true });
const teams: [string, string, string][] = [
  ["ccsu", "https://necsports.com", "127"],
  ["colgate", "https://patriotleague.org", "153"],
  ["stthomas", "https://thesummitleague.org", "620"],
];
for (const [name, host, id] of teams) {
  for (const method of ["get_team_stats", "get_team_schedule", "get_team_games", "get_team_game_by_game"]) {
    const u = `${host}/services/conf_stats.ashx?method=${method}&team_id=${id}&sport=msoc&year=2026&conf=False&postseason=False`;
    try {
      const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(25000) });
      const t = await res.text();
      fs.writeFileSync(`probe-out/${name}-${method}.json`, t);
      console.log(name, method, res.status, t.length, t.slice(0, 300).replace(/\s+/g, " "));
    } catch (e) { console.log(name, method, "ERR", (e as Error).message); }
  }
}
