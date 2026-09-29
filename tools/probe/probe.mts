import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const UA = { "user-agent": "Mozilla/5.0 (compatible; FAU-soccer-app)" };
const get = async (u: string) => { const r = await fetch(u, { headers: UA }); return { status: r.status, url: r.url, html: await r.text() }; };
const isRec = (v: any) => v && typeof v === "object";
const trim = (v: any, d = 0): any => {
  if (!isRec(v)) return typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v;
  if (d > 1) return Array.isArray(v) ? `[${v.length}]` : `{${Object.keys(v).slice(0, 12).join(",")}}`;
  if (Array.isArray(v)) return v.slice(0, 2).map((x) => trim(x, d + 1));
  return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, trim(x, d + 1)]));
};
// 1) FAU cumulative stats: all arrays under overallIndividualStats
try {
{
  const r = await get("https://fausports.com/sports/mens-soccer/stats/2026");
  const root: any = parseNuxtPayload(r.html);
  const cs: any = Object.values(root.pinia.statsSeason.cumulativeStats)[0];
  console.log("cumulativeStats keys", Object.keys(cs));
  console.log("overallIndividualStats keys", Object.keys(cs.overallIndividualStats));
  for (const [k, v] of Object.entries(cs.overallIndividualStats)) if (Array.isArray(v)) console.log("  ", k, v.length, String(JSON.stringify((v as any[]).find((x) => !x.isAFooterStat) ?? v[0] ?? null)).slice(0, 700));
  console.log("gameByGameStats keys", Object.keys(cs.gameByGameStats));
  console.log("individual player keys?", Object.keys(cs).filter((k) => /player|individual/i.test(k)));
}
} catch (e) { console.log("ERR", (e as Error).message); }
// 2) FAU player bio page: game log?
try {
{
  const r = await get("https://fausports.com/sports/mens-soccer/roster/dj-koulai/19571");
  const root: any = parseNuxtPayload(r.html);
  console.log("\nbio pinia keys", Object.keys(root.pinia ?? {}));
  for (const k of Object.keys(root.pinia ?? {})) if (/roster|player|bio|stat/i.test(k)) console.log(k, JSON.stringify(trim(root.pinia[k])).slice(0, 1500));
}
} catch (e) { console.log("ERR", (e as Error).message); }
// 3) Sidearm player stats page pattern
try {
for (const u of ["https://fausports.com/sports/mens-soccer/stats/2026/player/dj-koulai", "https://fausports.com/sports/mens-soccer/stats/2026?path=msoc&player=19571"]) {
  const r = await get(u); console.log("\n", u, r.status, r.url, r.html.includes("__NUXT_DATA__"));
  if (r.status === 200 && r.html.includes("__NUXT_DATA__")) { const root: any = parseNuxtPayload(r.html); console.log(Object.keys(root.pinia ?? {})); for (const k of Object.keys(root.pinia ?? {})) if (/stat|player/i.test(k)) console.log(k, JSON.stringify(trim(root.pinia[k])).slice(0, 1500)); }
}
} catch (e) { console.log("ERR", (e as Error).message); }
// 4) UCF roster store
try {
{
  const r = await get("https://ucfknights.com/sports/mens-soccer/roster");
  const root: any = parseNuxtPayload(r.html);
  console.log("\nUCF pinia keys", Object.keys(root.pinia ?? {}), "roster keys", Object.keys(root.pinia?.roster ?? {}));
  console.log(JSON.stringify(trim(root.pinia?.roster)).slice(0, 1500));
}
} catch (e) { console.log("ERR", (e as Error).message); }
// 5) Old Sidearm HTML (FIU)
try {
{
  const r = await get("https://fiusports.com/sports/mens-soccer/roster");
  const i = r.html.indexOf("sidearm-roster-player");
  console.log("\nFIU roster snippet:", r.html.slice(i - 200, i + 2500).replace(/\s+/g, " "));
  const s = await get("https://fiusports.com/sports/mens-soccer/stats/2026");
  const tables = [...s.html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  console.log("FIU stats tables", tables.length);
  for (const t of tables.slice(0, 3)) console.log(t.replace(/\s+/g, " ").slice(0, 1200));
  const ids = [...s.html.matchAll(/id="([^"]*(?:individual|offensive|goalkeep|goalie)[^"]*)"/gi)].map((m) => m[1]);
  console.log("ids", [...new Set(ids)].slice(0, 20));
}

} catch (e) { console.log("ERR", (e as Error).message); }