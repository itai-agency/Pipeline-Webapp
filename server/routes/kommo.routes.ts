import { Router } from "express";
import { z } from "zod";
import { syncKommoLeads } from "../services/kommo.service.js";
import { refreshAndBroadcast } from "../services/metrics.service.js";

const syncBodySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const kommoRouter = Router();

kommoRouter.post("/sync", async (req, res, next) => {
  try {
    const body = syncBodySchema.parse(req.body ?? {});
    const { processed, skipped } = await syncKommoLeads(body);
    await refreshAndBroadcast({ since: body.since, until: body.until });
    res.json({
      source: "kommo",
      status: "success",
      recordsProcessed: processed,
      recordsSkipped: skipped,
      since: body.since,
      until: body.until,
    });
  } catch (err) {
    next(err);
  }
});
