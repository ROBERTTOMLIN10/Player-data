// Preview-only stand-in for the server: answers the app's /api requests from
// data captured off a test server, and keeps check-ins/settings in memory.
/* eslint-disable @typescript-eslint/no-explicit-any */
import raw from "./data.json";

const data: Record<string, any> = raw as any;
export type DemoRole = "player" | "coach" | null;
export const demo = { role: "player" as DemoRole };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const PLAYER_ID: number = data.playerMe.playerId;
const TODAY: string = data["/api/me/readiness/today"].date;
const GAME = data["/api/me/readiness/today"].game;

let myEntry: any = null;
let pushOn = false;
const squad = clone(data["/api/readiness/squad"]);
const reminders = clone(data["/api/admin/reminders"]);
const accounts = clone(data["/api/admin/accounts"]);

const LOGOS: Record<string, string> = data.__logos ?? {};

function json(body: unknown, status = 200) {
  // Swap logo tokens back to the embedded images (see capture.mjs).
  const text = JSON.stringify(body).replace(/preview-logo:\d+/g, (t) => LOGOS[t] ?? "");
  return new Response(text, { status, headers: { "Content-Type": "application/json" } });
}

function flag(entry: any, baseline: number | null) {
  const flags: string[] = [];
  let status: "red" | "amber" | "green" = "green";
  const raise = (l: "red" | "amber") => {
    if (l === "red" || status === "green") status = l;
  };
  if (entry.readiness_score < 60) {
    flags.push("Low readiness");
    raise("red");
  } else if (entry.readiness_score < 75) raise("amber");
  if (entry.soreness.some((s: any) => s.severity === "severe")) {
    flags.push("Severe soreness");
    raise("red");
  } else if (entry.soreness.some((s: any) => s.severity === "moderate")) {
    flags.push("Moderate soreness");
    raise("amber");
  }
  if (entry.sleep_hours !== null && entry.sleep_hours < 6) {
    flags.push("Short sleep");
    raise("amber");
  }
  if (baseline !== null && entry.readiness_score <= baseline - 15) {
    flags.push(`${Math.round(baseline - entry.readiness_score)} below usual`);
    raise("amber");
  }
  return { status, flags };
}

function recomputeSquad() {
  const ps = squad.players;
  const count = (s: string) => ps.filter((p: any) => p.status === s).length;
  const entries = ps.filter((p: any) => p.entry).map((p: any) => p.entry);
  squad.summary = {
    expected: ps.length,
    submitted: entries.length,
    red: count("red"),
    amber: count("amber"),
    green: count("green"),
    averageScore: entries.length ? Math.round(entries.reduce((a: number, e: any) => a + e.readiness_score, 0) / entries.length) : null,
  };
  const rc: Record<string, any> = {};
  for (const e of entries)
    for (const s of e.soreness) {
      rc[s.region] ??= { light: 0, moderate: 0, severe: 0 };
      rc[s.region][s.severity] += 1;
    }
  squad.regionCounts = rc;
}

function squadFor(date: string | null) {
  if (!date || date === TODAY) return squad;
  // Other days: roster with nobody checked in (the preview only has today's data).
  return {
    ...squad,
    date,
    game: null,
    summary: { expected: squad.players.length, submitted: 0, red: 0, amber: 0, green: 0, averageScore: null },
    players: squad.players.map((p: any) => ({ ...p, entry: null, status: "missing", flags: [] })),
    regionCounts: {},
  };
}

function withMyEntry(history: any, decorate = false) {
  const h = clone(history);
  if (myEntry) {
    const e = decorate ? { ...myEntry, ...flag(myEntry, null) } : myEntry;
    h.entries = [e, ...h.entries.filter((x: any) => x.entry_date !== TODAY)];
  }
  return h;
}

function compare(ids: number[]) {
  const sessions: any[] = [];
  const seasonAverages: any[] = [];
  for (const id of ids) {
    const d = data[`/api/players/${id}`];
    if (!d) continue;
    for (const s of d.sessions) sessions.push({ ...s, player_name: d.player.canonical_name });
    seasonAverages.push({ player_id: id, player_name: d.player.canonical_name, ...d.seasonTotals });
  }
  return { sessions, seasonAverages, teamAverages: data["/api/team/summary"].seasonAverages };
}

