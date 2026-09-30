// Temporary: headshot-view roster pages for the last three teams. Removed before merge.
import fs from "node:fs";
fs.mkdirSync("probe-out", { recursive: true });
const UAS = {
  ours: "Mozilla/5.0 (compatible; FAU men's soccer staff app)",
  browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};
const urls = [
  "https://tommiesports.com/sports/msoc/2026-27/roster?view=headshot",
  "https://tommiesports.com/sports/mens-soccer/roster/2026-27?view=headshot",
  "https://tommiesports.com/api/v2/Rosters/bySport/mens-soccer?season=2026-27",
  "https://tommiesports.com/api/v2/Rosters/bySport/msoc",
  "https://necsports.com/roster.aspx?path=msoc&school=ccsu",
  "https://patriotleague.org/roster.aspx?path=msoc&school=col",
  "https://thesummitleague.org/roster.aspx?path=msoc&school=stthomas",
];
for (const u of urls) for (const [who, ua] of Object.entries(UAS)) {
  try {
    const res = await fetch(u, { headers: { "user-agent": ua, accept: "text/html,*/*", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25000) });
    const t = await res.text();
    const name = `${u.replace(/^https:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 70)}_${who}.html`;
    fs.writeFileSync(`probe-out/${name}`, t);
    const imgs = [...new Set(t.match(/https?:\/\/[^"'\s)]+\.(?:jpe?g|png|webp)/gi) ?? [])];
    console.log(who, u, res.status, res.url, t.length, /Human Verification|awsWaf/.test(t) ? "WAF" : "", "imgs", imgs.length, imgs.slice(0, 3));
  } catch (e) { console.log(who, u, "ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
}
