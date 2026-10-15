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

// Athletic trainer care (made-up demo data): an AT login, play statuses, injuries with
// rehab logs and return-to-play stages, treatment bookings and follow-up notes.
{
  const today = sheet.today;
  await req("/admin/accounts", { method: "POST", cookie: coach, body: { role: "trainer", email: "at@fau.edu", password: "train123" } });
  const at = (await req("/auth/login", { method: "POST", body: { email: "at@fau.edu", password: "train123" } })).cookie;
  const pid = (i) => players[i].player_id;
  const status = (i, level, practice_note, bike = null, jogging = null, running = null, date = today) =>
    req(`/care/availability/${pid(i)}`, { method: "PUT", cookie: at, body: { date, level, practice_note, bike, jogging, running } });
  const issue = async (i, body, logs = [], stages = []) => {
    const { data } = await req("/care/issues", { method: "POST", cookie: at, body: { player_id: pid(i), ...body } });
    for (const [back, activities, minutes, notes] of logs) await req(`/care/issues/${data.id}/logs`, { method: "POST", cookie: at, body: { date: shift(today, -back), activities, minutes, notes } });
    for (const [back, stage] of stages) await req(`/care/issues/${data.id}`, { method: "PATCH", cookie: at, body: { stage, stage_date: shift(today, -back) } });
    return data.id;
  };
  const playerLogin = async (i) => (await req("/auth/login", { method: "POST", body: { email: `p${pid(i)}@fau.edu`, password: "pw1234" } })).cookie;
  // The AT books; the player accepts (or it's left for them to answer), then maybe came in.
  const book = async (i, time, kind, reason, instructions, flow = "accepted", injury_id = null, date = today) => {
    const { data } = await req("/care/treatments", { method: "POST", cookie: at, body: { player_id: pid(i), date, time, kind, reason, instructions, injury_id } });
    if (flow === "pending") return data;
    await req(`/me/care/treatments/${data.id}/respond`, { method: "POST", cookie: await playerLogin(i), body: { action: "accept" } });
    if (flow === "attended") await req(`/care/treatments/${data.id}`, { method: "PATCH", cookie: at, body: { status: "attended" } });
    return data;
  };

  // Severe quad (checked in today): out, rehab only for now.
  await status(2, "out", "No practice", "Easy bike as tolerated", "NA", "NA", shift(today, -3));
  const quad = await issue(2, { category: "injury", description: "Quad strain", region: "quad_front_l", side: "left", injury_date: shift(today, -3), expected_return: shift(today, 18) }, [
    [2, "Ice, compression, isometrics", 30, "Painful to walk on day 1"],
    [1, "Stim + quad sets, easy bike 10 min", 40, "Walking without a limp"],
    [0, "Bike 15 min, light stretching", 45, "Pain going down, still not 100%"],
  ]);
  await book(2, "14:30", "treatment", "Left quad", "Ice + stim. Bring your compression sleeve.", "accepted", quad);
  // Hamstring on the way back: limited, non-contact.
  await status(1, "limited", "Non-contact", "No limitations", "Max 70%, 1 min rest between", "Max 80% with enough rest");
  const ham = await issue(1, { category: "injury", description: "Hamstring strain", region: "hamstring_outer_r", side: "right", injury_date: shift(today, -10), expected_return: shift(today, 4) }, [
    [3, "Nordics, bridges, bike 20 min", 45, "Rehab went really well"],
    [0, "Strides at 70%, mobility", 40, "Felt good today"],
  ], [[7, "running"], [2, "modified"]]);
  await book(1, "13:00", "rehab", "Right hamstring", "Rehab after lunch", "attended", ham);
  // Ankle: as tolerated with tape.
  await status(6, "as_tolerated", "As tolerated w/ tape");
  const ankle = await issue(6, { category: "injury", description: "Ankle sprain", region: "ankle_r", side: "right", injury_date: shift(today, -5) }, [[0, "Taped, balance work", 20, "Felt great today"]], [[3, "running"], [1, "modified"], [0, "full"]]);
  // Ankle: came in for tape and says so; waiting on the AT to confirm.
  const tape = await book(6, "07:45", "treatment", "Right ankle", "Tape before practice", "accepted", ankle);
  await req(`/me/care/treatments/${tape.id}/attended`, { method: "POST", cookie: await playerLogin(6) });
  // The preview's player: a past calf strain (pre-hab to keep it from coming back) and calf
  // tightness they're training with; a proactive slot to answer, an afternoon treatment,
  // two confirmed visits in their treatment log and pre-hab entries.
  const oldCalf = await issue(0, { category: "injury", description: "Calf strain", region: "calf_inner_l", side: "left", injury_date: shift(today, -95) }, [[80, "Back to full", null, "Cleared"]], [[90, "running"], [85, "modified"], [82, "full"]]);
  await req(`/care/issues/${oldCalf}`, { method: "PATCH", cookie: at, body: { closed: true } });
  const calf = await issue(0, { category: "injury", description: "Calf tightness", region: "calf_inner_r", side: "both", injury_date: shift(today, -4), stage: "full" });
  await book(0, "06:45", "proactive", "Calves", "Foam roll calves before you come in.", "pending", calf);
  await book(0, "15:00", "treatment", "Calves", "Stretch after practice.", "accepted", calf);
  await book(0, "15:00", "treatment", "Calves", "Soft tissue", "attended", calf, shift(today, -3));
  await book(0, "07:30", "proactive", "Calves", "Massage gun + stretch", "attended", oldCalf, shift(today, -1));
  const p0 = await playerLogin(0);
  const { data: done } = await req("/me/care/prehab", { method: "POST", cookie: p0, body: { injury_id: oldCalf, activities: "Calf raises 3x15, banded ankle work", minutes: 15, date: shift(today, -2) } });
  await req(`/care/prehab/${done.id}/confirm`, { method: "POST", cookie: at, body: { happened: true } });
  await req("/me/care/prehab", { method: "POST", cookie: p0, body: { injury_id: calf, activities: "Foam roll + soleus stretch", minutes: 10, date: shift(today, -1) } });
  // A player asks for a time that fits their classes (the AT confirms it).
  await req("/me/care/requests", { method: "POST", cookie: await playerLogin(5), body: { date: today, time: "16:00", kind: "treatment", reason: "Lower back", note: "I have class until 3:30" } });
  // General medical and a physical-exam follow-up.
  await status(4, "limited", "Fever: rest today");
  await issue(4, { category: "gen_med", description: "Flu", injury_date: shift(today, -1) }, [[0, "Fluids, rest", null, "Fever down this morning"]]);
  await issue(5, { category: "ppe", description: "Heart: follow-up appointment", injury_date: null }, [[0, "Appointment booked", null, "Follow-up at 11am on Tuesday"]]);
  // A past injury, recovered.
  const old = await issue(3, { category: "injury", description: "Groin strain", region: "groin_l", side: "left", injury_date: shift(today, -40) }, [[30, "Adductor program", 40, "Back to full"]], [[35, "running"], [32, "modified"], [30, "full"], [28, "match_ready"]]);
  await req(`/care/issues/${old}`, { method: "PATCH", cookie: at, body: { closed: true } });
  // Follow-up notes between a coach and the AT.
  await req("/care/notes", { method: "POST", cookie: coach, body: { player_id: pid(1), date: today, body: "Did he come in before practice?" } });
  await req("/care/notes", { method: "POST", cookie: at, body: { player_id: pid(1), date: today, body: "Yes, 1:00. Rehab went well, cleared for non-contact." } });
  await req("/care/notes", { method: "POST", cookie: at, body: { player_id: pid(2), date: today, body: "Out at least 2–3 weeks. Will update after imaging." } });

  // Before training. Hamstring: called in at 7:30, came in, the AT recommends Limited (waiting on the coach).
  const p1 = await playerLogin(1);
  const { data: call } = await req(`/care/checks/${pid(1)}/call-in`, { method: "POST", cookie: at, body: { date: today, time: "07:30", kind: "check", reason: "Right hamstring", instructions: "Light bike 10 min before you come in", message: "Saw your check-in. Come see me at 7:30 so I can check the hamstring before practice." } });
  await req(`/me/care/treatments/${call.appointment.id}/respond`, { method: "POST", cookie: p1, body: { action: "accept" } });
  await req("/me/care/messages", { method: "POST", cookie: p1, body: { quick: "on_my_way" } });
  await req(`/care/checks/${pid(1)}/recommend`, { method: "POST", cookie: at, body: { date: today, level: "limited", note: "Non-contact. Strides up to 80%, no finishing" } });
  // Quad: seen, AT recommended Out and the coach agreed.
  await req(`/care/checks/${pid(2)}/call-in`, { method: "POST", cookie: at, body: { date: today, time: "07:15", kind: "check", reason: "Left quad", instructions: "Ice 15 min before" } });
  await req(`/care/checks/${pid(2)}/recommend`, { method: "POST", cookie: at, body: { date: today, level: "out", note: "Rehab inside, bike as tolerated" } });
  await req(`/care/checks/${pid(2)}/decide`, { method: "POST", cookie: coach, body: { date: today, level: "out" } });
}

console.log(`p${players[0].player_id}@fau.edu`); // first seeded player = the preview's player