function nowSql() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function route(method: string, path: string, q: URLSearchParams, body: any): Response {
  const role = demo.role;
  const key = path + (q.toString() ? `?${q.toString()}` : "");

  if (path === "/api/auth/login" && method === "POST") {
    demo.role = String(body?.email ?? "").toLowerCase().includes("coach") ? "coach" : "player";
    return json(demo.role === "coach" ? data.coachMe : data.playerMe);
  }
  if (path === "/api/auth/logout") {
    demo.role = null;
    return json({ ok: true });
  }
  if (path === "/api/auth/me") {
    if (!role) return json({ error: "Sign in required." }, 401);
    return json(role === "coach" ? data.coachMe : data.playerMe);
  }
  if (!role) return json({ error: "Sign in required." }, 401);

  // ---- player ----
  if (path === "/api/me/readiness/today") {
    if (method === "PUT") {
      const now = nowSql();
      myEntry = {
        id: 999999,
        player_id: PLAYER_ID,
        entry_date: TODAY,
        is_game_day: GAME ? 1 : 0,
        readiness_rating: body.readiness_rating,
        sleep_hours: body.sleep_hours ?? null,
        sleep_quality: body.sleep_quality,
        energy: body.energy,
        muscle_soreness: body.muscle_soreness,
        stress: body.stress,
        mood: body.mood,
        readiness_score: body.readiness_rating * 10,
        notes: body.notes || null,
        submitted_at: myEntry?.submitted_at ?? now,
        updated_at: now,
        soreness: body.soreness.map((s: any) => ({ region: s.region, severity: s.severity, note: s.note || null })),
      };
      const row = squad.players.find((p: any) => p.player_id === PLAYER_ID);
      if (row) Object.assign(row, { entry: myEntry }, flag(myEntry, row.baseline));
      recomputeSquad();
    }
    return json({ date: TODAY, game: GAME, entry: myEntry });
  }
  if (path === "/api/me/readiness/history") return json(withMyEntry(data[key] ?? data["/api/me/readiness/history?days=30"]));
  if (path === "/api/me/push/subscribe" || path === "/api/me/push/unsubscribe") return json({ ok: true });

  // ---- coach ----
  if (path === "/api/readiness/squad") return json(squadFor(q.get("date")));
  if (path.startsWith("/api/readiness/player/")) {
    const id = Number(path.split("/").pop());
    const h = data[key] ?? { today: TODAY, entries: [] };
    return json(id === PLAYER_ID ? withMyEntry(h, true) : h);
  }
  if (path === "/api/compare") return json(compare((q.get("playerIds") ?? "").split(",").map(Number)));
  if (path === "/api/admin/reminders") {
    if (method === "PUT") {
      const next = { ...reminders, ...body };
      if (next.followupTime <= next.time) return json({ error: "The follow-up has to be later than the first reminder." }, 400);
      Object.assign(reminders, body);
    }
    return json(reminders);
  }
  if (path === "/api/admin/reminders/send-now") {
    const n = squad.players.filter((p: any) => p.status === "missing").length;
    return json({ players: n, sent: n, failed: 0 });
  }
  if (path.startsWith("/api/admin/accounts")) {
    if (method === "POST") {
      const p = accounts.players.find((x: any) => x.player_id === body.playerId);
      if (body.role === "player" && p) Object.assign(p, { user_id: Date.now(), email: body.email, last_login_at: null });
      if (body.role === "coach") accounts.coaches.push({ user_id: Date.now(), email: body.email, last_login_at: null });
      return json({ user_id: Date.now() }, 201);
    }
    if (method === "DELETE") return json({ ok: true });
    if (method === "PATCH") return json({ ok: true });
    return json(accounts);
  }
  if (path === "/api/admin/upload-titan")
    return json({ status: "error", filename: "", message: "Uploading is turned off in this preview.", warnings: [] }, 422);
  if (path === "/api/admin/sync-minutes" || path === "/api/admin/sync-schedule")
    return json({
      status: "ok",
      message: "Syncing is turned off in this preview.",
      gamesMatched: 0,
      gamesSkippedNoBoxscore: 0,
      gamesUpserted: 0,
      gamesWithStatsSynced: 0,
      playerRowsUpserted: 0,
      rowsUpserted: 0,
      anomalies: [],
      unmatchedPlayers: [],
    });

  if (data[key] !== undefined) return json(data[key]);
  if (data[path] !== undefined) return json(data[path]);
  return json({ error: "Not found." }, 404);
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const str = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!str.startsWith("/api/")) return realFetch(input, init);
  const url = new URL(str, "http://preview.local");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  await new Promise((r) => setTimeout(r, 120));
  return route(method, url.pathname, url.searchParams, body);
};

export const demoPush = {
  get on() {
    return pushOn;
  },
  set(v: boolean) {
    pushOn = v;
  },
};
