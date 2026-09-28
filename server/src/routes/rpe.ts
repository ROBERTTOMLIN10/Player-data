import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import {
  averagesFor,
  keeperScoresFor,
  planningFlags,
  readinessStatusOn,
  rosterKeepers,
  scoresFor,
  type KeeperRpeScore,
  type RpeEntry,
  type RpeScore,
} from "../lib/rpe.js";
import { gameOnDate, isIsoDate, shiftDate, teamToday } from "../lib/readiness.js";
import { POSITION_SUBQUERY } from "./players.js";

/** Coach RPE: quick post-session logging, squad trends, and one player's history. */
export const rpeRouter = Router();

interface SquadRow {
  player_id: number;
  name: string;
  position: string | null;
  jersey_number: string | null;
}

/** Players who log RPE: this season's roster when it's been synced, otherwise everyone in the app. */
function squad(): SquadRow[] {
  const db = getDb();
  const onRoster = (db.prepare("SELECT COUNT(*) AS n FROM roster_players WHERE player_id IS NOT NULL").get() as { n: number }).n > 0;
  return db
    .prepare(
      `SELECT p.id AS player_id, p.canonical_name AS name, pos.position, pos.jersey_number
       FROM players p ${POSITION_SUBQUERY}
       ${onRoster ? "WHERE p.id IN (SELECT player_id FROM roster_players WHERE player_id IS NOT NULL)" : ""}
       ORDER BY p.canonical_name ASC`,
    )
    .all() as SquadRow[];
}

const sessionOf = (v: unknown) => (Number(v) === 2 ? 2 : 1);

const averageOf = (list: number[]) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);

function groupBy<T, K>(list: T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of list) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return out;
}

/** Who was marked N/A ("didn't train") for a session: player ids and keeper names. */
function didNotTrain(date: string, session: number) {
  const db = getDb();
  return {
    players: new Set(
      (
        db.prepare("SELECT player_id FROM rpe_scores WHERE session_date = ? AND session = ? AND did_not_train = 1").all(date, session) as {
          player_id: number;
        }[]
      ).map((r) => r.player_id),
    ),
    keepers: new Set(
      (
        db
          .prepare("SELECT keeper_name FROM keeper_rpe_scores WHERE session_date = ? AND session = ? AND did_not_train = 1")
          .all(date, session) as { keeper_name: string }[]
      ).map((r) => r.keeper_name),
    ),
  };
}

/** Scores up to and including this session (so flags for a past session only use what was known then). */
const upTo = <T extends RpeEntry>(list: T[], date: string, session: number) =>
  list.filter((s) => s.session_date < date || (s.session_date === date && s.session <= session));

