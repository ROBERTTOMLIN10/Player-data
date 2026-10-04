import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { CATEGORIES, careDay, issueDetail, LEVELS, notifyTreatment, playerCare, STAGES, type Treatment } from "../lib/care.js";
import { isIsoDate, teamToday } from "../lib/readiness.js";

/**
 * Player care for coaches and athletic trainers (mounted under /api/care):
 * play status, treatment bookings, follow-up notes, issues and rehab logs.
 */
export const careRouter = Router();

const dateOf = (v: unknown) => (isIsoDate(v) ? v : teamToday());
const who = (req: { user?: { email: string } }) => req.user?.email ?? null;
const text = (max = 1000) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const playerExists = (id: number) => Boolean(getDb().prepare("SELECT 1 FROM players WHERE id = ?").get(id));
const bad = (res: { status: (n: number) => { json: (b: unknown) => void } }, err: z.ZodError) =>
  res.status(400).json({ error: err.issues[0]?.message ?? "Invalid details." });

careRouter.get("/day", (req, res) => {
  res.json({ today: teamToday(), ...careDay(dateOf(req.query.date)) });
});

careRouter.get("/player/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !playerExists(id)) return res.status(404).json({ error: "Player not found." });
  res.json(playerCare(id, dateOf(req.query.date)));
});

// ---- Play status ----------------------------------------------------------------

const availabilitySchema = z.object({
  date: isoDate,
  level: z.enum(LEVELS),
  practice_note: text(300),
  bike: text(300),
  jogging: text(300),
  running: text(300),
});

careRouter.put("/availability/:playerId", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  if (!playerExists(playerId)) return res.status(404).json({ error: "Player not found." });
  const a = parsed.data;
  getDb()
    .prepare(
      `INSERT INTO player_availability (player_id, status_date, level, practice_note, bike, jogging, running, set_by, updated_at)
       VALUES (@playerId, @date, @level, @practice_note, @bike, @jogging, @running, @by, datetime('now'))
       ON CONFLICT(player_id, status_date) DO UPDATE SET level = excluded.level, practice_note = excluded.practice_note, bike = excluded.bike,
         jogging = excluded.jogging, running = excluded.running, set_by = excluded.set_by, updated_at = excluded.updated_at`,
    )
    .run({ playerId, ...a, by: who(req) });
  res.json({ ok: true });
});

// ---- Treatments ------------------------------------------------------------------

const time = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time.").nullable().optional();
const treatmentSchema = z.object({ player_id: z.number().int(), date: isoDate, time, instructions: text(1000) });

careRouter.post("/treatments", async (req, res) => {
  const parsed = treatmentSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const t = parsed.data;
  if (!playerExists(t.player_id)) return res.status(404).json({ error: "Player not found." });
  const row = getDb()
    .prepare(
      "INSERT INTO treatments (player_id, treat_date, treat_time, instructions, created_by) VALUES (?, ?, ?, ?, ?) RETURNING *",
    )
    .get(t.player_id, t.date, t.time ?? null, t.instructions, who(req)) as Treatment;
  res.status(201).json(row);
  void notifyTreatment(row, false, teamToday());
});

const treatmentUpdate = z.object({
  date: isoDate.optional(),
  time,
  instructions: text(1000),
  status: z.enum(["booked", "attended", "missed"]).optional(),
});

careRouter.patch("/treatments/:id", (req, res) => {
  const id = Number(req.params.id);
  const parsed = treatmentUpdate.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const db = getDb();
  const before = db.prepare("SELECT * FROM treatments WHERE id = ?").get(id) as Treatment | undefined;
  if (!before) return res.status(404).json({ error: "Booking not found." });
  const u = parsed.data;
  const next = {
    treat_date: u.date ?? before.treat_date,
    treat_time: u.time !== undefined ? u.time : before.treat_time,
    instructions: "instructions" in req.body ? u.instructions : before.instructions,
    status: u.status ?? before.status,
  };
  const row = db
    .prepare(
      `UPDATE treatments SET treat_date = @treat_date, treat_time = @treat_time, instructions = @instructions, status = @status,
         attended_marked_by = CASE WHEN @status <> status THEN @by ELSE attended_marked_by END, updated_at = datetime('now')
       WHERE id = @id RETURNING *`,
    )
    .get({ ...next, by: who(req), id }) as Treatment;
  res.json(row);
  // The player hears about a new time or new instructions, not about attendance.
  if (next.treat_date !== before.treat_date || next.treat_time !== before.treat_time || next.instructions !== before.instructions) {
    void notifyTreatment(row, true, teamToday());
  }
});

