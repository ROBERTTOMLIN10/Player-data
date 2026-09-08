import { Router } from "express";
import { getDb } from "../db/connection.js";
import { CORE_METRICS, CORE_METRIC_KEYS } from "../lib/metrics.js";

export const teamRouter = Router();

teamRouter.get("/summary", (_req, res) => {
  const db = getDb();

  const avgSelects = CORE_METRIC_KEYS.map((k) => `AVG(${k}) AS avg_${k}`).join(", ");
  const seasonAverages = db.prepare(`SELECT ${avgSelects} FROM gps_sessions`).get() as Record<string, number>;

  const trend = db
    .prepare(
      `SELECT g.id AS game_id, g.game_date, g.opponent, ${CORE_METRIC_KEYS.map((k) => `AVG(s.${k}) AS avg_${k}`).join(", ")}
       FROM games g
       JOIN gps_sessions s ON s.game_id = g.id
       GROUP BY g.id
       ORDER BY g.game_date ASC`,
    )
    .all();

  const highs = CORE_METRICS.map((metric) => {
    const row = db
      .prepare(
        `SELECT s.${metric.key} AS value, p.canonical_name AS player_name, g.opponent, g.game_date, g.id AS game_id
         FROM gps_sessions s
         JOIN players p ON p.id = s.player_id
         JOIN games g ON g.id = s.game_id
         WHERE s.${metric.key} IS NOT NULL
         ORDER BY s.${metric.key} DESC
         LIMIT 1`,
      )
      .get();
    return { metric: metric.key, label: metric.label, unit: metric.unit, best: row };
  });

  res.json({ seasonAverages, trend, highs });
});
