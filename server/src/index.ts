import cors from "cors";
import express from "express";
import { gamesRouter } from "./routes/games.js";
import { playersRouter } from "./routes/players.js";
import { teamRouter } from "./routes/team.js";
import { compareRouter } from "./routes/compare.js";
import { metricsRouter } from "./routes/metrics.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.use("/api/games", gamesRouter);
app.use("/api/players", playersRouter);
app.use("/api/team", teamRouter);
app.use("/api/compare", compareRouter);
app.use("/api/metrics", metricsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