// One session's logging sheet: every player, their score (or not yet), averages and planning flags.
rpeRouter.get("/session", (req, res) => {
  const today = teamToday();
  const date = isIsoDate(req.query.date) ? req.query.date : today;
  const session = sessionOf(req.query.session);
  const players = squad();
  const history = scoresFor(null, shiftDate(date, -60), date);
  const readiness = readinessStatusOn(date);
  const na = didNotTrain(date, session);
  const byPlayer = new Map<number, RpeScore[]>();
  for (const s of history) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);

  const rows = players.map((p) => {
    const mine = (byPlayer.get(p.player_id) ?? []).filter(
      (s) => s.session_date < date || (s.session_date === date && s.session <= session),
    );
    const score = mine.find((s) => s.session_date === date && s.session === session) ?? null;
    const r = readiness.get(p.player_id) ?? null;
    return {
      ...p,
      rpe: score?.rpe ?? null,
      na: na.players.has(p.player_id),
      averages: averagesFor(mine, date),
      readiness: r,
      flags: planningFlags(score, mine, r?.status ?? null),
    };
  });
  const scored = rows.filter((r) => r.rpe !== null);

  // Goalkeepers: logged the same way, averaged on their own.
  const keeperHistory = groupBy(keeperScoresFor(shiftDate(date, -60), date), (s) => s.keeper_name);
  const keepers = rosterKeepers().map((k) => {
    const mine = upTo(keeperHistory.get(k.name) ?? [], date, session);
    const score = mine.find((s) => s.session_date === date && s.session === session) ?? null;
    return { ...k, rpe: score?.rpe ?? null, na: na.keepers.has(k.name), averages: averagesFor(mine, date), flags: planningFlags(score, mine, null) };
  });
  const keepersScored = keepers.filter((k) => k.rpe !== null);

  const sessions = (
    getDb()
      .prepare(
        `SELECT session FROM rpe_scores WHERE session_date = ? UNION SELECT session FROM keeper_rpe_scores WHERE session_date = ? ORDER BY session`,
      )
      .all(date, date) as { session: number }[]
  ).map((s) => s.session);
  res.json({
    date,
    today,
    session,
    sessions,
    game: gameOnDate(date),
    // "logged" counts N/A too (the player's been asked); averages only use scores.
    summary: {
      expected: rows.length,
      logged: scored.length + na.players.size,
      na: na.players.size,
      average: averageOf(scored.map((r) => r.rpe!)),
    },
    players: rows,
    keeperSummary: {
      expected: keepers.length,
      logged: keepersScored.length + na.keepers.size,
      na: na.keepers.size,
      average: averageOf(keepersScored.map((k) => k.rpe!)),
    },
    keepers,
    submitted: submissionFor(date, session),
  });
});

function submissionFor(date: string, session: number) {
  return (
    (getDb()
      .prepare("SELECT submitted_at, submitted_by FROM rpe_session_submissions WHERE session_date = ? AND session = ?")
      .get(date, session) as { submitted_at: string; submitted_by: string | null } | undefined) ?? null
  );
}

// Submit a session once every player's and keeper's score is in; players then see their score.
rpeRouter.post("/session/submit", (req, res) => {
  const parsed = z
    .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), session: z.union([z.literal(1), z.literal(2)]).default(1) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pick a session to submit." });
  const { date, session } = parsed.data;
  const db = getDb();
  const loggedPlayers = new Set(
    (db.prepare("SELECT player_id FROM rpe_scores WHERE session_date = ? AND session = ?").all(date, session) as { player_id: number }[]).map(
      (r) => r.player_id,
    ),
  );
  const loggedKeepers = new Set(
    (db.prepare("SELECT keeper_name FROM keeper_rpe_scores WHERE session_date = ? AND session = ?").all(date, session) as { keeper_name: string }[]).map(
      (r) => r.keeper_name,
    ),
  );
  const missing = [
    ...squad().filter((p) => !loggedPlayers.has(p.player_id)).map((p) => p.name),
    ...rosterKeepers().filter((k) => !loggedKeepers.has(k.name)).map((k) => k.name),
  ];
  if (missing.length) return res.status(400).json({ error: `Still to log: ${missing.join(", ")}.` });
  db.prepare(
    `INSERT INTO rpe_session_submissions (session_date, session, submitted_by) VALUES (?, ?, ?)
     ON CONFLICT(session_date, session) DO UPDATE SET submitted_by = excluded.submitted_by, submitted_at = datetime('now')`,
  ).run(date, session, req.user?.email ?? null);
  res.json({ date, session, submitted: submissionFor(date, session) });
});

const scoreInput = z.object({
  player_id: z.number().int().optional(),
  keeper_name: z.string().min(1).optional(), // a roster goalkeeper who isn't a player in the app
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.union([z.literal(1), z.literal(2)]).default(1),
  rpe: z.union([z.number().int().min(1).max(10), z.literal("na")]).nullable(), // "na": didn't train; null clears it
});

/** Values for an upsert: a score, or N/A (no score, did_not_train). */
const scoreValues = (rpe: number | "na") => (rpe === "na" ? { rpe: null, dnt: 1 } : { rpe, dnt: 0 });

