// Preview-only stand-in for the athletic trainer care API (server/src/routes/care.ts,
// server/src/lib/care.ts and /api/me/care). The preview has no server, so the care
// tables captured from the test server (capture.mjs: careRaw) are kept in memory
// and the same rules are applied here: play status carries forward, open issues on
// a day, the day view, a player's care, an issue's detail. Changes last for the visit.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { injuryReportWorkbook, reportFilename } from "../../server/src/lib/careReport";
import { regionLabel } from "../lib/bodyRegions";

export interface DemoAlert {
  title: string;
  body: string;
  url: string;
}

type Row = Record<string, any>;
interface Raw {
  availability: Row[];
  treatments: Row[];
  notes: Row[];
  issues: Row[];
  stages: Row[];
  logs: Row[];
  messages: Row[];
  checks: Row[];
}

/** Today's check-in for each player (from the preview's squad board). */
export type EntriesOn = (date: string) => { player_id: number; readiness_score: number; notes: string | null; submitted_at: string; soreness: { region: string; severity: string; note: string | null }[] }[];

const PRIORITY_READINESS = 50;
const LEVEL_LABEL: Record<string, string> = { full: "Full", as_tolerated: "As tolerated", limited: "Limited", rehab: "Rehab only", out: "Out" };
const REASON_ORDER = ["severe", "injury_area", "low", "restricted", "manual"];
const base = (r: string) => r.replace(/_(l|r)$/, "");
const sideOf = (r: string) => r.match(/_(l|r)$/)?.[1] ?? null;
const sameArea = (sore: string, injury: string | null) => !!injury && (sore === injury || (base(sore) === base(injury) && (!sideOf(sore) || !sideOf(injury))));

