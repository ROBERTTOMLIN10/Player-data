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
}

const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function createCareMock(data: Record<string, any>, today: string, myPlayerId: number) {
  const raw: Raw = JSON.parse(JSON.stringify(data.careRaw ?? { availability: [], treatments: [], notes: [], issues: [], stages: [], logs: [] }));
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
        treatments: raw.treatments.filter((t) => t.player_id === p.player_id && t.treat_date === date).sort((a, b) => String(a.treat_time).localeCompare(String(b.treat_time))),
        notes: raw.notes.filter((n) => n.player_id === p.player_id && n.note_date === date),
        issues: issues.filter((i) => i.player_id === p.player_id),
      })),
    };
  }

  /** The Readiness board's care column. */
  function summaryFor(playerId: number, date: string) {
    const p = careDay(date).players.find((x) => x.player_id === playerId);
    if (!p) return { availability: null, treatments: [], noteCount: 0, issues: [] };
    return {
      availability: p.availability,
      treatments: p.treatments,
      noteCount: p.notes.length,
      issues: p.issues.map((i: Row) => ({ id: i.id, category: i.category, description: i.description, side: i.side, stage: i.stage, days: i.days })),
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

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const email = (role: string) => (role === "trainer" ? "at@fau.edu" : "coach@fau.edu");

  /** Answers a care request, or null when it isn't one. */
  function route(method: string, path: string, q: URLSearchParams, body: any, role: string): Response | null {
    const date = q.get("date") ?? today;
    if (path === "/api/me/care" && method === "GET") {
      return json({ today, treatments: raw.treatments.filter((t) => t.player_id === myPlayerId && t.treat_date >= today).sort((a, b) => (a.treat_date + a.treat_time).localeCompare(b.treat_date + b.treat_time)) });
    }
    let m = path.match(/^\/api\/me\/care\/treatments\/(\d+)\/attended$/);
    if (m && method === "POST") {
      const t = raw.treatments.find((x) => x.id === Number(m![1]) && x.player_id === myPlayerId);
      if (!t) return json({ error: "Booking not found." }, 404);
      Object.assign(t, { status: "attended", attended_marked_by: "player", updated_at: nowSql() });
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
      const row = { id: nextId++, player_id: body.player_id, treat_date: body.date, treat_time: body.time ?? null, instructions: body.instructions || null, status: "booked", attended_marked_by: null, created_by: who, created_at: nowSql(), updated_at: nowSql() };
      raw.treatments.push(row);
      return json(row, 201);
    }
    if ((m = path.match(/^\/api\/care\/treatments\/(\d+)$/))) {
      const t = raw.treatments.find((x) => x.id === Number(m![1]));
      if (method === "DELETE") {
        raw.treatments = raw.treatments.filter((x) => x !== t);
        return json({ ok: true });
      }
      if (!t) return json({ error: "Booking not found." }, 404);
      if (body.status && body.status !== t.status) t.attended_marked_by = who;
      Object.assign(t, {
        treat_date: body.date ?? t.treat_date,
        treat_time: body.time !== undefined ? body.time : t.treat_time,
        instructions: "instructions" in body ? body.instructions || null : t.instructions,
        status: body.status ?? t.status,
        updated_at: nowSql(),
      });
      return json(t);
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

  return { route, summaryFor, onCheckin, takeAlert };
}
