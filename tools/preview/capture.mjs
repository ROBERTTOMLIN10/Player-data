import fs from "node:fs";
const B = "http://localhost:4100";
async function login(email, password) {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return r.headers.get("set-cookie").split(";")[0];
}
const out = {};
async function get(cookie, path) {
  const r = await fetch(B + path, { headers: { cookie } });
  if (!r.ok) throw new Error(path + " " + r.status);
  out[path] = await r.json();
  return out[path];
}
const coach = await login("coach@fau.edu", "secret123");
const player = await login(process.env.PLAYER_EMAIL, "pw1234");
// coach
out.coachMe = { role: "coach", email: "coach@fau.edu", playerId: null, playerName: null, authRequired: true };
await get(coach, "/api/metrics");
await get(coach, "/api/schedule");
await get(coach, "/api/team/summary");
await get(coach, "/api/team/stats");
const games = await get(coach, "/api/games");
for (const g of games) await get(coach, `/api/games/${g.id}`);
const players = await get(coach, "/api/players");
for (const p of players) { await get(coach, `/api/players/${p.id}`); for (const d of [14, 30, 90]) await get(coach, `/api/readiness/player/${p.id}?days=${d}`); }
await get(coach, "/api/readiness/squad");
await get(coach, "/api/admin/sync-status");
await get(coach, "/api/admin/accounts");
await get(coach, "/api/admin/reminders");
// NCAA D1
const board = await get(coach, "/api/ncaa/scoreboard");
for (let i = -3; i <= 3; i++) {
  const d = new Date(`${board.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  await get(coach, `/api/ncaa/scoreboard?date=${d.toISOString().slice(0, 10)}`);
}
await get(coach, "/api/ncaa/standings");
const statsIndex = await get(coach, "/api/ncaa/stats");
for (const c of statsIndex.categories) await get(coach, `/api/ncaa/stats/${c.key}`).catch(() => undefined);
await get(coach, "/api/ncaa/rankings");
await get(coach, "/api/ncaa/conference/american");
// player
out.playerMe = await (await fetch(B + "/api/auth/me", { headers: { cookie: player } })).json();
await get(player, "/api/me/profile");
for (const g of games) await get(player, `/api/me/gps/${g.id}`);
await get(player, "/api/me/readiness/today");
for (const d of [14, 30, 90]) await get(player, `/api/me/readiness/history?days=${d}`);
await get(player, "/api/me/push/config");
// Logos: swap each logo URL for a short token and keep one embedded copy of
// each image (mock.ts swaps them back when serving), since the preview page
// can't load images from other sites and repeating them would bloat it.
let json = JSON.stringify(out);
const logos = process.env.SNAPSHOT_FILE && fs.existsSync(process.env.SNAPSHOT_FILE)
  ? JSON.parse(fs.readFileSync(process.env.SNAPSHOT_FILE, "utf-8")).logos ?? {}
  : {};
// NCAA school logos: keep the page light by embedding only American Conference
// teams, the Top 25 and today's games (the rest fall back to initials).
const keepSeos = new Set();
for (const g of out["/api/ncaa/scoreboard"]?.games ?? []) keepSeos.add(g.home.seo).add(g.away.seo);
for (const r of out["/api/ncaa/conference/american"]?.standings ?? []) keepSeos.add(r.seo);
for (const t of out["/api/ncaa/rankings"]?.tables?.[0]?.teams ?? []) if (t) keepSeos.add(t.seo);
const ncaaSeo = (url) => url.match(/logos\/schools\/bgl\/([^/]+)\.svg$/)?.[1];
const compactSvg = (dataUri) => {
  const m = dataUri.match(/^data:image\/svg\+xml;base64,(.*)$/);
  if (!m) return dataUri;
  const svg = Buffer.from(m[1], "base64").toString("utf-8")
    .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->|<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};
const embedded = {};
Object.entries(logos).forEach(([url, rawUri], i) => {
  const seo = ncaaSeo(url);
  if (seo && !keepSeos.has(seo)) return;
  const dataUri = compactSvg(rawUri);
  const token = `preview-logo:${i}`;
  const quoted = JSON.stringify(url).slice(1, -1);
  if (json.includes(quoted)) {
    json = json.split(quoted).join(token);
    embedded[token] = dataUri;
  }
});
json = json.slice(0, -1) + `,"__logos":${JSON.stringify(embedded)}}`;
fs.writeFileSync(process.argv[2], json);
console.log(Object.keys(embedded).length, "logos embedded");
console.log(Object.keys(out).length, "responses,", (JSON.stringify(out).length / 1024).toFixed(0), "KB");
