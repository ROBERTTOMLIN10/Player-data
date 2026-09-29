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
await get(coach, "/api/team/fitness");
await get(coach, "/api/team/flags");
const games = await get(coach, "/api/games");
for (const g of games) await get(coach, `/api/games/${g.id}`);
const players = await get(coach, "/api/players");
for (const p of players) { await get(coach, `/api/players/${p.id}`); for (const d of [14, 30, 90]) await get(coach, `/api/readiness/player/${p.id}?days=${d}`); }
await get(coach, "/api/readiness/squad");
// RPE
const rpeToday = await get(coach, "/api/rpe/session?session=1");
await get(coach, "/api/rpe/session?session=2");
await get(coach, "/api/rpe/sessions");
for (let i = 1; i <= 31; i++) {
  const d = new Date(`${rpeToday.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  await get(coach, `/api/rpe/session?session=1&date=${d.toISOString().slice(0, 10)}`);
}
await get(coach, "/api/rpe/trends");
for (const p of rpeToday.players) for (const d of [14, 30, 90]) await get(coach, `/api/rpe/player/${p.player_id}?days=${d}`);
const syncStatus = await get(coach, "/api/admin/sync-status");
syncStatus.intervalMinutes = 30; // the test server runs with auto-sync effectively off; show the real default
syncStatus.nextRunAt = null;
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
// NCAA team and player pages: every D1 team, and every player linked from the leader tables or in a squad we read.
// They go in one file per team (loaded when a team or player is opened), since all of them won't fit in the page.
const teamFiles = {};
{
  const standings = out["/api/ncaa/standings"];
  const teamSeos = new Set(standings.conferences.flatMap((c) => c.rows.map((r) => r.seo)));
  const playerKeys = new Map(); // seo -> Set(key)
  const addPlayer = (seo, key) => playerKeys.set(seo, (playerKeys.get(seo) ?? new Set()).add(key));
  for (const [path, table] of Object.entries(out)) {
    if (!path.startsWith("/api/ncaa/stats/") || !table?.rows) continue;
    table.teams?.forEach((t, i) => {
      if (!t) return;
      teamSeos.add(t.seo);
      const p = table.players?.[i];
      if (p) addPlayer(t.seo, p.key);
    });
  }
  const fetchJson = async (path) => {
    const r = await fetch(B + path, { headers: { cookie: coach } });
    return r.ok ? r.json() : null;
  };
  let pages = 0;
  const seos = [...teamSeos];
  const work = async () => {
    for (let seo = seos.shift(); seo; seo = seos.shift()) {
      const team = await fetchJson(`/api/ncaa/team/${seo}`);
      for (const p of team?.squad ?? []) addPlayer(seo, p.key);
      const players = {};
      for (const key of playerKeys.get(seo) ?? []) {
        const page = await fetchJson(`/api/ncaa/player/${seo}/${encodeURIComponent(key)}`);
        if (page) (players[key] = page), pages++;
      }
      teamFiles[seo] = { team, players };
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  console.log(Object.keys(teamFiles).length, "team files,", pages, "player pages");
}
// player
out.playerMe = await (await fetch(B + "/api/auth/me", { headers: { cookie: player } })).json();
await get(player, "/api/me/profile");
await get(player, "/api/me/fitness");
for (const g of games) await get(player, `/api/me/gps/${g.id}`);
await get(player, "/api/me/readiness/today");
for (const d of [14, 30, 90]) await get(player, `/api/me/readiness/history?days=${d}`);
await get(player, "/api/me/push/config");
for (const d of [14, 30, 90]) await get(player, `/api/me/rpe?days=${d}`);
// Logos: swap each logo URL for a short token and keep one embedded copy of
// each image (mock.ts swaps them back when serving), since the preview page
// can't load images from other sites and repeating them would bloat it.
let json = JSON.stringify(out);
const logos = process.env.SNAPSHOT_FILE && fs.existsSync(process.env.SNAPSHOT_FILE)
  ? JSON.parse(fs.readFileSync(process.env.SNAPSHOT_FILE, "utf-8")).logos ?? {}
  : {};
const embedded = {};
Object.entries(logos).forEach(([url, dataUri], i) => {
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
// Team files: images inlined directly (each file stands alone).
const teamDir = process.argv[3];
fs.rmSync(teamDir, { recursive: true, force: true });
fs.mkdirSync(teamDir, { recursive: true });
const quotedLogos = Object.entries(logos).map(([url, dataUri]) => [JSON.stringify(url).slice(1, -1), dataUri]);
let total = 0;
for (const [seo, file] of Object.entries(teamFiles)) {
  // Player pages share their team's header and squad photo (mock.ts puts them back), so each image is stored once.
  const squadPhoto = new Map((file.team?.squad ?? []).map((p) => [p.key, p.photo_url]));
  for (const [key, page] of Object.entries(file.players)) {
    delete page.team;
    if (page.profile?.photo_url && page.profile.photo_url === squadPhoto.get(key)) page.profile.photo_url = "@squad";
  }
  let text = JSON.stringify(file);
  for (const [quoted, dataUri] of quotedLogos) if (text.includes(quoted)) text = text.split(quoted).join(dataUri);
  fs.writeFileSync(`${teamDir}/${seo}.json`, text);
  total += text.length;
}
console.log(Object.keys(teamFiles).length, "team files,", (total / 1024 / 1024).toFixed(1), "MB");
