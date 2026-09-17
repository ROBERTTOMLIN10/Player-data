import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { migrate } from "./db/migrate.js";
import { basicAuth } from "./middleware/auth.js";
import { gamesRouter } from "./routes/games.js";
import { playersRouter } from "./routes/players.js";
import { teamRouter } from "./routes/team.js";
import { scheduleRouter } from "./routes/schedule.js";
import { compareRouter } from "./routes/compare.js";
import { metricsRouter } from "./routes/metrics.js";
import { adminRouter } from "./routes/admin.js";
import { startAutoSync } from "./jobs/autoSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the schema exists on a fresh persistent volume before serving requests.
migrate();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(cors());
app.use(basicAuth);
app.use(express.json());

app.use("/api/games", gamesRouter);
app.use("/api/players", playersRouter);
app.use("/api/team", teamRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/compare", compareRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/admin", adminRouter);

// In production, this server also hosts the built frontend as a single
// deployable service (no separate static host needed).
const webDist = path.join(__dirname, "..", "..", "web", "dist");
app.use(express.static(webDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found. Run `npm run build --workspace=web` to generate the frontend.");
  });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  startAutoSync();
});
