// Temporary: checks D1 team site discovery. Removed before merge.
import fs from "node:fs";
import { fetchText } from "../../server/src/ncaa/client.js";
import { migrate } from "../../server/src/db/migrate.js";
import { getDb } from "../../server/src/db/connection.js";
import { d1Teams, discoverTeamSites } from "../../server/src/teams/discover.js";

migrate();
const teams = d1Teams();
console.log("D1 teams:", teams.length);
for (const seo of ["florida-atlantic", "stanford", "air-force"]) {
  const html = await fetchText(`https://www.ncaa.com/schools/${seo}`);
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !/ncaa\.com/.test(u));
  console.log(seo, JSON.stringify(hrefs.slice(0, 40)));
  const i = html.search(/Athletic|athletics/i);
  console.log("snippet:", html.slice(Math.max(0, i - 800), i + 800).replace(/\s+/g, " "));
}
const t0 = Date.now();
console.log(await discoverTeamSites(), `${Math.round((Date.now() - t0) / 1000)}s`);
const rows = getDb().prepare("SELECT team_seo, host, platform, last_error FROM team_sites ORDER BY platform, team_seo").all();
const counts: Record<string, number> = {};
for (const r of rows as { platform: string }[]) counts[r.platform] = (counts[r.platform] ?? 0) + 1;
console.log(counts);
for (const r of rows) console.log(JSON.stringify(r));
fs.mkdirSync("probe-out", { recursive: true });
fs.writeFileSync("probe-out/sites.json", JSON.stringify(rows, null, 1));
