import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { BODY_REGION_IDS, SEVERITIES } from "../lib/bodyRegions.js";
import { computeFitness, FITNESS_AMBER, FITNESS_RED } from "../lib/fitness.js";
import { CORE_METRIC_KEYS, GLITCH_SQL } from "../lib/metrics.js";
import { getReminderSettings } from "../jobs/morningReminder.js";
import { removeSubscription, saveSubscription, vapidPublicKey } from "../lib/push.js";
import { gameOnDate, getCheckins, readinessScore, shiftDate, teamToday } from "../lib/readiness.js";
import { getPlayerDetail } from "./players.js";

/**
 * Everything a signed-in player can see: their own profile/GPS/readiness, plus
 * squad GPS for context with every other player's identity stripped.
 * All handlers read the player id from the session, never from the request.
 */
export const meRouter = Router();

const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");

meRouter.get("/profile", (req, res) => {
  const playerId = req.user!.playerId!;
  const detail = getPlayerDetail(playerId);
  if (!detail) return res.status(404).json({ error: "Your player profile wasn't found. Ask a coach to check your account." });

  const db = getDb();
  const teamAverages = db.prepare(`SELECT ${avgSelects} FROM gps_sessions_valid`).get();

  // Per-game squad averages, for "you vs team" trend lines.
  const teamTrend = db
    .prepare(
      `SELECT g.id AS game_id, g.game_date, g.opponent, ${CORE_METRIC_KEYS.map((k) => `AVG(s.${k}) AS avg_${k}`).join(", ")}
       FROM games g JOIN gps_sessions_valid s ON s.game_id = g.id
       GROUP BY g.id ORDER BY g.game_date ASC`,
    )
    .all();

  // Where the player's season average ranks in the squad, per metric (1 = highest).
  const perPlayer = db
    .prepare(`SELECT player_id, ${avgSelects} FROM gps_sessions_valid GROUP BY player_id`)
    .all() as Array<Record<string, number | null> & { player_id: number }>;
  const ranks: Record<string, { rank: number; outOf: number } | null> = {};
  for (const key of CORE_METRIC_KEYS) {
    const values = perPlayer
      .filter((p) => p[`avg_${key}`] !== null)
      .map((p) => ({ id: p.player_id, v: p[`avg_${key}`] as number }))
      .sort((a, b) => b.v - a.v);
    const idx = values.findIndex((v) => v.id === playerId);
    ranks[key] = idx === -1 ? null : { rank: idx + 1, outOf: values.length };
  }

  // Squad's best single game per metric (no names), for the Highs tab.
  const teamHighs = db
    .prepare(`SELECT ${CORE_METRIC_KEYS.map((k) => `MAX(${k}) AS max_${k}`).join(", ")} FROM gps_sessions_valid`)
    .get();

  res.json({ ...detail, teamAverages, teamTrend, ranks, teamHighs });
});

/** The player's own load vs the players getting minutes. No other player's name or numbers. */
meRouter.get("/fitness", (req, res) => {
  const { asOf, players } = computeFitness();
  const mine = players.find((p) => p.playerId === req.user!.playerId);
  res.json({ asOf, you: mine ?? null, thresholds: { amber: FITNESS_AMBER, red: FITNESS_RED } });
});

meRouter.get("/gps/:gameId", (req, res) => {
  const playerId = req.user!.playerId!;
  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId)) return res.status(400).json({ error: "invalid game id" });

  const db = getDb();
  const game = db.prepare("SELECT id, game_date, opponent FROM games WHERE id = ?").get(gameId);
  if (!game) return res.status(404).json({ error: "game not found" });

  const cols = CORE_METRIC_KEYS.map((k) => `s.${k}`).join(", ");
  const rows = db
    .prepare(`SELECT s.player_id, ${cols}, ${GLITCH_SQL} FROM gps_sessions s WHERE s.game_id = ? ORDER BY s.load DESC`)
    .all(gameId) as Array<Record<string, number | null> & { player_id: number }>;

  const strip = ({ player_id: _id, ...metrics }: Record<string, number | null> & { player_id: number }) => metrics;
  const mine = rows.find((r) => r.player_id === playerId);
  // Teammates' glitched sessions would distort the chart, so they're left out.
  const others = rows.filter((r) => r.player_id !== playerId && !r.glitch).map(strip);
  const teamAverages = db.prepare(`SELECT ${avgSelects} FROM gps_sessions_valid WHERE game_id = ?`).get(gameId);

  res.json({ game, you: mine ? strip(mine) : null, others, teamAverages });
});

