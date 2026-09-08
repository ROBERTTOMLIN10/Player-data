import { Router } from "express";
import { CORE_METRICS } from "../lib/metrics.js";

export const metricsRouter = Router();

metricsRouter.get("/", (_req, res) => {
  res.json(CORE_METRICS);
});
