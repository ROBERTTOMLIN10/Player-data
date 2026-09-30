// Temporary: other sources for Central Conn. St., Colgate, St. Thomas. Removed before merge.
import fs from "node:fs";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
fs.mkdirSync("probe-out", { recursive: true });
const get = async (url: string) => {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25000) });
  return { status: res.status, url: res.url, text: await res.text() };
};
const urls = [
  "https://stats.ncaa.org/team/inst_team_list?academic_year=2027&conf_id=-1&division=1&sport_code=MSO",
  "https://stats.ncaa.org/teams/history/MSO/127",
  "https://northeastconference.org/sports/mens-soccer/stats/2026",
  "https://northeastconference.org/stats.aspx?path=msoc&year=2026",
  "https://patriotleague.org/sports/mens-soccer/stats/2026",
  "https://patriotleague.org/stats.aspx?path=msoc&year=2026",
  "https://thesummitleague.org/sports/mens-soccer/stats/2026",
  "https://thesummitleague.org/stats.aspx?path=msoc&year=2026",
  "https://gocolgateraiders.com/sports/mens-soccer/roster",
  "https://www.gocolgateraiders.com/sports/mens-soccer/stats/2026",
  "https://tommiesports.com/sports/mens-soccer/stats/2026",
];
for (const u of urls) {
  try {
    const r = await get(u);
    const name = u.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80) + ".html";
    fs.writeFileSync(`probe-out/${name}`, r.text);
    const marks = ["__NUXT_DATA__", "individual-overall-offensive", "statsSeason", "Central Conn", "Colgate", "St. Thomas", "boxscore", "challenge", "Access Denied", "cf-"].filter((m) => r.text.includes(m));
    console.log(u, r.status, r.url, r.text.length, marks.join(","), r.text.length < 1500 ? r.text.replace(/\s+/g, " ").slice(0, 400) : "");
    const links = [...new Set(r.text.match(/href="[^"]*(central|colgate|thomas|ccsu)[^"]*"/gi) ?? [])].slice(0, 8);
    if (links.length) console.log("  links", links);
  } catch (e) { console.log(u, "ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
}
