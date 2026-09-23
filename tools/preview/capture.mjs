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
// player
out.playerMe = await (await fetch(B + "/api/auth/me", { headers: { cookie: player } })).json();
await get(player, "/api/me/profile");
for (const g of games) await get(player, `/api/me/gps/${g.id}`);
await get(player, "/api/me/readiness/today");
for (const d of [14, 30, 90]) await get(player, `/api/me/readiness/history?days=${d}`);
await get(player, "/api/me/push/config");
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(Object.keys(out).length, "responses,", (JSON.stringify(out).length / 1024).toFixed(0), "KB");
