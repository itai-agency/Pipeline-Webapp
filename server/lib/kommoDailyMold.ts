/**
 * Moldeado diario al estilo RESPALDO_DIARIO (Excel manual):
 * - CONVERSACIONES: leads creados ese día (cohorte por lead_created_date / created_at Kommo).
 * - MQL/SQL/CITAS/FIRMAS: etapa actual del lead en timeline (cohorte por fecha de creación).
 */
import { z } from "zod";
import { addAccountDaysIso, toAccountDateIso } from "./dateRanges.js";
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

/** Fecha del evento en zona cuenta (prioriza timestamp Kommo sobre event_date almacenado). */
export function eventAccountDate(row: TimelineEventRow): string {
  const ts = eventUnixTs(row);
  if (ts > 0) return toAccountDateIso(new Date(ts * 1000));
  return row.event_date;
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

/**
 * Fecha del evento más reciente que estableció el tier "firmado" para este lead.
 * Usado para atribuir la firma al mes en que realmente ocurrió, no al de creación.
 */
function firmaEventDate(
  leadEvents: TimelineEventRow[],
  statusNameByKey: Map<string, string>,
  defaultPipelineId: number,
): string | null {
  const sorted = [...leadEvents].sort((a, b) => eventUnixTs(a) - eventUnixTs(b));
  let lastFirmaDate: string | null = null;
  for (const ev of sorted) {
    const tiers = resolveBeforeAfterTiers(ev, statusNameByKey, defaultPipelineId);
    if (tiers?.after === "firmado") {
      lastFirmaDate = eventAccountDate(ev);
    }
  }
  return lastFirmaDate;
}

/** Etapa más reciente del lead según timeline (alineado al tablero Kommo «creados en fecha X»). */
export function latestLeadTierFromTimeline(
  leadEvents: TimelineEventRow[],
  statusNameByKey: Map<string, string>,
  defaultPipelineId: number,
): KommoStageTier {
  if (leadEvents.length === 0) return "entrada";

  const sorted = [...leadEvents].sort((a, b) => eventUnixTs(a) - eventUnixTs(b));
  let tier: KommoStageTier = "entrada";
  for (const ev of sorted) {
    const tiers = resolveBeforeAfterTiers(ev, statusNameByKey, defaultPipelineId);
    if (tiers) tier = tiers.after;
  }
  return tier;
}

/** @deprecated Usar latestLeadTierFromTimeline */
export function finalCohortTierOnCreationDay(
  dayEvents: TimelineEventRow[],
  statusNameByKey: Map<string, string>,
  defaultPipelineId: number,
): KommoStageTier {
  return latestLeadTierFromTimeline(dayEvents, statusNameByKey, defaultPipelineId);
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

  const eventsByLead = new Map<number, TimelineEventRow[]>();
  for (const ev of events) {
    const list = eventsByLead.get(ev.kommo_lead_id) ?? [];
    list.push(ev);
    eventsByLead.set(ev.kommo_lead_id, list);
  }

  const snapshotByKey = new Map<DailyMoldKey, ReturnType<typeof newClientSnapshot>>();
  // Firmas atribuidas a la fecha del evento firma, no a la cohorte de creación
  const firmasByKey = new Map<string, { date: string; client: string; firmas: number }>();

  for (const [leadId, meta] of leadCohort) {
    const { client, createdDate } = meta;
    const pipelineId = pipelineIdByClient.get(client) ?? 0;
    const leadEvents = eventsByLead.get(leadId) ?? [];
    const tier = latestLeadTierFromTimeline(leadEvents, statusNameByKey, pipelineId);

    // Conv/MQL/SQL/Citas: cohorte por fecha de creación (filtro de rango aplica)
    const inCohortRange =
      (!monthStart || createdDate >= monthStart) && (!monthEnd || createdDate <= monthEnd);
    if (inCohortRange) {
      const key = `${createdDate}::${client}` as DailyMoldKey;
      const snap = snapshotByKey.get(key) ?? newClientSnapshot(client);
      snapshotByKey.set(key, accumulateSnapshotTier(snap, tier));
    }

    // Firmas: sin filtro de cohorte — se atribuyen al mes en que ocurrió la firma
    if (tier === "firmado") {
      const fDate = firmaEventDate(leadEvents, statusNameByKey, pipelineId) ?? createdDate;
      const firmaKey = `${fDate}::${client}`;
      const prev = firmasByKey.get(firmaKey);
      firmasByKey.set(firmaKey, { date: fDate, client, firmas: (prev?.firmas ?? 0) + 1 });
    }
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
      firmas: 0, // Las firmas se superponen abajo desde firmasByKey
    });
  }

  // Superponer firmas en su fecha real de evento
  for (const [firmaKey, firmaData] of firmasByKey) {
    const dKey = firmaKey as DailyMoldKey;
    const existing = grouped.get(dKey);
    if (existing) {
      existing.firmas += firmaData.firmas;
    } else {
      grouped.set(dKey, {
        date: firmaData.date,
        client: firmaData.client,
        conversaciones: 0,
        mql: 0,
        sql: 0,
        citas: 0,
        firmas: firmaData.firmas,
      });
    }
  }

  // #region agent log
  const hog = grouped.get("2026-06-02::HOGARES" as DailyMoldKey);
  const elijo = grouped.get("2026-06-02::GRUPO ELIJO" as DailyMoldKey);
  if (hog || elijo) {
    fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
      body: JSON.stringify({
        sessionId: "a0037c",
        runId: "cohort-snapshot-mold",
        hypothesisId: "H-funnel-snapshot",
        location: "kommoDailyMold.ts:moldDailyMetricsFromTimeline",
        message: "cohort snapshot sample",
        data: { HOGARES: hog ?? null, GRUPO_ELIJO: elijo ?? null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  return grouped;
}

