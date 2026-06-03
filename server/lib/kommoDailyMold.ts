/**
 * Moldeado diario al estilo RESPALDO_DIARIO (Excel manual):
 * - CONVERSACIONES: fuente operativa = Meta Insights (leads). Respaldo válido = created_at Kommo
 *   (captación Meta → lead en Kommo). mergeMetaSpendIntoDaily aplica Meta cuando existe columna leads.
 * - MQL/SQL/CITAS/FIRMAS: transiciones reales Kommo (value_before -> value_after)
 *   que ENTRAN a la etapa correspondiente (una por evento).
 */
import { z } from "zod";
import { classifyKommoStageTier, type KommoStageTier } from "../config/kommoStageMap.js";

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

function resolveBeforeAfterTiers(
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

  const bump = (date: string, client: string, field: keyof DailyMoldCounts): void => {
    const key = `${date}::${client}` as DailyMoldKey;
    const row = grouped.get(key) ?? { date, client, ...emptyCounts() };
    row[field] += 1;
    grouped.set(key, row);
  };

  for (const { client, createdDate } of leadCohort.values()) {
    if (monthStart && createdDate < monthStart) continue;
    if (monthEnd && createdDate > monthEnd) continue;
    bump(createdDate, client, "conversaciones");
  }

  for (const ev of events) {
    if (monthStart && ev.event_date < monthStart) continue;
    if (monthEnd && ev.event_date > monthEnd) continue;
    if (monthStart && ev.lead_created_date && ev.lead_created_date < monthStart) continue;
    if (monthEnd && ev.lead_created_date && ev.lead_created_date > monthEnd) continue;

    const pipelineId = pipelineIdByClient.get(ev.client) ?? ev.pipeline_id ?? 0;
    const tiers = resolveBeforeAfterTiers(ev, statusNameByKey, pipelineId);
    if (!tiers || tiers.before === tiers.after) continue;

    if (tiers.after === "mql") bump(ev.event_date, ev.client, "mql");
    if (tiers.after === "sql") bump(ev.event_date, ev.client, "sql");
    if (tiers.after === "cita") bump(ev.event_date, ev.client, "citas");
    if (tiers.after === "firmado") bump(ev.event_date, ev.client, "firmas");
  }

  return grouped;
}