careRouter.delete("/treatments/:id", (req, res) => {
  getDb().prepare("DELETE FROM treatments WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Follow-up notes ---------------------------------------------------------------

const noteSchema = z.object({ player_id: z.number().int(), date: isoDate, body: z.string().trim().min(1, "Write a note.").max(2000) });

careRouter.post("/notes", (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const n = parsed.data;
  if (!playerExists(n.player_id)) return res.status(404).json({ error: "Player not found." });
  const row = getDb()
    .prepare("INSERT INTO care_notes (player_id, note_date, author_email, author_role, body) VALUES (?, ?, ?, ?, ?) RETURNING *")
    .get(n.player_id, n.date, who(req), req.user!.role, n.body);
  res.status(201).json(row);
});

careRouter.delete("/notes/:id", (req, res) => {
  // Only the person who wrote a note can take it back.
  getDb().prepare("DELETE FROM care_notes WHERE id = ? AND author_email IS ?").run(Number(req.params.id), who(req));
  res.json({ ok: true });
});

// ---- Issues (injuries, gen med, PPE) and their daily notes ---------------------------

careRouter.get("/issues", (req, res) => {
  const all = req.query.include === "closed";
  const rows = getDb()
    .prepare(
      `SELECT i.*, p.canonical_name AS player_name,
              (SELECT MAX(log_date) FROM rehab_logs l WHERE l.injury_id = i.id) AS last_log_date
       FROM injuries i JOIN players p ON p.id = i.player_id
       ${all ? "" : "WHERE i.closed_at IS NULL"}
       ORDER BY i.closed_at IS NOT NULL, i.injury_date DESC, i.id DESC`,
    )
    .all();
  res.json({ today: teamToday(), issues: rows });
});

const issueSchema = z.object({
  player_id: z.number().int(),
  category: z.enum(CATEGORIES).default("injury"),
  description: z.string().trim().min(1, "Describe the injury or issue.").max(200),
  region: text(60),
  side: z.enum(["left", "right", "both"]).nullable().optional(),
  injury_date: isoDate.nullable().optional(),
  expected_return: isoDate.nullable().optional(),
  stage: z.enum(STAGES).default("rehab"),
});

careRouter.post("/issues", (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const i = parsed.data;
  if (!playerExists(i.player_id)) return res.status(404).json({ error: "Player not found." });
  const db = getDb();
  const row = db
    .prepare(
      `INSERT INTO injuries (player_id, category, description, region, side, injury_date, expected_return, stage, created_by)
       VALUES (@player_id, @category, @description, @region, @side, @injury_date, @expected_return, @stage, @by) RETURNING *`,
    )
    .get({ ...i, side: i.side ?? null, injury_date: i.injury_date ?? null, expected_return: i.expected_return ?? null, by: who(req) }) as { id: number };
  db.prepare("INSERT INTO injury_stage_history (injury_id, stage, stage_date, set_by) VALUES (?, ?, ?, ?)").run(row.id, i.stage, i.injury_date ?? teamToday(), who(req));
  res.status(201).json(row);
});

careRouter.get("/issues/:id", (req, res) => {
  const detail = issueDetail(Number(req.params.id));
  if (!detail) return res.status(404).json({ error: "Not found." });
  res.json({ today: teamToday(), ...detail });
});

const issueUpdate = issueSchema.omit({ player_id: true }).partial().extend({ closed: z.boolean().optional(), stage_date: isoDate.optional() });

careRouter.patch("/issues/:id", (req, res) => {
  const id = Number(req.params.id);
  const parsed = issueUpdate.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const db = getDb();
  const before = db.prepare("SELECT * FROM injuries WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!before) return res.status(404).json({ error: "Not found." });
  const u = parsed.data;
  const fields = ["category", "description", "region", "side", "injury_date", "expected_return", "stage"] as const;
  const next = Object.fromEntries(fields.map((f) => [f, f in req.body ? (u[f] ?? null) : before[f]]));
  const today = teamToday();
  const closedAt = u.closed === undefined ? before.closed_at : u.closed ? today : null;
  db.prepare(
    `UPDATE injuries SET category = @category, description = @description, region = @region, side = @side, injury_date = @injury_date,
       expected_return = @expected_return, stage = @stage, closed_at = @closedAt, updated_at = datetime('now') WHERE id = @id`,
  ).run({ ...next, closedAt, id });
  if (next.stage !== before.stage) {
    db.prepare("INSERT INTO injury_stage_history (injury_id, stage, stage_date, set_by) VALUES (?, ?, ?, ?)").run(id, next.stage, u.stage_date ?? today, who(req));
  }
  res.json({ ok: true });
});

careRouter.delete("/issues/:id", (req, res) => {
  getDb().prepare("DELETE FROM injuries WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

const logSchema = z.object({
  date: isoDate,
  activities: z.string().trim().min(1, "Write what they did.").max(2000),
  minutes: z.number().int().min(0).max(600).nullable().optional(),
  notes: text(2000),
});

careRouter.post("/issues/:id/logs", (req, res) => {
  const id = Number(req.params.id);
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM injuries WHERE id = ?").get(id)) return res.status(404).json({ error: "Not found." });
  const l = parsed.data;
  const row = db
    .prepare("INSERT INTO rehab_logs (injury_id, log_date, activities, minutes, notes, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
    .get(id, l.date, l.activities, l.minutes ?? null, l.notes, who(req));
  res.status(201).json(row);
});

careRouter.delete("/issues/:id/logs/:logId", (req, res) => {
  getDb().prepare("DELETE FROM rehab_logs WHERE id = ? AND injury_id = ?").run(Number(req.params.logId), Number(req.params.id));
  res.json({ ok: true });
});
