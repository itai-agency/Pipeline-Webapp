import { Router } from "express";
import { requireAuthMiddleware } from "../middleware/requireAuth.js";
import { syncAuthMiddleware } from "../middleware/syncAuth.js";
import { dashboardRouter } from "./dashboard.routes.js";
import { kommoRouter } from "./kommo.routes.js";
import { metaRouter } from "./meta.routes.js";
import { realtimeRouter } from "./realtime.routes.js";

export const apiRouter = Router();

apiRouter.use("/dashboard", requireAuthMiddleware, dashboardRouter);
apiRouter.use("/realtime", requireAuthMiddleware, realtimeRouter);
apiRouter.use("/meta", syncAuthMiddleware, metaRouter);
apiRouter.use("/kommo", syncAuthMiddleware, kommoRouter);

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});
