import { Router } from "express";
import { z } from "zod";
import { currentMonthRange } from "../lib/dateRanges.js";
import { syncKommoLeads, syncKommoSnapshotMetrics } from "../services/kommo.service.js";
import { refreshAndBroadcast } from "../services/metrics.service.js";

const syncBodySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const snapshotBodySchema = z.object({
  snapshotDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  monthStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  monthEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

/** Censo Kommo (todos los clientes del mapa) — alineado al HTML de control. */
kommoRouter.post("/snapshot", async (req, res, next) => {
  try {
    const body = snapshotBodySchema.parse(req.body ?? {});
    const month = currentMonthRange();
    const snapshotDate = body.snapshotDate ?? month.until;
    const monthStart = body.monthStart ?? month.since;
    const monthEnd = body.monthEnd ?? month.until;

    const { processed, snapshots } = await syncKommoSnapshotMetrics({
      snapshotDate,
      monthStart,
      monthEnd,
    });
    await refreshAndBroadcast({ since: monthStart, until: monthEnd }, { kommoMode: "meta_only" });

    res.json({
      source: "kommo",
      status: "success",
      mode: "pipeline_snapshot",
      snapshotDate,
      monthStart,
      monthEnd,
      clientsProcessed: processed,
      clients: snapshots.map((s) => ({
        client: s.client,
        leads: s.leads,
        mql: s.reachedMql,
        sql: s.reachedSql,
        citas: s.reachedCita,
        firmas: s.reachedFirmas,
        rechazados: s.byTier.rejected,
      })),
    });
  } catch (err) {
    next(err);
  }
});
