import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { DATA_DIR, importTitanFile } from "../import/importTitan.js";
import { syncMinutes } from "../import/importMinutes.js";
import { syncSchedule } from "../import/syncSchedule.js";

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
