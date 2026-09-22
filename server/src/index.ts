import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { migrate } from "./db/migrate.js";
import { attachUser, requireCoach, requirePlayer } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { readinessRouter } from "./routes/readiness.js";
import { accountsRouter } from "./routes/accounts.js";
import { gamesRouter } from "./routes/games.js";
import { playersRouter } from "./routes/players.js";
import { teamRouter } from "./routes/team.js";
import { scheduleRouter } from "./routes/schedule.js";
import { compareRouter } from "./routes/compare.js";
import { metricsRouter } from "./routes/metrics.js";
import { adminRouter } from "./routes/admin.js";
import { startAutoSync } from "./jobs/autoSync.js";
import { startMorningReminder } from "./jobs/morningReminder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the schema exists on a fresh persistent volume before serving requests.
migrate();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Render terminates TLS at its proxy; trusting it makes req.secure/req.ip accurate
// (secure session cookies, per-IP login throttling).
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use("/api", attachUser);

// Sign in/out works while signed out; every other endpoint needs a role.
app.use("/api/auth", authRouter);
app.use("/api/metrics", metricsRouter); // metric labels/units only, needed by both views

// Player accounts: only their own data (player id comes from the session).
app.use("/api/me", requirePlayer, meRouter);

// Coaches: the full dashboard.
app.use("/api/games", requireCoach, gamesRouter);
app.use("/api/players", requireCoach, playersRouter);
app.use("/api/team", requireCoach, teamRouter);
app.use("/api/schedule", requireCoach, scheduleRouter);
app.use("/api/compare", requireCoach, compareRouter);
app.use("/api/readiness", requireCoach, readinessRouter);
app.use("/api/admin/accounts", requireCoach, accountsRouter);
app.use("/api/admin", requireCoach, adminRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// In production, this server also hosts the built frontend as a single
// deployable service (no separate static host needed).
const webDist = path.join(__dirname, "..", "..", "web", "dist");
app.use(
  express.static(webDist, {
    // The service worker and manifest must never be cached, or installed
    // home-screen apps would keep running an old version.
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("sw.js") || filePath.endsWith(".webmanifest")) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found. Run `npm run build --workspace=web` to generate the frontend.");
  });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  startAutoSync();
  startMorningReminder();
});
