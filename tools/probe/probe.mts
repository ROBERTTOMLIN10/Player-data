// Temporary: WMT details and St. Thomas (v4). Removed before merge.
import fs from "node:fs";
import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HDRS = { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" };
const get = async (url: string) => {
  const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(25000) });
  return { status: res.status, url: res.url, text: await res.text() };
};
const cut = (v: unknown, n = 1500) => JSON.stringify(v)?.slice(0, n);
const section = async (name: string, fn: () => Promise<void>) => {
  console.log(`\n######## ${name}`);
  try { await fn(); } catch (e) { console.log("ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
};
fs.mkdirSync("probe-out", { recursive: true });
const save = (f: string, t: string) => fs.writeFileSync(`probe-out/${f}`, t);

await section("wmt pagination", async () => {
  for (const q of ["?per_page=100", "?limit=100", "?page=2", "?per_page=100&page=1"]) {
    const r = await get(`https://api.wmt.games/api/statistics/teams/623151/players${q}`);
    const j = JSON.parse(r.text);
    console.log(q, r.status, j.data?.length, cut(j.meta, 300));
  }
  const first = JSON.parse((await get("https://api.wmt.games/api/statistics/teams/623151/players")).text);
  const tok = first.meta?.pagination?.next_page;
  for (const q of [`?page=${tok}`, `?next_page=${tok}`, `?cursor=${tok}`, `?page_token=${tok}`]) {
    const r = await get(`https://api.wmt.games/api/statistics/teams/623151/players${q}`);
    const j = JSON.parse(r.text);
    console.log(q.slice(0, 14), r.status, j.data?.length, j.data?.[0]?.last_name, cut(j.meta, 200));
  }
});
await section("wmt roster entry keys", async () => {
  const r = await get("https://ucfknights.com/sports/mens-soccer/roster");
  const root = parseNuxtPayload(r.text) as any;
  const key = Object.keys(root.data).find((k) => /players-list/.test(k))!;
  const p = root.data[key][0];
  const { roster, short_biography, photo, ...rest } = p;
  console.log(cut(rest, 4000));
  console.log("photo.url", photo?.url);
  const links = [...new Set(r.text.match(/\/sports\/mens-soccer\/roster\/player\/[a-z0-9-]+/g) ?? [])].slice(0, 3);
  console.log("links", links);
});
for (const [seo, url] of [["kentucky", "https://ukathletics.com/sports/msoc/roster/"], ["south-carolina", "https://gamecocksonline.com/sports/msoc/roster/"]]) {
  await section(`wordpress wmt ${seo}`, async () => {
    const r = await get(url);
    save(`${seo}-roster.html`, r.text);
    for (const u of [url.replace("roster/", "stats/"), url.replace("roster/", "schedule/"), url.replace("/roster/", "/stats/2026/")]) {
      const s = await get(u);
      console.log(u, s.status, s.text.length, [...new Set(s.text.match(/wmt\.games\/[a-z0-9-]+\/[a-z/]*\d+/g) ?? [])].slice(0, 4), [...new Set(s.text.match(/team[_-]?id["'=:\s\\]+\d{5,}/gi) ?? [])].slice(0, 4));
      if (u.includes("stats")) save(`${seo}-stats.html`, s.text);
    }
  });
}
await section("st-thomas", async () => {
  for (const u of ["https://tommiesports.com/sports/mens-soccer/roster", "https://tommiesports.com/sports/mens-soccer/roster/2026", "https://tommiesports.com/sports/mens-soccer/stats/2026"]) {
    const r = await get(u);
    const root = parseNuxtPayload(r.text) as any;
    console.log(u, r.status, r.url, r.text.length, "roster", cut(root?.pinia?.roster?.roster, 200), "stats", cut(root?.pinia?.statsSeason?.cumulativeStats, 200), "cards", (r.text.match(/s-person-card--list/g) ?? []).length, "tables", (r.text.match(/<table/g) ?? []).length);
    save(`stthomas-${u.split("/").pop()}.html`, r.text);
  }
});
await section("bradley + mason stats", async () => {
  for (const u of ["https://bradleybraves.com/sports/mens-soccer/stats/2026", "https://gomason.com/sports/mens-soccer/stats/2026"]) {
    const s = await get(u);
    console.log(u, s.status, s.text.includes("individual-overall-offensive"), s.text.includes("game-game-our-offensive"), s.text.includes("__NUXT_DATA__"));
  }
  const r = await get("https://gomason.com/sports/mens-soccer/roster");
  console.log("mason players json", r.text.includes('"players":[{"rp_id"'));
});
