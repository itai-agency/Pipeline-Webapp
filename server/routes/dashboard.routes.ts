import { Router } from "express";
import { getDashboardSnapshot, refreshAndBroadcast } from "../services/metrics.service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/snapshot", async (_req, res, next) => {
  try {
    const snapshot = await getDashboardSnapshot();
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

dashboardRouter.post("/refresh", async (_req, res, next) => {
  try {
    const snapshot = await refreshAndBroadcast();
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});
