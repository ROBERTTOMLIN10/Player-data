import { Router } from "express";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { availabilityOn, CATEGORIES, careDay, issueDetail, KINDS, kindLabel, LEVELS, NEEDS_INJURY, notifyTreatment, playerCare, STAGES, type Treatment } from "../lib/care.js";
import { beforeTraining, getCheck, levelLabel, notify, playerName, updateCheck, whenLabel } from "../lib/beforeTraining.js";
import { getAlertPrefs, READINESS_THRESHOLDS, saveAlertPrefs } from "../lib/careAlerts.js";
import { personalUserId } from "../lib/follows.js";
import { vapidPublicKey } from "../lib/push.js";
import { injuryReportWorkbook, reportFilename } from "../lib/careReport.js";
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

// Which check-in alerts reach this staff member's phone.
careRouter.get("/alerts", (req, res) => {
  const userId = personalUserId(req.user!);
  if (userId === null) return res.json({ signedIn: false, prefs: null, thresholds: READINESS_THRESHOLDS, publicKey: vapidPublicKey() });
  res.json({ signedIn: true, prefs: getAlertPrefs(userId), thresholds: READINESS_THRESHOLDS, publicKey: vapidPublicKey() });
});

const alertPrefsSchema = z
  .object({
    severe: z.boolean(),
    moderate: z.boolean(),
    low_readiness: z.boolean(),
    readiness_below: z.number().int().refine((n) => (READINESS_THRESHOLDS as readonly number[]).includes(n)),
  })
  .partial();

careRouter.put("/alerts", (req, res) => {
  const userId = personalUserId(req.user!);
  if (userId === null) return res.status(400).json({ error: "Sign in to choose alerts." });
  const parsed = alertPrefsSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  res.json({ signedIn: true, prefs: saveAlertPrefs(userId, parsed.data), thresholds: READINESS_THRESHOLDS, publicKey: vapidPublicKey() });
});

