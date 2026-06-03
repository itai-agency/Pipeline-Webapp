import { Router } from "express";
import { z } from "zod";
import { syncMetaSpend } from "../services/meta.service.js";
import { refreshAndBroadcast } from "../services/metrics.service.js";

const syncBodySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const metaRouter = Router();

metaRouter.post("/sync", async (req, res, next) => {
  try {
    const body = syncBodySchema.parse(req.body ?? {});
    const result = await syncMetaSpend(body);
    await refreshAndBroadcast({ since: body.since, until: body.until });
    res.json({
      source: "meta",
      status: "success",
      recordsProcessed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    next(err);
  }
});
