import fs from "node:fs";
const out = `${process.env.RUNNER_TEMP}/fixtures`;
fs.mkdirSync(out, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (compatible; FAU-soccer-app)" };
const pages: Record<string, string> = {
  "fiu-roster.html": "https://fiusports.com/sports/mens-soccer/roster",
  "fiu-stats.html": "https://fiusports.com/sports/mens-soccer/stats/2026",
  "stetson-roster.html": "https://gohatters.com/sports/mens-soccer/roster",
  "stetson-stats.html": "https://gohatters.com/sports/mens-soccer/stats/2026",
  "temple-roster.html": "https://owlsports.com/sports/mens-soccer/roster",
  "temple-stats.html": "https://owlsports.com/sports/mens-soccer/stats/2026",
  "ucf-roster.html": "https://ucfknights.com/sports/mens-soccer/roster",
  "ucf-stats.html": "https://ucfknights.com/sports/mens-soccer/stats",
  "ncaa-school-memphis.html": "https://www.ncaa.com/schools/memphis",
};
for (const [name, url] of Object.entries(pages)) {
  try {
    const r = await fetch(url, { headers: UA });
    const html = await r.text();
    fs.writeFileSync(`${out}/${name}`, html);
    console.log(name, r.status, html.length);
  } catch (e) { console.log(name, "ERR", (e as Error).message); }
}
// A Temple box score and an FIU (old) box score, from their stats pages
for (const [name, host, file] of [["temple", "owlsports.com", "temple-stats.html"], ["fiu", "fiusports.com", "fiu-stats.html"]] as const) {
  const html = fs.readFileSync(`${out}/${file}`, "utf-8");
  const m = html.match(/\/sports\/mens-soccer\/stats\/2026\/[^"'\\]+\/boxscore\/\d+/);
  if (m) {
    const r = await fetch(`https://${host}${m[0]}`, { headers: UA });
    fs.writeFileSync(`${out}/${name}-boxscore.html`, await r.text());
    console.log(name, "boxscore", m[0], r.status);
  } else console.log(name, "no boxscore link found");
}
