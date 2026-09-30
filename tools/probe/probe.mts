// Temporary: how to read the remaining D1 teams' sites (v3). Removed before merge.
import fs from "node:fs";
import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HDRS = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" };
const get = async (url: string) => {
  const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(25000) });
  return { status: res.status, url: res.url, text: await res.text(), type: res.headers.get("content-type") };
};
const cut = (v: unknown, n = 1500) => JSON.stringify(v)?.slice(0, n);
const section = async (name: string, fn: () => Promise<void>) => {
  console.log(`\n######## ${name}`);
  try { await fn(); } catch (e) { console.log("ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
};
fs.mkdirSync("probe-out", { recursive: true });
const save = (f: string, t: string) => fs.writeFileSync(`probe-out/${f}`, t);

await section("wmt api players", async () => {
  const r = await get("https://api.wmt.games/api/statistics/teams/623151/players");
  save("wmt-players.json", r.text);
  const j = JSON.parse(r.text);
  const p = j.data.find((x: any) => x.games?.length > 3) ?? j.data[0];
  const { games, highs, ...rest } = p;
  console.log("player keys", cut(rest, 6000));
  console.log("games[0]", cut(games?.[0], 3000));
  console.log("highs keys", Object.keys(highs ?? {}));
  console.log("top keys", Object.keys(j), "count", j.data.length);
});
await section("wmt api other", async () => {
  for (const u of [
    "https://api.wmt.games/api/statistics/teams/623151/games",
    "https://api.wmt.games/api/statistics/teams/623151/contests",
    "https://api.wmt.games/api/statistics/teams/623151/schedule",
    "https://api.wmt.games/api/statistics/games/6606373",
    "https://api.wmt.games/api/statistics/contests/6606373",
    "https://api.wmt.games/api/statistics/games/6606373/players",
  ]) {
    try { const r = await get(u); console.log("==", u, r.status, r.text.length, r.text.slice(0, 1200).replace(/\s+/g, " ")); save(u.split("/").slice(-2).join("-") + ".json", r.text); } catch (e) { console.log(u, "ERR", (e as Error).message); }
  }
});
await section("wmt roster entry", async () => {
  const r = await get("https://ucfknights.com/sports/mens-soccer/roster");
  const root = parseNuxtPayload(r.text) as any;
  const key = Object.keys(root.data).find((k) => /players-list/.test(k))!;
  const p = root.data[key][0];
  const { roster, short_biography, ...rest } = p;
  console.log(cut(rest, 5000));
});
for (const [seo, url] of [["kentucky", "https://ukathletics.com/sports/msoc/roster/"], ["notre-dame", "https://fightingirish.com/sports/msoc/roster"], ["virginia", "https://virginiasports.com/sports/msoc/roster"]]) {
  await section(`wmt variant ${seo}`, async () => {
    const r = await get(url);
    console.log("wmt ids", [...new Set(r.text.match(/wmt\.games\/[a-z0-9-]+\/stats\/season\/\d+/g) ?? [])], [...new Set(r.text.match(/wmt_stats2_team_id\\?"?:\\?"?\d+/g) ?? [])].slice(0, 3));
    if (seo === "kentucky") {
      const i = r.text.indexOf("roster");
      const imgs = [...new Set(r.text.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi) ?? [])].slice(0, 5);
      console.log("imgs", imgs);
      const j = r.text.search(/class="[^"]*(roster__player|s-person|player-card|roster-player)[^"]*"/);
      console.log("card", r.text.slice(j, j + 2000).replace(/\s+/g, " "));
      save("kentucky-roster.html", r.text);
    }
  });
}
await section("s-person-card (louisville)", async () => {
  const r = await get("https://gocards.com/sports/mens-soccer/roster");
  save("louisville-roster.html", r.text);
  const i = r.text.indexOf("s-person-card");
  console.log(r.text.slice(i - 200, i + 3000).replace(/\s+/g, " "));
  console.log("apis", [...new Set(r.text.match(/\/api\/v\d[^"'\s<>]{0,80}/g) ?? [])].slice(0, 15));
  const root = parseNuxtPayload(r.text) as any;
  console.log("pinia", Object.keys(root.pinia ?? {}), "data keys", Object.keys(root.data ?? {}).slice(0, 15));
  for (const [k, v] of Object.entries(root.data ?? {})) if (/roster/i.test(k)) console.log("  data", k, cut(v, 3000));
  const s = await get("https://gocards.com/sports/mens-soccer/stats/2026");
  save("louisville-stats.html", s.text);
  console.log("stats", s.status, s.url, s.text.length, "tables", (s.text.match(/<table/g) ?? []).length, "individual", s.text.includes("individual"));
  const sr = parseNuxtPayload(s.text) as any;
  console.log("stats pinia", cut(sr.pinia?.statsSeason, 500), "data keys", Object.keys(sr.data ?? {}).slice(0, 15));
  console.log("stats apis", [...new Set(s.text.match(/\/api\/v\d[^"'\s<>]{0,80}/g) ?? [])].slice(0, 15));
});
await section("bradley data", async () => {
  const r = await get("https://bradleybraves.com/sports/mens-soccer/roster");
  const i = r.text.indexOf('"rp_id"');
  console.log("rp_id at", i, r.text.slice(Math.max(0, i - 1500), i + 1500).replace(/\s+/g, " "));
  const m = r.text.match(/(var|window\.)\s*[\w.]+\s*=\s*\{[^;]{0,200}players/);
  console.log("var", m?.[0]);
  const s = await get("https://bradleybraves.com/sports/mens-soccer/stats/2026");
  console.log("stats", s.status, s.text.includes("individual-overall-offensive"), s.text.includes("game-game-our-offensive"));
});
await section("others", async () => {
  for (const u of ["https://stonybrookathletics.com/sports/mens-soccer/roster", "https://www.goseawolves.org/sports/mens-soccer/roster", "https://ccsubluedevils.com/sports/mens-soccer/roster", "https://www.ccsubluedevils.com/sports/mens-soccer/roster", "https://www.gocolgateraiders.com/sports/mens-soccer/roster", "https://gocolgateraiders.com/sports/mens-soccer/stats/2026", "https://oruathletics.com/sports/mens-soccer/stats/2026", "https://uiwcardinals.com/sports/mens-soccer/stats/2026", "https://gobobcats.com/sports/mens-soccer/stats/2026"]) {
    try {
      const r = await get(u);
      const marks = ["__NUXT_DATA__", "oas-", "sidearm-roster-player", "s-person-card", "individual-overall-offensive", "game-game-our-offensive", "statsSeason", "wmt.games"].filter((m) => r.text.includes(m));
      console.log(u, r.status, r.url, r.text.length, marks.join(","), r.text.length < 2500 ? r.text.replace(/\s+/g, " ").slice(0, 600) : "");
    } catch (e) { console.log(u, "ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
  }
});