// Log (or correct, or clear) one player's score for a session.
rpeRouter.put("/score", (req, res) => {
  const parsed = scoreInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "RPE must be a whole number from 1 to 10, or N/A." });
  const { player_id, keeper_name, date, session, rpe } = parsed.data;
  if (date > teamToday()) return res.status(400).json({ error: "Can't log RPE for a future session." });
  const db = getDb();
  if (keeper_name !== undefined) {
    if (!rosterKeepers().some((k) => k.name === keeper_name)) return res.status(404).json({ error: "Goalkeeper not found." });
    if (rpe === null) {
      db.prepare("DELETE FROM keeper_rpe_scores WHERE keeper_name = ? AND session_date = ? AND session = ?").run(keeper_name, date, session);
    } else {
      const v = scoreValues(rpe);
      db.prepare(
        `INSERT INTO keeper_rpe_scores (keeper_name, session_date, session, rpe, did_not_train, logged_by) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(keeper_name, session_date, session) DO UPDATE SET
           rpe = excluded.rpe, did_not_train = excluded.did_not_train, logged_by = excluded.logged_by, logged_at = datetime('now')`,
      ).run(keeper_name, date, session, v.rpe, v.dnt, req.user?.email ?? null);
    }
    return res.json({ keeper_name, date, session, rpe });
  }
  if (player_id === undefined || !db.prepare("SELECT 1 FROM players WHERE id = ?").get(player_id))
    return res.status(404).json({ error: "Player not found." });
  if (rpe === null) {
    db.prepare("DELETE FROM rpe_scores WHERE player_id = ? AND session_date = ? AND session = ?").run(player_id, date, session);
  } else {
    const v = scoreValues(rpe);
    db.prepare(
      `INSERT INTO rpe_scores (player_id, session_date, session, rpe, did_not_train, logged_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, session_date, session) DO UPDATE SET
         rpe = excluded.rpe, did_not_train = excluded.did_not_train, logged_by = excluded.logged_by, logged_at = datetime('now')`,
    ).run(player_id, date, session, v.rpe, v.dnt, req.user?.email ?? null);
  }
  res.json({ player_id, date, session, rpe });
});

// Every session logged so far (newest first): outfield and keeper averages, how many logged / N/A, and flags raised.
rpeRouter.get("/sessions", (_req, res) => {
  const today = teamToday();
  const scores = scoresFor(null, "0000-01-01", today);
  const keeperScores = keeperScoresFor("0000-01-01", today);
  const naRows = getDb()
    .prepare(
      `SELECT session_date, session, COUNT(*) AS n FROM (
         SELECT session_date, session FROM rpe_scores WHERE did_not_train = 1
         UNION ALL SELECT session_date, session FROM keeper_rpe_scores WHERE did_not_train = 1
       ) GROUP BY session_date, session`,
    )
    .all() as { session_date: string; session: number; n: number }[];
  const submitted = new Set(
    (getDb().prepare("SELECT session_date, session FROM rpe_session_submissions").all() as RpeEntry[]).map((s) => `${s.session_date}#${s.session}`),
  );

  const byPlayer = groupBy(scores, (s) => s.player_id);
  const byKeeper = groupBy(keeperScores, (s) => s.keeper_name);
  const id = (s: { session_date: string; session: number }) => `${s.session_date}#${s.session}`;
  const bySession = groupBy(scores, id);
  const keepersBySession = groupBy(keeperScores, id);
  const naBySession = new Map(naRows.map((r) => [id(r), r.n]));
  const readinessByDate = new Map<string, ReturnType<typeof readinessStatusOn>>();
  const readinessOn = (date: string) => readinessByDate.get(date) ?? readinessByDate.set(date, readinessStatusOn(date)).get(date)!;

  const keys = [...new Set([...bySession.keys(), ...keepersBySession.keys(), ...naBySession.keys()])].sort().reverse();
  const sessions = keys.map((key) => {
    const [date, s] = key.split("#");
    const session = Number(s);
    const outfield = bySession.get(key) ?? [];
    const keepers = keepersBySession.get(key) ?? [];
    const flagged =
      outfield.filter((x) => planningFlags(x, upTo(byPlayer.get(x.player_id)!, date, session), readinessOn(date).get(x.player_id)?.status ?? null).length)
        .length + keepers.filter((x) => planningFlags(x, upTo(byKeeper.get(x.keeper_name)!, date, session), null).length).length;
    return {
      date,
      session,
      average: averageOf(outfield.map((x) => x.rpe)),
      logged: outfield.length,
      keeperAverage: averageOf(keepers.map((x) => x.rpe)),
      keepersLogged: keepers.length,
      na: naBySession.get(key) ?? 0,
      flagged,
      submitted: submitted.has(key),
    };
  });
  res.json({ today, sessions });
});