/** The day's injury report as an Excel file in the athletic trainer's layout. */
careRouter.get("/report.xlsx", (req, res) => {
  const date = dateOf(req.query.date);
  const buf = XLSX.write(injuryReportWorkbook(careDay(date)), { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(date)}"`);
  res.send(buf);
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

// ---- Appointments ------------------------------------------------------------------
// The AT books freely (the player then accepts, declines or asks for another time);
// a player's request or new time comes back here for the AT to confirm.

const time = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time.").nullable().optional();
const treatmentSchema = z.object({
  player_id: z.number().int(),
  date: isoDate,
  time,
  kind: z.enum(KINDS).default("treatment"),
  reason: text(200),
  instructions: text(1000),
  injury_id: z.number().int().nullable().optional(),
});

/** Treatment is about an actual injury: the injury must be the player's own. */
const injuryOk = (playerId: number, injuryId: number | null | undefined) =>
  injuryId == null || Boolean(getDb().prepare("SELECT 1 FROM injuries WHERE id = ? AND player_id = ?").get(injuryId, playerId));

careRouter.post("/treatments", async (req, res) => {
  const parsed = treatmentSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const t = parsed.data;
  if (!playerExists(t.player_id)) return res.status(404).json({ error: "Player not found." });
  if (NEEDS_INJURY.includes(t.kind) && t.injury_id == null) return res.status(400).json({ error: "Pick the injury this is for (log it in Injuries & issues first if it's new)." });
  if (!injuryOk(t.player_id, t.injury_id)) return res.status(400).json({ error: "That injury isn't this player's." });
  const row = getDb()
    .prepare(
      `INSERT INTO treatments (player_id, treat_date, treat_time, kind, reason, instructions, injury_id, status, awaiting, requested_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'player', 'trainer', ?) RETURNING *`,
    )
    .get(t.player_id, t.date, t.time ?? null, t.kind, t.reason, t.instructions, t.injury_id ?? null, who(req)) as Treatment;
  // A pre-training check booked from anywhere puts them on that day's before-training list.
  if (row.kind === "check" && !getCheck(row.player_id, row.treat_date)?.appointment_id) updateCheck(row.player_id, row.treat_date, { appointment_id: row.id });
  res.status(201).json(row);
  void notifyTreatment(row, false, teamToday());
});

const treatmentUpdate = z.object({
  date: isoDate.optional(),
  time,
  kind: z.enum(KINDS).optional(),
  reason: text(200),
  instructions: text(1000),
  injury_id: z.number().int().nullable().optional(),
  status: z.enum(["booked", "attended", "missed", "cancelled"]).optional(),
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
    kind: u.kind ?? before.kind,
    reason: "reason" in req.body ? u.reason : before.reason,
    instructions: "instructions" in req.body ? u.instructions : before.instructions,
    injury_id: u.injury_id !== undefined ? u.injury_id : before.injury_id,
    status: before.status as string,
    awaiting: before.awaiting as string | null,
  };
  if (!injuryOk(before.player_id, next.injury_id)) return res.status(400).json({ error: "That injury isn't this player's." });
  const moved = next.treat_date !== before.treat_date || next.treat_time !== before.treat_time;
  if (u.status) {
    // 'booked' = the AT confirms the player's time; attended / missed / cancelled close it.
    next.status = u.status;
    next.awaiting = null;
  } else if (moved) {
    // A new time from the AT goes back to the player to accept.
    next.status = "pending";
    next.awaiting = "player";
  }
  const row = db
    .prepare(
      `UPDATE treatments SET treat_date = @treat_date, treat_time = @treat_time, kind = @kind, reason = @reason, instructions = @instructions,
         injury_id = @injury_id, status = @status, awaiting = @awaiting,
         attended_marked_by = CASE WHEN @status IN ('attended', 'missed') AND @status <> status THEN @by ELSE attended_marked_by END,
         -- The AT marking them in is the confirmation; missed clears it.
         confirmed_by = CASE WHEN @status = 'attended' THEN COALESCE(confirmed_by, @by) WHEN @status = 'missed' THEN NULL ELSE confirmed_by END,
         confirmed_at = CASE WHEN @status = 'attended' THEN COALESCE(confirmed_at, datetime('now')) WHEN @status = 'missed' THEN NULL ELSE confirmed_at END,
         updated_at = datetime('now')
       WHERE id = @id RETURNING *`,
    )
    .get({ ...next, by: who(req), id }) as Treatment;
  res.json(row);
  // The player hears about a new time or instructions, and when the AT confirms their time.
  const confirmed = u.status === "booked" && before.status === "pending";
  if (moved || confirmed || next.instructions !== before.instructions || next.kind !== before.kind) void notifyTreatment(row, true, teamToday());
});

careRouter.delete("/treatments/:id", (req, res) => {
  getDb().prepare("DELETE FROM treatments WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Confirming what happened -----------------------------------------------------
// A player's "I came in" and their pre-hab entries count once the AT confirms them.

const happenedSchema = z.object({ happened: z.boolean() });

careRouter.post("/treatments/:id/confirm", (req, res) => {
  const parsed = happenedSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const id = Number(req.params.id);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM treatments WHERE id = ?").get(id)) return res.status(404).json({ error: "Booking not found." });
  if (parsed.data.happened) {
    db.prepare("UPDATE treatments SET status = 'attended', awaiting = NULL, confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(who(req), id);
  } else {
    db.prepare("UPDATE treatments SET status = 'missed', awaiting = NULL, confirmed_by = NULL, confirmed_at = NULL, attended_marked_by = ?, updated_at = datetime('now') WHERE id = ?").run(who(req), id);
  }
  res.json({ ok: true });
});

careRouter.post("/prehab/:id/confirm", (req, res) => {
  const parsed = happenedSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const result = getDb()
    .prepare("UPDATE prehab_logs SET status = ?, confirmed_by = ?, confirmed_at = datetime('now') WHERE id = ?")
    .run(parsed.data.happened ? "confirmed" : "rejected", who(req), Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Entry not found." });
  res.json({ ok: true });
});

// What's waiting on the AT: "I came in" taps and pre-hab entries from the last three weeks.
careRouter.get("/to-confirm", (_req, res) => {
  const db = getDb();
  const today = teamToday();
  const visits = db
    .prepare(
      `SELECT t.*, i.description AS injury, p.canonical_name AS player_name FROM treatments t
       JOIN players p ON p.id = t.player_id LEFT JOIN injuries i ON i.id = t.injury_id
       WHERE t.status = 'attended' AND t.confirmed_at IS NULL AND t.treat_date >= date(?, '-21 days')
       ORDER BY t.treat_date DESC, t.treat_time DESC`,
    )
    .all(today);
  const prehab = db
    .prepare(
      `SELECT l.*, i.description AS injury, p.canonical_name AS player_name FROM prehab_logs l
       JOIN players p ON p.id = l.player_id LEFT JOIN injuries i ON i.id = l.injury_id
       WHERE l.status = 'pending' AND l.log_date >= date(?, '-21 days') ORDER BY l.log_date DESC, l.id DESC`,
    )
    .all(today);
  res.json({ today, visits, prehab });
});

// ---- Messages with the player ----------------------------------------------------------

const messageSchema = z.object({ player_id: z.number().int(), date: isoDate, body: z.string().trim().min(1, "Write a message.").max(1000) });

careRouter.post("/messages", (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const m = parsed.data;
  if (!playerExists(m.player_id)) return res.status(404).json({ error: "Player not found." });
  const role = req.user!.role === "trainer" ? "trainer" : "coach";
  const row = getDb()
    .prepare("INSERT INTO care_messages (player_id, msg_date, author_role, author_email, body) VALUES (?, ?, ?, ?, ?) RETURNING *")
    .get(m.player_id, m.date, role, who(req), m.body);
  res.status(201).json(row);
  void notify.player(m.player_id, role === "trainer" ? "Athletic trainer" : "Coach", m.body, `care-msg-${m.player_id}`);
});

// ---- Before training -------------------------------------------------------------------

careRouter.get("/before-training", (req, res) => {
  res.json({ today: teamToday(), ...beforeTraining(dateOf(req.query.date)) });
});

const dateBody = z.object({ date: isoDate });
const trainerOnly = (req: { user?: { role: string } }, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
  if (req.user?.role === "trainer") return true;
  res.status(403).json({ error: "Only the athletic trainer can do that." });
  return false;
};

// The AT puts someone on the list by hand (e.g. after a hallway conversation), or takes them off.
careRouter.post("/checks/:playerId/flag", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = dateBody.extend({ note: text(300), flagged: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  if (!playerExists(playerId)) return res.status(404).json({ error: "Player not found." });
  const { date, note, flagged } = parsed.data;
  res.json(updateCheck(playerId, date, flagged ? { flagged: 1, flag_note: note, flagged_by: who(req) } : { flagged: 0, flag_note: null }));
});

// "Come in at 7:30 to get checked": books the appointment (the player accepts or asks for another time) with what to do first.
const callInSchema = dateBody.extend({
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
  kind: z.enum(KINDS).default("check"),
  reason: text(200),
  instructions: text(1000),
  message: text(1000),
});

careRouter.post("/checks/:playerId/call-in", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = callInSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  if (!playerExists(playerId)) return res.status(404).json({ error: "Player not found." });
  const c = parsed.data;
  const db = getDb();
  const existing = getCheck(playerId, c.date);
  const prior = existing?.appointment_id ? (db.prepare("SELECT * FROM treatments WHERE id = ?").get(existing.appointment_id) as Treatment | undefined) : undefined;
  let appt: Treatment;
  if (prior && prior.status !== "cancelled") {
    appt = db
      .prepare(
        `UPDATE treatments SET treat_time = ?, kind = ?, reason = ?, instructions = ?, status = 'pending', awaiting = 'player', updated_at = datetime('now')
         WHERE id = ? RETURNING *`,
      )
      .get(c.time, c.kind, c.reason, c.instructions, prior.id) as Treatment;
  } else {
    appt = db
      .prepare(
        `INSERT INTO treatments (player_id, treat_date, treat_time, kind, reason, instructions, status, awaiting, requested_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'player', 'trainer', ?) RETURNING *`,
      )
      .get(playerId, c.date, c.time, c.kind, c.reason, c.instructions, who(req)) as Treatment;
  }
  updateCheck(playerId, c.date, { appointment_id: appt.id, cleared_at: null, cleared_by: null });
  if (c.message) {
    db.prepare("INSERT INTO care_messages (player_id, msg_date, author_role, author_email, body) VALUES (?, ?, ?, ?, ?)").run(
      playerId,
      c.date,
      req.user!.role === "trainer" ? "trainer" : "coach",
      who(req),
      c.message,
    );
  }
  res.json({ ok: true, appointment: appt });
  void notify.player(
    playerId,
    `See the athletic trainer ${whenLabel(appt, teamToday())}`,
    [kindLabel(appt.kind) + (appt.reason ? ` · ${appt.reason}` : ""), appt.instructions, c.message].filter(Boolean).join("\n"),
    `treatment-${appt.id}`,
  );
});

// The AT is happy for them to train as normal: nothing for the coach to decide.
careRouter.post("/checks/:playerId/clear", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = dateBody.extend({ cleared: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const { date, cleared } = parsed.data;
  res.json(updateCheck(playerId, date, cleared ? { cleared_at: new Date().toISOString(), cleared_by: who(req) } : { cleared_at: null, cleared_by: null }));
});

// After seeing them: the AT's recommendation for today, for the coach to agree or change.
const levelSchema = dateBody.extend({ level: z.enum(LEVELS), note: text(500) });

careRouter.post("/checks/:playerId/recommend", (req, res) => {
  if (!trainerOnly(req, res)) return;
  const playerId = Number(req.params.playerId);
  const parsed = levelSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const { date, level, note } = parsed.data;
  const check = updateCheck(playerId, date, {
    recommendation: level,
    rec_note: note,
    recommended_by: who(req),
    recommended_at: new Date().toISOString(),
    cleared_at: null,
    cleared_by: null,
    decision: null,
    decision_note: null,
    decided_by: null,
    decided_at: null,
    kept_same: 0,
  });
  // Seen: the call-in counts as attended.
  if (check.appointment_id) {
    getDb().prepare("UPDATE treatments SET status = 'attended', awaiting = NULL, attended_marked_by = COALESCE(attended_marked_by, @by), confirmed_by = COALESCE(confirmed_by, @by), confirmed_at = COALESCE(confirmed_at, datetime('now')), updated_at = datetime('now') WHERE id = @id AND status IN ('pending', 'booked', 'attended')").run({ by: who(req), id: check.appointment_id });
  }
  res.json(check);
  void notify.coaches(`${playerName(playerId)}: AT recommends ${levelLabel(level)}`, `${note ? `${note}\n` : ""}Tap to agree or change it.`, `check-${playerId}-${date}`);
});

// The coach's final call (with the AT's recommendation in front of them). It becomes the day's play status.
careRouter.post("/checks/:playerId/decide", (req, res) => {
  if (req.user?.role !== "coach") return res.status(403).json({ error: "The coach makes the final call." });
  const playerId = Number(req.params.playerId);
  const parsed = levelSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  const { date, level, note } = parsed.data;
  const db = getDb();
  const check = updateCheck(playerId, date, { decision: level, decision_note: note, decided_by: who(req), decided_at: new Date().toISOString(), kept_same: 0 });
  const current = availabilityOn(date).get(playerId);
  const practiceNote = note ?? check.rec_note ?? (current?.level === level ? current.practice_note : null);
  db.prepare(
    `INSERT INTO player_availability (player_id, status_date, level, practice_note, bike, jogging, running, set_by, updated_at)
     VALUES (@playerId, @date, @level, @practiceNote, @bike, @jogging, @running, @by, datetime('now'))
     ON CONFLICT(player_id, status_date) DO UPDATE SET level = excluded.level, practice_note = excluded.practice_note, set_by = excluded.set_by, updated_at = excluded.updated_at`,
  ).run({ playerId, date, level, practiceNote, bike: current?.bike ?? null, jogging: current?.jogging ?? null, running: current?.running ?? null, by: who(req) });
  res.json(check);
  const agreed = check.recommendation === level;
  void notify.trainers(playerId, `${playerName(playerId)}: ${levelLabel(level)} today`, agreed ? "Coach agreed with your recommendation." : `Coach changed it from ${check.recommendation ? levelLabel(check.recommendation) : "—"}.${note ? ` ${note}` : ""}`, `check-${playerId}-${date}`);
});

// A known injury with nothing new: settled at the same play status as before (the AT or a coach).
careRouter.post("/checks/:playerId/same", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = dateBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  if (!playerExists(playerId)) return res.status(404).json({ error: "Player not found." });
  const { date } = parsed.data;
  const current = availabilityOn(date).get(playerId);
  const level = current?.level ?? "full";
  getDb()
    .prepare(
      `INSERT INTO player_availability (player_id, status_date, level, practice_note, bike, jogging, running, set_by, updated_at)
       VALUES (@playerId, @date, @level, @practice_note, @bike, @jogging, @running, @by, datetime('now'))
       ON CONFLICT(player_id, status_date) DO UPDATE SET set_by = excluded.set_by, updated_at = excluded.updated_at`,
    )
    .run({ playerId, date, level, practice_note: current?.practice_note ?? null, bike: current?.bike ?? null, jogging: current?.jogging ?? null, running: current?.running ?? null, by: who(req) });
  res.json(
    updateCheck(playerId, date, {
      decision: level,
      decision_note: null,
      decided_by: who(req),
      decided_at: new Date().toISOString(),
      kept_same: 1,
      cleared_at: null,
      cleared_by: null,
    }),
  );
});

// Undo the decision (back to awaiting the coach) or start over.
careRouter.post("/checks/:playerId/reopen", (req, res) => {
  const playerId = Number(req.params.playerId);
  const parsed = dateBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  res.json(updateCheck(playerId, parsed.data.date, { decision: null, decision_note: null, decided_by: null, decided_at: null, kept_same: 0 }));
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
