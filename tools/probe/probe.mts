import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const SITES: Record<string, string> = {
  memphis: "gotigersgo.com", tulsa: "tulsahurricane.com", fiu: "fiusports.com", "south-fla": "gousfbulls.com",
  temple: "owlsports.com", ucf: "ucfknights.com", mercer: "mercerbears.com", "missouri-st": "missouristatebears.com",
  "north-carolina-st": "gopack.com", uab: "uabsports.com", "cleveland-st": "csuvikings.com", fgcu: "fgcuathletics.com",
  "north-florida": "unfospreys.com", charlotte: "charlotte49ers.com", stetson: "gohatters.com", "fla-atlantic": "fausports.com",
};
const UA = { "user-agent": "Mozilla/5.0 (compatible; FAU-soccer-app)" };
async function get(url: string) {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  return { status: r.status, url: r.url, html: await r.text() };
}
const isRec = (v: any) => v && typeof v === "object";
function find(v: any, pred: (x: any) => boolean, path = "root", seen = new Set(), depth = 0): string[] {
  if (!isRec(v) || seen.has(v) || depth > 8) return [];
  seen.add(v);
  const out: string[] = [];
  if (pred(v)) out.push(path);
  for (const [k, x] of Object.entries(v)) out.push(...find(x, pred, `${path}.${k}`, seen, depth + 1));
  return out;
}
function at(root: any, path: string) { return path.split(".").slice(1).reduce((o, k) => o?.[k], root); }
for (const [seo, host] of Object.entries(SITES)) {
  console.log(`\n===== ${seo} (${host})`);
  try {
    const r = await get(`https://${host}/sports/mens-soccer/roster`);
    const nuxt = r.html.includes("__NUXT_DATA__");
    console.log("roster", r.status, r.url, "nuxt:", nuxt, "len", r.html.length, "aspx-ish:", /sidearm-roster-player/.test(r.html));
    if (nuxt) {
      const root: any = parseNuxtPayload(r.html);
      const store = root?.pinia?.roster?.roster;
      const roster: any = store && Object.values(store).find((x: any) => x && Array.isArray(x.players));
      console.log("players:", roster?.players?.length, "sample:", roster?.players?.[0] && JSON.stringify({ n: roster.players[0].firstName + " " + roster.players[0].lastName, j: roster.players[0].jerseyNumber, img: roster.players[0].image?.absoluteUrl, pos: roster.players[0].positionShort, id: roster.players[0].rosterPlayerId, cta: roster.players[0].call_to_action }));
    }
  } catch (e) { console.log("roster ERR", (e as Error).message); }
  for (const path of ["/sports/mens-soccer/stats/2026", "/sports/mens-soccer/stats"]) {
    try {
      const r = await get(`https://${host}${path}`);
      const nuxt = r.html.includes("__NUXT_DATA__");
      console.log("stats", path, r.status, r.url, "nuxt:", nuxt, "len", r.html.length);
      if (nuxt && seo === "fla-atlantic" && path.endsWith("2026")) {
        const root: any = parseNuxtPayload(r.html);
        console.log("pinia keys", Object.keys(root.pinia ?? {}));
        const hits = find(root, (x) => Array.isArray(x) && x.length > 5 && isRec(x[0]) && ("playerName" in x[0] || "name" in x[0] || "firstName" in x[0]) && ("goals" in x[0] || "gp" in x[0] || "gamesPlayed" in x[0] || "minutes" in x[0] || "points" in x[0]));
        console.log("player arrays:", hits.slice(0, 8));
        for (const h of hits.slice(0, 3)) { const a = at(root, h); console.log(h, a.length, JSON.stringify(a[0]).slice(0, 900)); }
        const gl = find(root, (x) => Array.isArray(x) && x.length > 3 && isRec(x[0]) && ("opponent" in x[0] || "opponentName" in x[0]) && ("date" in x[0] || "gameDate" in x[0]));
        console.log("game arrays:", gl.slice(0, 5));
        for (const h of gl.slice(0, 2)) { const a = at(root, h); console.log(h, a.length, JSON.stringify(a[0]).slice(0, 600)); }
      }
      if (nuxt) break;
    } catch (e) { console.log("stats ERR", path, (e as Error).message); }
  }
}
// NCAA.com school page for site discovery
for (const seo of ["memphis", "stetson"]) {
  const r = await get(`https://www.ncaa.com/schools/${seo}`);
  const m = r.html.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Official )?(?:Athletics )?Website/i) ?? r.html.match(/school-website[^>]*href="([^"]+)"/i);
  console.log("ncaa school", seo, r.status, m?.[1], (r.html.match(/https?:\/\/(?:www\.)?[a-z0-9-]+\.(?:com|edu)\/?"/gi) ?? []).slice(0, 8));
}