const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function createCareMock(data: Record<string, any>, today: string, myPlayerId: number) {
  const raw: Raw = JSON.parse(JSON.stringify(data.careRaw ?? {}));
  for (const k of ["availability", "treatments", "notes", "issues", "stages", "logs", "messages", "checks"] as const) raw[k] ??= [];
  let entriesOn: EntriesOn = () => [];
  const roster: { player_id: number; name: string; position: string | null }[] = data.careRoster ?? [];
  const pain: Record<string, any[]> = data.carePain ?? {};
  let nextId = 100_000;

  // Check-in alerts (server/src/lib/careAlerts.ts): settings per view, and the
  // phone alerts each view would have received, shown as a banner in the preview.
  const THRESHOLDS = [30, 40, 50, 60];
  const prefs: Record<string, { severe: boolean; moderate: boolean; low_readiness: boolean; readiness_below: number }> = {
    trainer: { severe: true, moderate: true, low_readiness: true, readiness_below: 50 },
    coach: { severe: false, moderate: false, low_readiness: false, readiness_below: 50 },
  };
  const inbox: Record<string, DemoAlert[]> = { trainer: [], coach: [] };
  const alertedKeys = new Set<string>();

  function onCheckin(playerId: number, entry: { entry_date: string; readiness_score: number; notes: string | null; soreness: { region: string; severity: string; note: string | null }[] }) {
    const name = roster.find((p) => p.player_id === playerId)?.name ?? "Player";
    const sent = new Set<string>();
    for (const role of ["trainer", "coach"]) {
      const pr = prefs[role];
      const sore = entry.soreness.filter((x) => (x.severity === "severe" && pr.severe) || (x.severity === "moderate" && pr.moderate));
      const keys = [...sore.map((x) => `${x.severity}:${x.region}`), ...(pr.low_readiness && entry.readiness_score <= pr.readiness_below ? [`low:${pr.readiness_below}`] : [])];
      if (!keys.some((k) => !alertedKeys.has(`${playerId}:${entry.entry_date}:${k}`))) continue;
      const order = (x: { severity: string }) => (x.severity === "severe" ? 0 : 1);
      const parts = [...[...sore].sort((a, b) => order(a) - order(b)).map((x) => `${regionLabel(x.region)} ${x.severity}`), `Readiness ${entry.readiness_score}%`];
      const note = entry.notes?.trim() || entry.soreness.find((x) => x.note)?.note?.trim();
      inbox[role] = [{ title: `Check-in: ${name}`, body: [parts.join(" · "), note ? `“${note}”` : ""].filter(Boolean).join("\n"), url: `/readiness?care=${playerId}` }];
      keys.forEach((k) => sent.add(`${playerId}:${entry.entry_date}:${k}`));
    }
    sent.forEach((k) => alertedKeys.add(k));
  }
  const takeAlert = (role: string) => inbox[role]?.shift() ?? null;

  const availabilityOn = (date: string) => {
    const best = new Map<number, Row>();
    for (const a of raw.availability) if (a.status_date <= date && (!best.has(a.player_id) || best.get(a.player_id)!.status_date < a.status_date)) best.set(a.player_id, a);
    return best;
  };
  const latestLog = (issueId: number, date: string) =>
    raw.logs.filter((l) => l.injury_id === issueId && l.log_date <= date).sort((a, b) => b.log_date.localeCompare(a.log_date) || b.id - a.id)[0] ?? null;
  const openIssuesOn = (date: string) =>
    raw.issues
      .filter((i) => (!i.closed_at || i.closed_at > date) && (!i.injury_date || i.injury_date <= date))
      .sort((a, b) => String(b.injury_date ?? "").localeCompare(String(a.injury_date ?? "")))
      .map((i) => ({ ...i, days: i.injury_date ? daysBetween(i.injury_date, date) : null, latestLog: latestLog(i.id, date) }));

  function careDay(date: string) {
    const av = availabilityOn(date);
    const issues = openIssuesOn(date);
    return {
      date,
      today,
      players: roster.map((p) => ({
        ...p,
        availability: av.get(p.player_id) ?? null,
        treatments: raw.treatments
          .filter((t) => t.player_id === p.player_id && t.treat_date === date && t.status !== "cancelled")
          .sort((a, b) => String(a.treat_time).localeCompare(String(b.treat_time))),
        notes: raw.notes.filter((n) => n.player_id === p.player_id && n.note_date === date),
        messages: raw.messages.filter((m) => m.player_id === p.player_id && m.msg_date === date),
        issues: issues.filter((i) => i.player_id === p.player_id),
      })),
    };
  }

  function issueDetail(id: number) {
    const issue = raw.issues.find((i) => i.id === id);
    if (!issue) return null;
    const from = issue.injury_date ?? String(issue.created_at).slice(0, 10);
    return {
      today,
      issue,
      player: { id: issue.player_id, name: roster.find((p) => p.player_id === issue.player_id)?.name ?? "Player" },
      stages: raw.stages.filter((s) => s.injury_id === id).sort((a, b) => a.stage_date.localeCompare(b.stage_date) || a.id - b.id),
      logs: raw.logs.filter((l) => l.injury_id === id).sort((a, b) => b.log_date.localeCompare(a.log_date) || b.id - a.id),
      painTrend: pain[id] ?? [],
      availability: raw.availability.filter((a) => a.player_id === issue.player_id && a.status_date >= shift(from, -1)).sort((a, b) => a.status_date.localeCompare(b.status_date)),
    };
  }

  // ---- Before training (server/src/lib/beforeTraining.ts) ----
  const getCheck = (playerId: number, date: string) => raw.checks.find((c) => c.player_id === playerId && c.check_date === date) ?? null;
  function updateCheck(playerId: number, date: string, change: Row) {
    let c = getCheck(playerId, date);
    if (!c) {
      c = { player_id: playerId, check_date: date, flagged: 0, flag_note: null, flagged_by: null, appointment_id: null, cleared_by: null, cleared_at: null, recommendation: null, rec_note: null, recommended_by: null, recommended_at: null, decision: null, decision_note: null, decided_by: null, decided_at: null, kept_same: 0 };
      raw.checks.push(c);
    }
    Object.assign(c, change, { updated_at: nowSql() });
    return c;
  }
  const stageOf = (c: Row | null, a: Row | null) =>
    c?.decision ? "decided" : c?.recommendation ? "awaiting_coach" : c?.cleared_at ? "cleared" : a && a.status !== "cancelled" ? "called_in" : "flagged";

  function beforeTraining(date: string) {
    const av = availabilityOn(date);
    const issues = openIssuesOn(date).filter((i) => i.category === "injury");
    const entries = entriesOn(date);
    const ids = new Set<number>([...entries.map((e) => e.player_id), ...av.keys(), ...raw.checks.filter((c) => c.check_date === date).map((c) => c.player_id)]);
    const items: Row[] = [];
    for (const playerId of ids) {
      const player = roster.find((p) => p.player_id === playerId);
      if (!player) continue;
      const checkin = entries.find((e) => e.player_id === playerId) ?? null;
      const mine = issues.filter((i) => i.player_id === playerId);
      const a = av.get(playerId) ?? null;
      const check = getCheck(playerId, date);
      const reasons: { kind: string; label: string }[] = [];
      for (const sr of checkin?.soreness ?? []) {
        const injury = mine.find((i) => sameArea(sr.region, i.region));
        if (injury) reasons.push({ kind: "injury_area", label: `${regionLabel(sr.region)} ${sr.severity} · ${injury.description}` });
        else if (sr.severity === "severe") reasons.push({ kind: "severe", label: `${regionLabel(sr.region)} severe` });
      }
      if (checkin && checkin.readiness_score <= PRIORITY_READINESS) reasons.push({ kind: "low", label: `Readiness ${checkin.readiness_score}%` });
      if (a && ["as_tolerated", "limited", "rehab", "out"].includes(a.level))
        reasons.push({ kind: "restricted", label: `${a.level === "out" ? "Out" : `On ${LEVEL_LABEL[a.level]}`}${a.practice_note ? ` · ${a.practice_note}` : ""}` });
      if (check?.flagged) reasons.push({ kind: "manual", label: check.flag_note ? `Flagged: ${check.flag_note}` : "Flagged by the AT" });
      if (!reasons.length && !check?.appointment_id && !check?.recommendation && !check?.decision) continue;
      reasons.sort((x, y) => REASON_ORDER.indexOf(x.kind) - REASON_ORDER.indexOf(y.kind));
      const appts = raw.treatments.filter((t) => t.player_id === playerId && t.treat_date === date && t.status !== "cancelled").sort((x, y) => String(x.treat_time).localeCompare(String(y.treat_time)));
      const appointment = (check?.appointment_id ? appts.find((t) => t.id === check.appointment_id) : null) ?? null;
      items.push({
        player_id: playerId,
        name: player.name,
        reasons,
        checkin: checkin ? { readiness_score: checkin.readiness_score, notes: checkin.notes, submitted_at: checkin.submitted_at, soreness: checkin.soreness } : null,
        availability: a,
        check,
        appointment,
        appointments: appts,
        messages: raw.messages.filter((m) => m.player_id === playerId && m.msg_date === date),
        stage: stageOf(check, appointment),
      });
    }
    const rank: Record<string, number> = { awaiting_coach: 0, flagged: 1, called_in: 2, decided: 3, cleared: 4 };
    const rr = (r: Row[]) => (r.length ? REASON_ORDER.indexOf(r[0].kind) : 9);
    items.sort((x, y) => rank[x.stage] - rank[y.stage] || rr(x.reasons) - rr(y.reasons) || x.name.localeCompare(y.name));
    return { today, date, threshold: PRIORITY_READINESS, items };
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const email = (role: string) => (role === "trainer" ? "at@fau.edu" : "coach@fau.edu");

  /** Answers a care request, or null when it isn't one. */
  function route(method: string, path: string, q: URLSearchParams, body: any, role: string): Response | null {
    const date = q.get("date") ?? today;
    if (path === "/api/me/care" && method === "GET") {
      const c = getCheck(myPlayerId, today);
      const av = availabilityOn(today).get(myPlayerId);
      return json({
        today,
        availability: av ? { level: av.level, practice_note: av.practice_note, bike: av.bike, jogging: av.jogging, running: av.running } : null,
        issues: raw.issues
          .filter((i) => i.player_id === myPlayerId && (!i.closed_at || i.closed_at >= shift(today, -60)))
          .map(({ id, category, description, side, injury_date, expected_return, stage, closed_at }) => ({ id, category, description, side, injury_date, expected_return, stage, closed_at })),
        treatments: raw.treatments
          .filter((t) => t.player_id === myPlayerId && t.treat_date >= today && t.status !== "cancelled")
          .sort((a, b) => (a.treat_date + a.treat_time).localeCompare(b.treat_date + b.treat_time)),
        messages: raw.messages.filter((m) => m.player_id === myPlayerId && m.msg_date === today),
        check: c ? { appointment_id: c.appointment_id, decision: c.decision, decision_note: c.decision_note } : null,
      });
    }
    const r = path.match(/^\/api\/me\/care\/treatments\/(\d+)\/respond$/);
    if (r && method === "POST") {
      const t = raw.treatments.find((x) => x.id === Number(r![1]) && x.player_id === myPlayerId);
      if (!t) return json({ error: "Booking not found." }, 404);
      if (body.action === "reschedule" && !body.time) return json({ error: "Pick the time that works for you." }, 400);
      if (body.action === "accept") Object.assign(t, { status: "booked", awaiting: null });
      else if (body.action === "decline") Object.assign(t, { status: "declined", awaiting: null });
      else Object.assign(t, { status: "pending", awaiting: "trainer", treat_date: body.date ?? t.treat_date, treat_time: body.time });
      Object.assign(t, { player_note: body.note || null, updated_at: nowSql() });
      return json(t);
    }
    if (path === "/api/me/care/requests" && method === "POST") {
      if (!body.time) return json({ error: "Pick a time." }, 400);
      const row = { id: nextId++, player_id: myPlayerId, treat_date: body.date, treat_time: body.time, kind: body.kind ?? "treatment", reason: body.reason || null, instructions: null, status: "pending", awaiting: "trainer", requested_by: "player", player_note: body.note || null, attended_marked_by: null, created_by: "player", created_at: nowSql(), updated_at: nowSql() };
      raw.treatments.push(row);
      return json(row, 201);
    }
    if (path === "/api/me/care/messages" && method === "POST") {
      const quick: Record<string, string> = { on_my_way: "On my way", running_late: "Running 10 minutes late", feeling_better: "Feeling better now", need_time: "Can we do another time?" };
      const text = [body.quick ? quick[body.quick] : null, body.body || null].filter(Boolean).join(" · ");
      if (!text) return json({ error: "Write a message." }, 400);
      const row = { id: nextId++, player_id: myPlayerId, msg_date: today, author_role: "player", author_email: null, body: text, quick: body.quick ?? null, created_at: nowSql() };
      raw.messages.push(row);
      return json(row, 201);
    }
    let m = path.match(/^\/api\/me\/care\/treatments\/(\d+)\/attended$/);
    if (m && method === "POST") {
      const t = raw.treatments.find((x) => x.id === Number(m![1]) && x.player_id === myPlayerId);
      if (!t) return json({ error: "Booking not found." }, 404);
      Object.assign(t, { status: "attended", awaiting: null, attended_marked_by: "player", updated_at: nowSql() });
      return json({ ok: true });
    }
    if (!path.startsWith("/api/care/")) return null;
    if (role !== "coach" && role !== "trainer") return json({ error: "Coaches and athletic trainers only." }, 403);
    const who = email(role);

    if (path === "/api/care/day") return json(careDay(date));
    if (path === "/api/care/alerts") {
      if (method === "PUT") Object.assign(prefs[role], body);
      return json({ signedIn: true, prefs: prefs[role], thresholds: THRESHOLDS, publicKey: "preview" });
    }
    if (path === "/api/care/report.xlsx") {
      const bytes = XLSX.write(injuryReportWorkbook(careDay(date)), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      return new Response(bytes, {
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${reportFilename(date)}"` },
      });
    }
    if ((m = path.match(/^\/api\/care\/player\/(\d+)$/))) {
      const id = Number(m[1]);
      return json({
        date,
        day: careDay(date).players.find((p) => p.player_id === id) ?? null,
        history: raw.availability.filter((a) => a.player_id === id && a.status_date <= date).sort((a, b) => b.status_date.localeCompare(a.status_date)).slice(0, 30),
        pastIssues: raw.issues.filter((i) => i.player_id === id && i.closed_at),
        recentNotes: raw.notes.filter((n) => n.player_id === id && n.note_date <= date).slice(-30).reverse(),
        treatments: raw.treatments.filter((t) => t.player_id === id && t.treat_date >= shift(date, -14)),
      });
    }
    if ((m = path.match(/^\/api\/care\/availability\/(\d+)$/)) && method === "PUT") {
      const player_id = Number(m[1]);
      raw.availability = raw.availability.filter((a) => !(a.player_id === player_id && a.status_date === body.date));
      raw.availability.push({ player_id, status_date: body.date, level: body.level, practice_note: body.practice_note || null, bike: body.bike || null, jogging: body.jogging || null, running: body.running || null, set_by: who, updated_at: nowSql() });
      return json({ ok: true });
    }
    if (path === "/api/care/treatments" && method === "POST") {
      const row = { id: nextId++, player_id: body.player_id, treat_date: body.date, treat_time: body.time ?? null, kind: body.kind ?? "treatment", reason: body.reason || null, instructions: body.instructions || null, status: "pending", awaiting: "player", requested_by: "trainer", player_note: null, attended_marked_by: null, created_by: who, created_at: nowSql(), updated_at: nowSql() };
      raw.treatments.push(row);
      if (row.kind === "check" && !getCheck(row.player_id, row.treat_date)?.appointment_id) updateCheck(row.player_id, row.treat_date, { appointment_id: row.id });
      return json(row, 201);
    }
    if ((m = path.match(/^\/api\/care\/treatments\/(\d+)$/))) {
      const t = raw.treatments.find((x) => x.id === Number(m![1]));
      if (method === "DELETE") {
        raw.treatments = raw.treatments.filter((x) => x !== t);
        return json({ ok: true });
      }
      if (!t) return json({ error: "Booking not found." }, 404);
      const moved = (body.date && body.date !== t.treat_date) || (body.time !== undefined && body.time !== t.treat_time);
      if (body.status) {
        if (["attended", "missed"].includes(body.status) && body.status !== t.status) t.attended_marked_by = who;
        Object.assign(t, { status: body.status, awaiting: null });
      } else if (moved) Object.assign(t, { status: "pending", awaiting: "player" });
      Object.assign(t, {
        treat_date: body.date ?? t.treat_date,
        treat_time: body.time !== undefined ? body.time : t.treat_time,
        kind: body.kind ?? t.kind,
        reason: "reason" in body ? body.reason || null : t.reason,
        instructions: "instructions" in body ? body.instructions || null : t.instructions,
        updated_at: nowSql(),
      });
      return json(t);
    }
    if (path === "/api/care/messages" && method === "POST") {
      if (!String(body.body ?? "").trim()) return json({ error: "Write a message." }, 400);
      const row = { id: nextId++, player_id: body.player_id, msg_date: body.date, author_role: role === "trainer" ? "trainer" : "coach", author_email: who, body: String(body.body).trim(), quick: null, created_at: nowSql() };
      raw.messages.push(row);
      return json(row, 201);
    }
    if (path === "/api/care/before-training") return json(beforeTraining(date));
    if ((m = path.match(/^\/api\/care\/checks\/(\d+)\/(flag|call-in|clear|recommend|decide|reopen|same)$/)) && method === "POST") {
      const playerId = Number(m[1]);
      const d = body.date ?? today;
      switch (m[2]) {
        case "flag":
          return json(updateCheck(playerId, d, body.flagged === false ? { flagged: 0, flag_note: null } : { flagged: 1, flag_note: body.note || null, flagged_by: who }));
        case "call-in": {
          if (!body.time) return json({ error: "Pick a time." }, 400);
          const c = getCheck(playerId, d);
          let appt = c?.appointment_id ? raw.treatments.find((t) => t.id === c.appointment_id && t.status !== "cancelled") : null;
          const fields = { treat_time: body.time, kind: body.kind ?? "check", reason: body.reason || null, instructions: body.instructions || null, status: "pending", awaiting: "player", updated_at: nowSql() };
          if (appt) Object.assign(appt, fields);
          else {
            appt = { id: nextId++, player_id: playerId, treat_date: d, requested_by: "trainer", player_note: null, attended_marked_by: null, created_by: who, created_at: nowSql(), ...fields };
            raw.treatments.push(appt);
          }
          updateCheck(playerId, d, { appointment_id: appt.id, cleared_at: null, cleared_by: null });
          if (body.message) raw.messages.push({ id: nextId++, player_id: playerId, msg_date: d, author_role: role === "trainer" ? "trainer" : "coach", author_email: who, body: body.message, quick: null, created_at: nowSql() });
          return json({ ok: true, appointment: appt });
        }
        case "clear":
          return json(updateCheck(playerId, d, body.cleared === false ? { cleared_at: null, cleared_by: null } : { cleared_at: new Date().toISOString(), cleared_by: who }));
        case "recommend": {
          if (role !== "trainer") return json({ error: "Only the athletic trainer can do that." }, 403);
          const c = updateCheck(playerId, d, { recommendation: body.level, rec_note: body.note || null, recommended_by: who, recommended_at: new Date().toISOString(), cleared_at: null, cleared_by: null, decision: null, decision_note: null, decided_by: null, decided_at: null, kept_same: 0 });
          const appt = raw.treatments.find((t) => t.id === c.appointment_id && ["pending", "booked"].includes(t.status));
          if (appt) Object.assign(appt, { status: "attended", awaiting: null, attended_marked_by: appt.attended_marked_by ?? who });
          return json(c);
        }
        case "decide": {
          if (role !== "coach") return json({ error: "The coach makes the final call." }, 403);
          const c = updateCheck(playerId, d, { decision: body.level, decision_note: body.note || null, decided_by: who, decided_at: new Date().toISOString(), kept_same: 0 });
          const current = availabilityOn(d).get(playerId);
          raw.availability = raw.availability.filter((x) => !(x.player_id === playerId && x.status_date === d));
          raw.availability.push({
            player_id: playerId, status_date: d, level: body.level,
            practice_note: body.note || c.rec_note || (current?.level === body.level ? current.practice_note : null),
            bike: current?.bike ?? null, jogging: current?.jogging ?? null, running: current?.running ?? null, set_by: who, updated_at: nowSql(),
          });
          return json(c);
        }
        case "reopen":
          return json(updateCheck(playerId, d, { decision: null, decision_note: null, decided_by: null, decided_at: null, kept_same: 0 }));
        case "same": {
          const current = availabilityOn(d).get(playerId);
          const level = current?.level ?? "full";
          if (!raw.availability.some((x) => x.player_id === playerId && x.status_date === d)) {
            raw.availability.push({ ...(current ?? { practice_note: null, bike: null, jogging: null, running: null }), player_id: playerId, status_date: d, level, set_by: who, updated_at: nowSql() });
          }
          return json(updateCheck(playerId, d, { decision: level, decision_note: null, decided_by: who, decided_at: new Date().toISOString(), kept_same: 1, cleared_at: null, cleared_by: null }));
        }
      }
    }
    if (path === "/api/care/notes" && method === "POST") {
      const row = { id: nextId++, player_id: body.player_id, note_date: body.date, author_email: who, author_role: role, body: String(body.body ?? "").trim(), created_at: nowSql() };
      if (!row.body) return json({ error: "Write a note." }, 400);
      raw.notes.push(row);
      return json(row, 201);
    }
    if ((m = path.match(/^\/api\/care\/notes\/(\d+)$/)) && method === "DELETE") {
      raw.notes = raw.notes.filter((n) => !(n.id === Number(m![1]) && n.author_email === who));
      return json({ ok: true });
    }
    if (path === "/api/care/issues" && method === "GET") {
      const all = q.get("include") === "closed";
      const issues = raw.issues
        .filter((i) => all || !i.closed_at)
        .map((i) => ({ ...i, player_name: roster.find((p) => p.player_id === i.player_id)?.name ?? "Player", last_log_date: latestLog(i.id, "9999-12-31")?.log_date ?? null }))
        .sort((a, b) => Number(Boolean(a.closed_at)) - Number(Boolean(b.closed_at)) || String(b.injury_date ?? "").localeCompare(String(a.injury_date ?? "")));
      return json({ today, issues });
    }
    if (path === "/api/care/issues" && method === "POST") {
      if (!String(body.description ?? "").trim()) return json({ error: "Describe the injury or issue." }, 400);
      const row = {
        id: nextId++, player_id: body.player_id, category: body.category ?? "injury", description: String(body.description).trim(), region: body.region || null, side: body.side || null,
        injury_date: body.injury_date || null, expected_return: body.expected_return || null, stage: body.stage ?? "rehab", closed_at: null, created_by: who, created_at: nowSql(), updated_at: nowSql(),
      };
      raw.issues.push(row);
      raw.stages.push({ id: nextId++, injury_id: row.id, stage: row.stage, stage_date: row.injury_date ?? today, set_by: who });
      pain[row.id] = [];
      return json(row, 201);
    }
    if ((m = path.match(/^\/api\/care\/issues\/(\d+)$/))) {
      const id = Number(m[1]);
      if (method === "GET") {
        const d = issueDetail(id);
        return d ? json(d) : json({ error: "Not found." }, 404);
      }
      const i = raw.issues.find((x) => x.id === id);
      if (!i) return json({ error: "Not found." }, 404);
      if (method === "DELETE") {
        raw.issues = raw.issues.filter((x) => x !== i);
        return json({ ok: true });
      }
      for (const f of ["category", "description", "region", "side", "injury_date", "expected_return"]) if (f in body) i[f] = body[f] ?? null;
      if (body.stage && body.stage !== i.stage) {
        i.stage = body.stage;
        raw.stages.push({ id: nextId++, injury_id: id, stage: body.stage, stage_date: body.stage_date ?? today, set_by: who });
      }
      if (body.closed !== undefined) i.closed_at = body.closed ? today : null;
      i.updated_at = nowSql();
      return json({ ok: true });
    }
    if ((m = path.match(/^\/api\/care\/issues\/(\d+)\/logs$/)) && method === "POST") {
      if (!String(body.activities ?? "").trim()) return json({ error: "Write what they did." }, 400);
      const row = { id: nextId++, injury_id: Number(m[1]), log_date: body.date, activities: String(body.activities).trim(), minutes: body.minutes ?? null, notes: body.notes || null, created_by: who };
      raw.logs.push(row);
      return json(row, 201);
    }
    if ((m = path.match(/^\/api\/care\/issues\/(\d+)\/logs\/(\d+)$/)) && method === "DELETE") {
      raw.logs = raw.logs.filter((l) => l.id !== Number(m![2]));
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  }

  return { route, onCheckin, takeAlert, setEntries: (fn: EntriesOn) => (entriesOn = fn) };
}
