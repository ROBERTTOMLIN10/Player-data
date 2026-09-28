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

// RPE: a month of post-training scores (no games, no Sundays), today half logged.
const { data: sheet } = await req("/rpe/session", { cookie: coach });
const { data: schedule } = await req("/schedule", { cookie: coach });
const gameDays = new Set(schedule.map((g) => g.game_date));
const shift = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const noise = (a, b) => ((a * 7919 + b * 104729) % 5) - 2; // steady made-up spread, -2..2
for (let back = 30; back >= 0; back--) {
  const date = shift(sheet.today, -back);
  if (gameDays.has(date) || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;
  const dayAfterGame = gameDays.has(shift(date, -1));
  const base = dayAfterGame ? 3 : 6;
  for (const [i, p] of sheet.players.entries()) {
    if (back === 0 && i % 2 === 1) continue; // today: half the squad still to log
    if (back <= 3 && i === 6) {
      // injured this week: didn't train (N/A)
      await req("/rpe/score", { method: "PUT", cookie: coach, body: { player_id: p.player_id, date, session: 1, rpe: "na" } });
      continue;
    }
    let rpe = Math.min(10, Math.max(1, base + (back === 0 ? Math.sign(noise(p.player_id, back)) : noise(p.player_id, back))));
    if (back === 0 && p.player_id === players[2]?.player_id) rpe = 8; // hard session on low readiness
    if (back === 0 && i === 4) rpe = 10; // well above usual
    await req("/rpe/score", { method: "PUT", cookie: coach, body: { player_id: p.player_id, date, session: 1, rpe } });
  }
  for (const [i, k] of sheet.keepers.entries()) {
    if (back === 0 && i === 1) continue; // one keeper still to log today
    const rpe = Math.min(10, Math.max(1, base - 1 + noise(i + 3, back)));
    await req("/rpe/score", { method: "PUT", cookie: coach, body: { keeper_name: k.name, date, session: 1, rpe } });
  }
  if (back > 0) await req("/rpe/session/submit", { method: "POST", cookie: coach, body: { date, session: 1 } }); // today not yet
}

console.log(`p${players[0].player_id}@fau.edu`); // first seeded player = the preview's player