// Squad trends: each player's latest score, 7-day and Last Month averages and flags, plus the squad's daily average.
rpeRouter.get("/trends", (_req, res) => {
  const today = teamToday();
  const players = squad();
  const history = scoresFor(null, shiftDate(today, -60), today);
  const byPlayer = new Map<number, RpeScore[]>();
  for (const s of history) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  const lastDate = history[0]?.session_date ?? null;
  const readiness = lastDate ? readinessStatusOn(lastDate) : new Map();

  const rows = players.map((p) => {
    const mine = byPlayer.get(p.player_id) ?? [];
    const last = mine[0] ?? null;
    return {
      ...p,
      last,
      averages: averagesFor(mine, today),
      flags: last && last.session_date === lastDate ? planningFlags(last, mine, readiness.get(p.player_id)?.status ?? null) : [],
    };
  });

  // Goalkeepers, on their own.
  const keeperHistory: KeeperRpeScore[] = keeperScoresFor(shiftDate(today, -60), today);
  const byKeeper = groupBy(keeperHistory, (s) => s.keeper_name);
  const keepers = rosterKeepers().map((k) => {
    const mine = byKeeper.get(k.name) ?? [];
    const last = mine[0] ?? null;
    return { ...k, last, averages: averagesFor(mine, today), flags: last ? planningFlags(last, mine, null) : [] };
  });

  // Daily averages over the last month: outfield squad, and keepers as their own line.
  const recent = (list: RpeEntry[]) => groupBy(list.filter((s) => s.session_date > shiftDate(today, -28)), (s) => s.session_date);
  const outfieldDays = recent(history);
  const keeperDays = recent(keeperHistory);
  const daily = [...new Set([...outfieldDays.keys(), ...keeperDays.keys()])].sort().map((date) => ({
    date,
    average: averageOf((outfieldDays.get(date) ?? []).map((s) => s.rpe)),
    logged: (outfieldDays.get(date) ?? []).length,
    keepers: averageOf((keeperDays.get(date) ?? []).map((s) => s.rpe)),
  }));

  res.json({
    today,
    lastSession: lastDate,
    players: rows,
    keepers,
    daily,
    squad: averagesFor(history, today),
    keeperAverages: averagesFor(keeperHistory, today),
  });
});

/** One player's scores over the last `days` days, with averages and flags (shared with the player's own view). */
export function playerRpe(playerId: number, days: number, submittedOnly = false) {
  const today = teamToday();
  const scores = scoresFor([playerId], shiftDate(today, -Math.max(days, 60)), today, submittedOnly);
  const last = scores[0] ?? null;
  const readiness = last ? readinessStatusOn(last.session_date).get(playerId) ?? null : null;
  return {
    today,
    entries: scores.filter((s) => s.session_date > shiftDate(today, -days)),
    latest: last,
    averages: averagesFor(scores, today),
    flags: planningFlags(last, scores, readiness?.status ?? null),
  };
}

rpeRouter.get("/player/:id", (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "invalid player id" });
  res.json(playerRpe(playerId, Math.min(Math.max(Number(req.query.days) || 30, 1), 365)));
});
