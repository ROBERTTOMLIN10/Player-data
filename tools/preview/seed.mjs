const B = "http://localhost:4100/api";
async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(B + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { res, data: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const coach = (await req("/auth/login", { method: "POST", body: { email: "coach@fau.edu", password: "secret123" } })).cookie;
const { data: accts } = await req("/admin/accounts", { cookie: coach });
const players = accts.players.slice(0, 12);
const profiles = [
  [9, 8, 4, 4, 4, 4, 5, []],
  [6, 6.5, 3, 2, 2, 3, 3, [["hamstring_outer_r", "moderate", "tight on sprints"]]],
  [4, 5, 2, 2, 2, 2, 3, [["quad_front_l", "severe", "felt a pull in the last drill"], ["groin_l", "moderate"]]],
  [10, 9, 5, 5, 4, 5, 5, []],
  [7, 7, 4, 3, 3, 4, 4, [["calf_inner_l", "light"], ["calf_inner_r", "light"]]],
  [8, 7.5, 4, 4, 3, 3, 4, [["lower_back_r", "light"]]],
  [6, 8, 3, 3, 3, 3, 3, [["ankle_r", "moderate", "rolled it Saturday"]]],
  [8, 6, 4, 4, 4, 4, 4, []],
  [9, 8, 5, 4, 4, 5, 4, [["hamstring_inner_l", "light"], ["abs_lower", "light", "a bit of groin/lower ab tightness"]]],
];
for (const [i, p] of players.entries()) {
  const email = `p${p.player_id}@fau.edu`;
  if (!p.user_id) await req("/admin/accounts", { method: "POST", cookie: coach, body: { role: "player", email, password: "pw1234", playerId: p.player_id } });
  if (i >= profiles.length) continue; // leave a few "not checked in"
  const pc = (await req("/auth/login", { method: "POST", body: { email, password: "pw1234" } })).cookie;
  const [rt, h, sq, en, so, st, mo, sore] = profiles[i];
  const r = await req("/me/readiness/today", { method: "PUT", cookie: pc, body: { readiness_rating: rt, sleep_hours: h, sleep_quality: sq, energy: en, muscle_soreness: so, stress: st, mood: mo, notes: i === 2 ? "Might need to sit out of sprint work" : null, soreness: sore.map(([region, severity, note]) => ({ region, severity, note })) } });
  if (!r.res.ok) console.log("fail", r.data);
}
console.log(`p${players[0].player_id}@fau.edu`); // first seeded player = the preview's player
