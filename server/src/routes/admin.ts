import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { DATA_DIR, importTitanFile } from "../import/importTitan.js";
import { syncMinutes } from "../import/importMinutes.js";
import { syncSchedule } from "../import/syncSchedule.js";
import { getAutoSyncStatus } from "../jobs/autoSync.js";
import { getReminderSettings, sendFollowup, updateReminderSettings } from "../jobs/morningReminder.js";
import { getDb } from "../db/connection.js";
import { teamToday } from "../lib/readiness.js";
import { z } from "zod";

export const adminRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      cb(new Error("Only .xlsx files are accepted"));
      return;
    }
    cb(null, true);
  },
});

adminRouter.post("/upload-titan", (req, res) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ status: "error", message });
    }
    handleUpload(req, res);
  });
});

function handleUpload(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ status: "error", message: "No file uploaded (expected field name 'file')" });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const destPath = path.join(DATA_DIR, req.file.originalname);

  if (fs.existsSync(destPath)) {
    return res.status(409).json({
      status: "error",
      message: `A file named "${req.file.originalname}" was already uploaded. Rename it (e.g. include the date) if this is a different game.`,
    });
  }

  try {
    fs.writeFileSync(destPath, req.file.buffer);
    const result = importTitanFile(destPath);
    if (result.status === "error") {
      // Clean up the file we just wrote so a bad upload doesn't linger and block a retry.
      fs.rmSync(destPath, { force: true });
    }
    const httpStatus = result.status === "error" ? 422 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    fs.rmSync(destPath, { force: true });
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
}

adminRouter.post("/sync-minutes", async (_req, res) => {
  try {
    const summary = await syncMinutes();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
});

adminRouter.post("/sync-schedule", async (_req, res) => {
  try {
    const summary = await syncSchedule();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
});

adminRouter.get("/sync-status", (_req, res) => {
  res.json(getAutoSyncStatus());
});

// --- Morning check-in reminder -------------------------------------------------

adminRouter.get("/reminders", (_req, res) => {
  const { n } = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN push_subscriptions ps ON ps.user_id = u.id WHERE u.role = 'player'`,
    )
    .get() as { n: number };
  res.json({ ...getReminderSettings(), playersWithNotifications: n, timezone: process.env.TEAM_TIMEZONE || "America/New_York" });
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM");
const reminderSchema = z.object({
  enabled: z.boolean().optional(),
  time: hhmm.optional(),
  followupEnabled: z.boolean().optional(),
  followupTime: hhmm.optional(),
});

adminRouter.put("/reminders", (req, res) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." });
  const current = getReminderSettings();
  const time = parsed.data.time ?? current.time;
  const followupTime = parsed.data.followupTime ?? current.followupTime;
  // "HH:MM" strings compare correctly as text.
  if (followupTime <= time) return res.status(400).json({ error: "The follow-up has to be later than the first reminder." });
  updateReminderSettings(parsed.data);
  res.json(getReminderSettings());
});

// Nudges players who haven't checked in today, right now.
adminRouter.post("/reminders/send-now", async (_req, res) => {
  try {
    res.json(await sendFollowup(teamToday()));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
