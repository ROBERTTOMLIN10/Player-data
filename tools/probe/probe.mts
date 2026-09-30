// Temporary: conference team stats pages for the last three teams (v2). Removed before merge.
import fs from "node:fs";
const UA = "Mozilla/5.0 (compatible; FAU men's soccer staff app)";
fs.mkdirSync("probe-out", { recursive: true });
const pages: [string, string][] = [
  ["ccsu", "https://necsports.com/teamstats.aspx?path=msoc&year=2026&school=ccsu"],
  ["colgate", "https://patriotleague.org/teamstats.aspx?path=msoc&year=2026&school=col"],
  ["stthomas", "https://thesummitleague.org/teamstats.aspx?path=msoc&year=2026&school=stthomas"],
];
for (const [name, u] of pages) {
  const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
  const t = await res.text();
  fs.writeFileSync(`probe-out/${name}.html`, t);
  console.log(name, res.status, res.url, t.length, ["individual-overall-offensive", "game-game-our-offensive", "sidearm-table", "boxscore"].filter((m) => t.includes(m)).join(","));
  const box = [...new Set(t.match(/boxscore\.aspx\?[^"']+/g) ?? [])].slice(0, 3);
  console.log("  box", box);
  if (box[0]) {
    const b = await fetch(new URL(box[0].replace(/&amp;/g, "&"), u), { headers: { "user-agent": UA } });
    const bt = await b.text();
    fs.writeFileSync(`probe-out/${name}-box.html`, bt);
    console.log("  boxscore", b.status, b.url, bt.length, (bt.match(/<caption>[^<]*<\/caption>/g) ?? []).slice(0, 10));
  }
}
