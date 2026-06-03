/**
 * Moldeado diario al estilo RESPALDO_DIARIO (Excel manual):
 * - CONVERSACIONES: leads creados ese día (cohorte por lead_created_date / created_at Kommo).
 * - MQL/SQL/CITAS/FIRMAS: etapa final al cierre del día de creación (snapshot cohorte),
 *   alineado al tablero Kommo «creados en fecha X». Fechas en UTC.
 */
import { z } from "zod";
import {
  accumulateSnapshotTier,
  classifyKommoStageTier,
  metricsFromClientSnapshot,
  newClientSnapshot,
  type KommoStageTier,
} from "../config/kommoStageMap.js";

const leadStatusChangeSchema = z.object({
  lead_status: z.object({
    id: z.coerce.number(),
    pipeline_id: z.coerce.number(),
  }),
});

export type TimelineEventRow = {
  kommo_lead_id: number;
  event_date: string;
  client: string;
  pipeline_id: number | null;
  status_id: number | null;
  stage_name: string | null;
  lead_created_date: string | null;
  raw_payload: unknown;
};

export type DailyMoldCounts = {
  conversaciones: number;
  mql: number;
  sql: number;
  citas: number;
  firmas: number;
};

export type DailyMoldKey = `${string}::${string}`;

function parseStatusFromPayload(
  arr: Array<Record<string, unknown>> | undefined,
): { statusId: number; pipelineId: number } | null {
  if (!arr?.length) return null;
  const parsed = leadStatusChangeSchema.safeParse(arr[0]);
  if (!parsed.success) return null;
  return { statusId: parsed.data.lead_status.id, pipelineId: parsed.data.lead_status.pipeline_id };
}

function tierFromStatusId(
  statusId: number,
  pipelineId: number,
  statusNameByKey: Map<string, string>,
): KommoStageTier {
  const name =
    statusNameByKey.get(`${pipelineId}:${statusId}`) ?? statusNameByKey.get(String(statusId)) ?? "";
  return classifyKommoStageTier(name);
}

function eventUnixTs(row: TimelineEventRow): number {
  const payload = row.raw_payload as { created_at?: number } | null;
  return payload?.created_at ?? 0;
}

export function resolveBeforeAfterTiers(
  row: TimelineEventRow,
  statusNameByKey: Map<string, string>,
  defaultPipelineId: number,
): { before: KommoStageTier; after: KommoStageTier } | null {
  const payload = row.raw_payload as {
    value_after?: Array<Record<string, unknown>>;
    value_before?: Array<Record<string, unknown>>;
  } | null;

  const afterParsed = parseStatusFromPayload(payload?.value_after);
  const beforeParsed = parseStatusFromPayload(payload?.value_before);

  const pipelineId = afterParsed?.pipelineId ?? row.pipeline_id ?? defaultPipelineId;
  const afterId = afterParsed?.statusId ?? row.status_id;
  if (afterId == null) return null;

  const after = tierFromStatusId(afterId, pipelineId, statusNameByKey);
  const before = beforeParsed
    ? tierFromStatusId(beforeParsed.statusId, beforeParsed.pipelineId, statusNameByKey)
    : row.stage_name
      ? classifyKommoStageTier(row.stage_name)
      : after;

  return { before, after };
}

/** Etapa final del lead en su día de creación (última transición cronológica; sin eventos = entrada). */
export function finalCohortTierOnCreationDay(
  dayEvents: TimelineEventRow[],
  statusNameByKey: Map<string, string>,
  defaultPipelineId: number,
): KommoStageTier {
  if (dayEvents.length === 0) return "entrada";

  const sorted = [...dayEvents].sort((a, b) => eventUnixTs(a) - eventUnixTs(b));
  let tier: KommoStageTier = "entrada";
  for (const ev of sorted) {
    const tiers = resolveBeforeAfterTiers(ev, statusNameByKey, defaultPipelineId);
    if (tiers) tier = tiers.after;
  }
  return tier;
}

function emptyCounts(): DailyMoldCounts {
  return { conversaciones: 0, mql: 0, sql: 0, citas: 0, firmas: 0 };
}

export type LeadCohortMeta = { client: string; createdDate: string };

/**
 * Agrupa metricas diarias por client+fecha desde historial timeline.
 * @param leadCohort - un registro por lead (created_at + cliente)
 */
export function moldDailyMetricsFromTimeline(
  events: TimelineEventRow[],
  leadCohort: Map<number, LeadCohortMeta>,
  statusNameByKey: Map<string, string>,
  pipelineIdByClient: Map<string, number>,
  options?: { monthStart?: string; monthEnd?: string },
): Map<DailyMoldKey, DailyMoldCounts & { date: string; client: string }> {
  const grouped = new Map<DailyMoldKey, DailyMoldCounts & { date: string; client: string }>();
  const monthStart = options?.monthStart;
  const monthEnd = options?.monthEnd;

  const eventsOnCreationDay = new Map<string, TimelineEventRow[]>();
  for (const ev of events) {
    if (!ev.lead_created_date || ev.event_date !== ev.lead_created_date) continue;
    if (monthStart && ev.lead_created_date < monthStart) continue;
    if (monthEnd && ev.lead_created_date > monthEnd) continue;
    const bucketKey = `${ev.kommo_lead_id}::${ev.lead_created_date}`;
    const list = eventsOnCreationDay.get(bucketKey) ?? [];
    list.push(ev);
    eventsOnCreationDay.set(bucketKey, list);
  }

  const snapshotByKey = new Map<DailyMoldKey, ReturnType<typeof newClientSnapshot>>();

  for (const [leadId, meta] of leadCohort) {
    const { client, createdDate } = meta;
    if (monthStart && createdDate < monthStart) continue;
    if (monthEnd && createdDate > monthEnd) continue;

    const key = `${createdDate}::${client}` as DailyMoldKey;
    const pipelineId = pipelineIdByClient.get(client) ?? 0;
    const dayEvents = eventsOnCreationDay.get(`${leadId}::${createdDate}`) ?? [];
    const tier = finalCohortTierOnCreationDay(dayEvents, statusNameByKey, pipelineId);

    const snap = snapshotByKey.get(key) ?? newClientSnapshot(client);
    snapshotByKey.set(key, accumulateSnapshotTier(snap, tier));
  }

  for (const [key, snap] of snapshotByKey) {
    const [date, client] = key.split("::");
    const metrics = metricsFromClientSnapshot(snap);
    grouped.set(key, {
      date,
      client,
      conversaciones: metrics.conversaciones,
      mql: metrics.mql,
      sql: metrics.sql,
      citas: metrics.citas,
      firmas: metrics.firmas,
    });
  }

  // #region agent log
  const hog = grouped.get("2026-06-02::HOGARES" as DailyMoldKey);
  if (hog) {
    fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
      body: JSON.stringify({
        sessionId: "a0037c",
        runId: "cohort-snapshot-mold",
        hypothesisId: "H-funnel-snapshot",
        location: "kommoDailyMold.ts:moldDailyMetricsFromTimeline",
        message: "HOGARES 2026-06-02 cohort snapshot",
        data: hog,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  return grouped;
}