const sorenessSchema = z.object({
  region: z.string().refine((r) => BODY_REGION_IDS.has(r), "unknown body region"),
  severity: z.enum(SEVERITIES),
  note: z.string().trim().max(300).optional().nullable(),
});

const checkinSchema = z.object({
  readiness_rating: z.number().int().min(1).max(10),
  sleep_hours: z.number().min(0).max(16).optional().nullable(),
  sleep_quality: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  muscle_soreness: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  mood: z.number().int().min(1).max(5),
  notes: z.string().trim().max(1000).optional().nullable(),
  soreness: z
    .array(sorenessSchema)
    .max(BODY_REGION_IDS.size)
    .refine((list) => new Set(list.map((s) => s.region)).size === list.length, "duplicate body region"),
});

meRouter.get("/readiness/today", (req, res) => {
  const playerId = req.user!.playerId!;
  const date = teamToday();
  const [entry] = getCheckins(playerId, date, date);
  res.json({ date, game: gameOnDate(date), entry: entry ?? null });
});

meRouter.put("/readiness/today", (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check your answers and try again." });
  }
  const input = parsed.data;
  const playerId = req.user!.playerId!;
  const date = teamToday();
  const isGameDay = gameOnDate(date) ? 1 : 0;
  const score = readinessScore(input.readiness_rating);

  const db = getDb();
  db.transaction(() => {
    const { id } = db
      .prepare(
        `INSERT INTO readiness_checkins
           (player_id, entry_date, is_game_day, readiness_rating, sleep_hours, sleep_quality, energy, muscle_soreness, stress, mood, readiness_score, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, entry_date) DO UPDATE SET
           is_game_day = excluded.is_game_day, readiness_rating = excluded.readiness_rating, sleep_hours = excluded.sleep_hours,
           sleep_quality = excluded.sleep_quality, energy = excluded.energy,
           muscle_soreness = excluded.muscle_soreness, stress = excluded.stress, mood = excluded.mood,
           readiness_score = excluded.readiness_score, notes = excluded.notes, updated_at = datetime('now')
         RETURNING id`,
      )
      .get(
        playerId,
        date,
        isGameDay,
        input.readiness_rating,
        input.sleep_hours ?? null,
        input.sleep_quality,
        input.energy,
        input.muscle_soreness,
        input.stress,
        input.mood,
        score,
        input.notes || null,
      ) as { id: number };

    db.prepare("DELETE FROM readiness_soreness WHERE checkin_id = ?").run(id);
    const insert = db.prepare("INSERT INTO readiness_soreness (checkin_id, region, severity, note) VALUES (?, ?, ?, ?)");
    for (const s of input.soreness) insert.run(id, s.region, s.severity, s.note || null);
  })();

  const [entry] = getCheckins(playerId, date, date);
  res.json({ date, game: gameOnDate(date), entry });
});

meRouter.get("/readiness/history", (req, res) => {
  const playerId = req.user!.playerId!;
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const today = teamToday();
  res.json({ today, entries: getCheckins(playerId, shiftDate(today, -(days - 1)), today) });
});

// --- Morning reminder notifications ------------------------------------------

meRouter.get("/push/config", (_req, res) => {
  const { enabled, time, followupEnabled, followupTime } = getReminderSettings();
  res.json({
    publicKey: vapidPublicKey(),
    reminderEnabled: enabled,
    reminderTime: time,
    followupTime: enabled && followupEnabled ? followupTime : null,
  });
});

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

meRouter.post("/push/subscribe", (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid notification subscription." });
  saveSubscription(req.user!.userId!, parsed.data);
  res.json({ ok: true });
});

meRouter.post("/push/unsubscribe", (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  removeSubscription(req.user!.userId!, endpoint);
  res.json({ ok: true });
});
