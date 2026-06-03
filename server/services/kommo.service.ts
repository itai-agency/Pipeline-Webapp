import { z } from "zod";
import { env, getAllowedDashboardClients, getKommoClientMap, isKommoConfigured } from "../config/env.js";
import {
  getKommoControlMetrics,
  KOMMO_CONTROL_REFERENCE,
} from "../config/kommoControlReference.js";
import {
  accumulateSnapshotTier,
  buildStatusMapFromKommo,
  classifyKommoStageTier,
  getStageFromKommoStatus,
  metricsFromClientSnapshot,
  newClientSnapshot,
  type KommoClientSnapshot,
  type KommoStageTier,
  type KommoStatusInfo,
  type StageCounts,
} from "../config/kommoStageMap.js";
import { monthRangeEndingOn, toBusinessDateIso, toLocalDateIso } from "../lib/dateRanges.js";
import {
  dailyMetricsOnConflict,
  hasLeadCreatedDateColumn,
  hasMetricsSourceColumn,
  withMetricsSource,
} from "../lib/dashboardMetricsDb.js";
import { AppError } from "../lib/errors.js";
import { kommoGet } from "../lib/kommoApi.js";
import {
  moldDailyMetricsFromTimeline,
  type LeadCohortMeta,
  type TimelineEventRow,
} from "../lib/kommoDailyMold.js";
import {
  buildStatusTierMap,
  enrichSnapshotReachedFromTimeline,
} from "../lib/kommoReachedMetrics.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sseHub } from "./sseHub.js";

const leadSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string().optional(),
    pipeline_id: z.coerce.number().optional(),
    status_id: z.coerce.number().optional(),
    responsible_user_id: z.coerce.number().optional(),
    created_at: z.coerce.number().optional(),
    updated_at: z.coerce.number().optional(),
    custom_fields_values: z
      .array(
        z
          .object({
            field_name: z.string().optional(),
            field_code: z.string().nullable().optional(),
            values: z
              .array(
                z
                  .object({
                    value: z.union([z.string(), z.number()]).optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    _embedded: z
      .object({
        tags: z.array(z.object({ name: z.string() }).passthrough()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type KommoLead = z.infer<typeof leadSchema>;

const pipelineSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  _embedded: z
    .object({
      statuses: z
        .array(
          z.object({
            id: z.coerce.number(),
            name: z.string(),
            type: z.coerce.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const userSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
});

export type KommoDateField = "updated_at" | "created_at";

export type KommoSyncMode = "date_range" | "pipeline_census";

export type KommoSyncParams = {
  since?: string;
  until?: string;
  /** Filtro en la API de Kommo (default: updated_at, el del scheduler). */
  dateFilter?: KommoDateField;
  /** Fecha almacenada en event_date (default: igual que dateFilter). */
  eventDateField?: KommoDateField;
  /** Omite purge de clientes huérfanos (backfills encadenados). */
  skipPurge?: boolean;
  /**
   * pipeline_census: todos los leads del pipeline (estado actual), event_date = hoy.
   * Alinea con data control; no usa filtro de fecha en Kommo.
   */
  mode?: KommoSyncMode;
};

const KOMMO_PAGE_SIZE = 1000;

/** Elimina eventos y métricas huérfanas (p. ej. SIN_CLIENTE de syncs antiguos). */
export async function purgeUnmappedKommoData(): Promise<{ events: number; metrics: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { events: 0, metrics: 0 };

  const allowed = getAllowedDashboardClients();
  const badClients = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("client")
      .range(offset, offset + KOMMO_PAGE_SIZE - 1);
    if (error) throw new AppError(`Kommo purge scan failed: ${error.message}`, 500);
    const rows = data ?? [];
    for (const row of rows) {
      const client = row.client as string;
      if (!allowed.has(client)) badClients.add(client);
    }
    if (rows.length < KOMMO_PAGE_SIZE) break;
    offset += KOMMO_PAGE_SIZE;
  }

  let eventsDeleted = 0;
  for (const client of Array.from(badClients)) {
    const { count, error } = await supabase
      .from("kommo_lead_events")
      .delete({ count: "exact" })
      .eq("client", client);
    if (error) throw new AppError(`Kommo purge delete failed: ${error.message}`, 500);
    eventsDeleted += count ?? 0;
  }

  let metricsDeleted = 0;
  const { data: metricClients, error: metricsScanErr } = await supabase
    .from("dashboard_metrics_daily")
    .select("client");
  if (metricsScanErr) throw new AppError(`Metrics purge scan failed: ${metricsScanErr.message}`, 500);

  const badMetricClients = new Set(
    (metricClients ?? []).map((r) => r.client as string).filter((c) => !allowed.has(c)),
  );
  for (const client of Array.from(badMetricClients)) {
    const { count, error } = await supabase
      .from("dashboard_metrics_daily")
      .delete({ count: "exact" })
      .eq("client", client);
    if (error) throw new AppError(`Metrics purge delete failed: ${error.message}`, 500);
    metricsDeleted += count ?? 0;
  }

  if (eventsDeleted > 0 || metricsDeleted > 0) {
    console.log(`[kommo] Purge: ${eventsDeleted} eventos y ${metricsDeleted} filas métricas huérfanas`);
  }
  return { events: eventsDeleted, metrics: metricsDeleted };
}

const censusLeadSchema = z
  .object({
    id: z.coerce.number(),
    pipeline_id: z.coerce.number().optional(),
    status_id: z.coerce.number().optional(),
  })
  .passthrough();

function parseLeadsPage(data: unknown): KommoLead[] {
  if (!data || typeof data !== "object") return [];
  const embedded = (data as { _embedded?: { leads?: unknown } })._embedded;
  if (!embedded || embedded.leads == null || !Array.isArray(embedded.leads)) return [];

  const leads: KommoLead[] = [];
  for (const item of embedded.leads) {
    const parsed = leadSchema.safeParse(item);
    if (parsed.success) leads.push(parsed.data);
  }
  return leads;
}

/** Parseo permisivo para censo (evita perder leads por campos custom incompletos). */
function parseCensusLeadsPage(data: unknown): Array<z.infer<typeof censusLeadSchema>> {
  if (!data || typeof data !== "object") return [];
  const embedded = (data as { _embedded?: { leads?: unknown } })._embedded;
  if (!embedded || embedded.leads == null || !Array.isArray(embedded.leads)) return [];

  const leads: Array<z.infer<typeof censusLeadSchema>> = [];
  for (const item of embedded.leads) {
    const parsed = censusLeadSchema.safeParse(item);
    if (parsed.success) leads.push(parsed.data);
  }
  return leads;
}

function toUnixRange(since: string, until: string): { from: number; to: number } {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

function leadTimestamp(lead: KommoLead, field: KommoDateField): number | null {
  const ts = field === "created_at" ? lead.created_at : lead.updated_at;
  return ts ?? null;
}

function resolveEventDate(
  lead: KommoLead,
  since: string,
  until: string,
  eventDateField: KommoDateField,
): string | null {
  const ts = leadTimestamp(lead, eventDateField);
  if (ts == null) return null;
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  if (date < since || date > until) return null;
  return date;
}

function resolveLeadCreatedDate(lead: KommoLead): string | null {
  if (lead.created_at == null) return null;
  return toBusinessDateIso(new Date(lead.created_at * 1000));
}

function resolveClientFromLead(lead: KommoLead, clientMap: Record<string, string>): string | null {
  const pipelineKey = String(lead.pipeline_id ?? "");
  if (clientMap[pipelineKey]) return clientMap[pipelineKey];

  const nameUpper = (lead.name ?? "").toUpperCase();
  for (const client of Object.values(clientMap)) {
    if (nameUpper.includes(client)) return client;
  }

  return null;
}

export async function fetchKommoStatuses(): Promise<KommoStatusInfo[]> {
  const data = await kommoGet<{ _embedded?: { pipelines?: unknown[] } }>("/leads/pipelines");
  const pipelines = z.array(pipelineSchema).parse(data._embedded?.pipelines ?? []);
  const statuses: KommoStatusInfo[] = [];
  for (const pipeline of pipelines) {
    for (const status of pipeline._embedded?.statuses ?? []) {
      statuses.push({
        id: status.id,
        name: status.name,
        pipeline_id: pipeline.id,
        type: status.type,
      });
    }
  }
  return statuses;
}

async function fetchKommoUsers(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { users?: unknown[] } }>("/users", {
      params: { page, limit: 250 },
    });
    const users = z.array(userSchema).parse(data._embedded?.users ?? []);
    if (users.length === 0) break;
    for (const user of users) {
      map.set(user.id, user.name);
    }
    if (users.length < 250) break;
    page += 1;
  }
  return map;
}

async function fetchKommoLeadsPageByPipeline(page: number, pipelineId: number): Promise<KommoLead[]> {
  const params: Record<string, string | number> = {
    page,
    limit: 250,
    "filter[pipeline_id]": pipelineId,
  };
  const data = await kommoGet<unknown>("/leads", { params });
  return parseLeadsPage(data);
}

/** Leads del pipeline creados en [monthStart, monthEnd] (cohorte mensual). */
export async function fetchKommoLeadsPageByPipelineCreated(
  page: number,
  pipelineId: number,
  monthStart: string,
  monthEnd: string,
): Promise<Array<z.infer<typeof censusLeadSchema>>> {
  const { from, to } = toUnixRange(monthStart, monthEnd);
  const params: Record<string, string | number> = {
    page,
    limit: 250,
    "filter[pipeline_id]": pipelineId,
    "filter[created_at][from]": from,
    "filter[created_at][to]": to,
  };
  const data = await kommoGet<unknown>("/leads", { params });
  return parseCensusLeadsPage(data);
}

/** Censo por etapa (como export CRM / HTML kommoData). */
async function fetchKommoLeadsPageByStatus(
  page: number,
  pipelineId: number,
  statusId: number,
): Promise<KommoLead[]> {
  const params: Record<string, string | number> = {
    page,
    limit: 250,
    "filter[statuses][0][pipeline_id]": pipelineId,
    "filter[statuses][0][status_id]": statusId,
  };
  const data = await kommoGet<unknown>("/leads", { params });
  return parseLeadsPage(data);
}

function includeStatusInCensus(status: KommoStatusInfo): boolean {
  if (status.type === 1) return false;
  if (classifyKommoStageTier(status.name) === "firmado") return false;
  return true;
}

function metricsForDashboard(_client: string, apiSnap: KommoClientSnapshot) {
  return metricsFromClientSnapshot(apiSnap);
}

async function fetchKommoLeadsPage(
  page: number,
  since: string,
  until: string,
  dateFilter: KommoDateField,
): Promise<KommoLead[]> {
  const { from, to } = toUnixRange(since, until);
  const params: Record<string, string | number> = {
    page,
    limit: 250,
    [`filter[${dateFilter}][from]`]: from,
    [`filter[${dateFilter}][to]`]: to,
  };
  if (env.KOMMO_PIPELINE_ID) params["filter[pipeline_id]"] = env.KOMMO_PIPELINE_ID;

  const data = await kommoGet<unknown>("/leads", { params });
  return parseLeadsPage(data);
}

export type KommoSyncResult = { processed: number; skipped: number };

export async function syncKommoLeads(params: KommoSyncParams): Promise<KommoSyncResult> {
  if (!isKommoConfigured()) {
    throw new AppError("Kommo API is not configured", 503, "KOMMO_NOT_CONFIGURED");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const clientMap = getKommoClientMap();
  const allowedClients = new Set(Object.values(clientMap));
  const statuses = await fetchKommoStatuses();
  const statusMap = buildStatusMapFromKommo(statuses);
  const users = await fetchKommoUsers();
  const useLeadCreatedDate = await hasLeadCreatedDateColumn();

  let processed = 0;
  let skipped = 0;

  const mode = params.mode ?? "date_range";
  const dateFilter = params.dateFilter ?? "updated_at";
  const eventDateField = params.eventDateField ?? dateFilter;
  const snapshotDate = toLocalDateIso();

  await supabase.from("sync_runs").insert({ source: "kommo", status: "running" });
  if (!params.skipPurge) {
    await purgeUnmappedKommoData();
  }

  try {
    if (mode === "pipeline_census") {
      for (const [pipelineKey, client] of Object.entries(clientMap)) {
        const pipelineId = Number(pipelineKey);
        if (!Number.isFinite(pipelineId)) continue;
        let page = 1;
        while (true) {
          const leads = await fetchKommoLeadsPageByPipeline(page, pipelineId);
          if (leads.length === 0) break;

          for (const lead of leads) {
            if (!allowedClients.has(client)) {
              skipped += 1;
              continue;
            }

            const stage: StageCounts = getStageFromKommoStatus(
              lead.status_id,
              lead.pipeline_id ?? pipelineId,
              statusMap,
            );
            const responsibleName =
              (lead.responsible_user_id != null ? users.get(lead.responsible_user_id) : undefined) ??
              (lead.responsible_user_id ? `SDR-${lead.responsible_user_id}` : "Sin asignar");

            const { error } = await supabase.from("kommo_lead_events").upsert(
              {
                kommo_lead_id: lead.id,
                event_date: snapshotDate,
                ...(useLeadCreatedDate ? { lead_created_date: resolveLeadCreatedDate(lead) } : {}),
                client,
                pipeline_id: lead.pipeline_id ?? pipelineId,
                status_id: lead.status_id ?? null,
                stage_name: statuses.find((s) => s.id === lead.status_id && s.pipeline_id === pipelineId)?.name ?? null,
                responsible_user_id: lead.responsible_user_id ?? null,
                responsible_name: responsibleName,
                conversations: stage.conversaciones,
                mql: stage.mql,
                sql: stage.sql,
                citas: stage.citas,
                firmas: stage.firmas,
                raw_payload: lead,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "kommo_lead_id,event_date" },
            );
            if (error) throw new AppError(`Kommo upsert failed: ${error.message}`, 500);
            processed += 1;
          }

          if (leads.length < 250) break;
          page += 1;
        }
      }

      console.log(
        `[kommo] Census ${snapshotDate}: ${processed} leads, ${skipped} omitidos (mapa)`,
      );
    } else {
      if (!params.since || !params.until) {
        throw new AppError("since and until are required for date_range sync", 400);
      }
      let page = 1;
      while (true) {
      const leads = await fetchKommoLeadsPage(page, params.since, params.until, dateFilter);
      if (leads.length === 0) break;

      for (const lead of leads) {
        const client = resolveClientFromLead(lead, clientMap);
        if (!client || !allowedClients.has(client)) {
          skipped += 1;
          continue;
        }

        const eventDate = resolveEventDate(lead, params.since, params.until, eventDateField);
        if (!eventDate) {
          skipped += 1;
          continue;
        }

        const stage: StageCounts = getStageFromKommoStatus(
          lead.status_id,
          lead.pipeline_id,
          statusMap,
        );
        const responsibleName =
          (lead.responsible_user_id != null ? users.get(lead.responsible_user_id) : undefined) ??
          (lead.responsible_user_id ? `SDR-${lead.responsible_user_id}` : "Sin asignar");

        const { error } = await supabase.from("kommo_lead_events").upsert(
          {
            kommo_lead_id: lead.id,
            event_date: eventDate,
            ...(useLeadCreatedDate ? { lead_created_date: resolveLeadCreatedDate(lead) } : {}),
            client,
            pipeline_id: lead.pipeline_id ?? null,
            status_id: lead.status_id ?? null,
            stage_name: statuses.find((s) => s.id === lead.status_id)?.name ?? null,
            responsible_user_id: lead.responsible_user_id ?? null,
            responsible_name: responsibleName,
            conversations: stage.conversaciones,
            mql: stage.mql,
            sql: stage.sql,
            citas: stage.citas,
            firmas: stage.firmas,
            raw_payload: lead,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "kommo_lead_id,event_date" },
        );
        if (error) throw new AppError(`Kommo upsert failed: ${error.message}`, 500);
        processed += 1;
      }

      if (leads.length < 250) break;
      page += 1;
    }

    console.log(
      `[kommo] Sync ${params.since}→${params.until} (${dateFilter}→${eventDateField}): ${processed} leads, ${skipped} omitidos`,
    );
    }

    await supabase.from("sync_runs").insert({
      source: "kommo",
      status: "success",
      records_processed: processed,
      finished_at: new Date().toISOString(),
    });

    sseHub.broadcast("kommo_updated", { recordsProcessed: processed, recordsSkipped: skipped });
    return { processed, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("sync_runs").insert({
      source: "kommo",
      status: "error",
      error_message: message,
      finished_at: new Date().toISOString(),
    });
    throw err;
  }
}

export type KommoSnapshotParams = {
  /** Fecha del corte (default: hoy). */
  snapshotDate?: string;
  /**
   * Solo auditoría: si true, borra filas del rango antes de escribir el corte.
   * Rompe el backfill diario — no usar en scheduler ni tras backfill.
   */
  replaceMonth?: boolean;
  monthStart?: string;
  monthEnd?: string;
};

/**
 * Censo mensual desde API: leads creados en el mes (cohorte), etapa actual en Kommo.
 * kommoData.leads ≈ filter created_at del mes (validado mayo 2026).
 */
export async function buildKommoMonthlyCohortSnapshots(
  monthStart: string,
  monthEnd: string,
): Promise<KommoClientSnapshot[]> {
  const clientMap = getKommoClientMap();
  const allStatuses = await fetchKommoStatuses();
  const statusNameByKey = new Map<string, string>();
  for (const s of allStatuses) {
    if (s.pipeline_id != null) statusNameByKey.set(`${s.pipeline_id}:${s.id}`, s.name);
    statusNameByKey.set(String(s.id), s.name);
  }

  const supabase = getSupabaseAdmin();
  const snapshots: KommoClientSnapshot[] = [];

  for (const [pipelineKey, client] of Object.entries(clientMap)) {
    const pipelineId = Number(pipelineKey);
    if (!Number.isFinite(pipelineId)) continue;

    const snap = newClientSnapshot(client);
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    const statusTierById = buildStatusTierMap(allStatuses, pipelineId);

    let page = 1;
    while (true) {
      const leads = await fetchKommoLeadsPageByPipelineCreated(page, pipelineId, monthStart, monthEnd);
      if (leads.length === 0) break;

      for (const lead of leads) {
        const name =
          statusNameByKey.get(`${lead.pipeline_id ?? pipelineId}:${lead.status_id}`) ??
          statusNameByKey.get(String(lead.status_id)) ??
          "";
        const tier = classifyKommoStageTier(name);
        if (tier === "firmado") continue;
        cohort.push({ id: lead.id, tier });
        accumulateSnapshotTier(snap, tier);
      }

      if (leads.length < 250) break;
      page += 1;
    }

    if (supabase && cohort.length > 0) {
      const reachedMeta = await enrichSnapshotReachedFromTimeline(
        supabase,
        snap,
        cohort,
        statusTierById,
        monthEnd,
      );
      // #region agent log
      fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
        body: JSON.stringify({
          sessionId: "a0037c",
          runId: "reached-enrich",
          hypothesisId: "H-Gregorio",
          location: "kommo.service.ts:buildKommoMonthlyCohortSnapshots",
          message: "reached* enriched from timeline",
          data: {
            client,
            leads: snap.leads,
            stageMql: reachedMeta.stageMql,
            preRejectMql: reachedMeta.preRejectMql,
            usedGregorio: reachedMeta.usedGregorio,
            reachedMql: snap.reachedMql,
            reachedSql: snap.reachedSql,
            reachedCita: snap.reachedCita,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    snapshots.push(snap);
  }

  return snapshots;
}

/** @deprecated Usar buildKommoMonthlyCohortSnapshots — el censo por status_id inflaba totales. */
export async function buildKommoPipelineSnapshots(): Promise<KommoClientSnapshot[]> {
  const until = toLocalDateIso();
  const { since } = monthRangeEndingOn(until);
  return buildKommoMonthlyCohortSnapshots(since, until);
}

/** Escribe snapshot en dashboard_metrics_daily (métricas de embudo alineadas al control). */
export async function syncKommoSnapshotMetrics(params: KommoSnapshotParams = {}): Promise<{
  processed: number;
  snapshots: KommoClientSnapshot[];
}> {
  if (!isKommoConfigured()) {
    throw new AppError("Kommo API is not configured", 503, "KOMMO_NOT_CONFIGURED");
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const snapshotDate =
    params.snapshotDate ?? KOMMO_CONTROL_REFERENCE.snapshotDate ?? toLocalDateIso();
  const cohortRange =
    params.monthStart && params.monthEnd
      ? { since: params.monthStart, until: params.monthEnd }
      : monthRangeEndingOn(snapshotDate);
  const snapshots = await buildKommoMonthlyCohortSnapshots(cohortRange.since, cohortRange.until);
  console.log(
    `[kommo] Censo cohorte API ${cohortRange.since}→${cohortRange.until} (created_at, sin firmado)`,
  );

  const gastoByClient = new Map<string, number>();
  if (params.replaceMonth && params.monthStart && params.monthEnd) {
    const allowed = Array.from(getAllowedDashboardClients());
    for (const client of allowed) {
      const { data: monthRows, error: loadErr } = await supabase
        .from("dashboard_metrics_daily")
        .select("gasto_total")
        .eq("client", client)
        .gte("metric_date", params.monthStart)
        .lte("metric_date", params.monthEnd);
      if (loadErr) throw new AppError(`Metrics load failed: ${loadErr.message}`, 500);
      const gastoSum = (monthRows ?? []).reduce(
        (sum, row) => sum + (row.gasto_total != null ? Number(row.gasto_total) : 0),
        0,
      );
      if (gastoSum > 0) gastoByClient.set(client, gastoSum);

      const { error } = await supabase
        .from("dashboard_metrics_daily")
        .delete()
        .eq("client", client)
        .gte("metric_date", params.monthStart)
        .lte("metric_date", params.monthEnd);
      if (error) throw new AppError(`Metrics delete failed: ${error.message}`, 500);
    }
  }

  let processed = 0;
  for (const snap of snapshots) {
    const ref = getKommoControlMetrics(snap.client);
    const metrics = metricsForDashboard(snap.client, snap);
    const preservedGasto = gastoByClient.get(snap.client);
    const censusRow = await withMetricsSource(
      {
        metric_date: snapshotDate,
        client: snap.client,
        conversaciones: metrics.conversaciones,
        mql: metrics.mql,
        sql: metrics.sql,
        citas: metrics.citas,
        firmas: metrics.firmas,
        gasto_total: null,
        mes: snapshotDate.slice(0, 7),
        updated_at: new Date().toISOString(),
      },
      "census",
    );
    const { error: upsertError } = await supabase.from("dashboard_metrics_daily").upsert(censusRow, {
      onConflict: await dailyMetricsOnConflict(),
    });
    if (upsertError) throw new AppError(upsertError.message, 500);
    processed += 1;

    const refLine = ref
      ? ` | control: leads=${ref.leads} mql=${ref.reachedMql} sql=${ref.reachedSql} citas=${ref.reachedCita}`
      : "";
    const drift =
      ref && ref.leads > 0
        ? ` | Δleads=${snap.leads - ref.leads}`
        : "";
    console.log(
      `[kommo] Snapshot ${snapshotDate} · ${snap.client}: API leads=${snap.leads} mql=${snap.reachedMql} sql=${snap.reachedSql} citas=${snap.reachedCita} rechazados=${snap.byTier.rejected}${refLine}${drift}`,
    );
  }

  return { processed, snapshots };
}

/**
 * Reconstruye embudo diario desde kommo_lead_events (1 fila por fecha+cliente).
 * Primero pone a 0 conversaciones/mql/sql/citas/firmas en el rango (conserva gasto Meta).
 */
export type RebuildDailyMetricsOptions = {
  /** false = solo kommo_lead_events en BD (recomendado para rangos > 1 mes). */
  enrichCohortFromApi?: boolean;
};

function rangeDayCount(since: string, until: string): number {
  const start = new Date(`${since}T12:00:00`).getTime();
  const end = new Date(`${until}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function shouldEnrichCohortFromApi(
  since: string | undefined,
  until: string | undefined,
  override?: boolean,
): boolean {
  if (override === false) return false;
  if (override === true) return isKommoConfigured();
  if (!since || !until || !isKommoConfigured()) return false;
  if (process.env.KOMMO_ENRICH_COHORT_API === "1") return true;
  if (process.env.KOMMO_REBUILD_SKIP_API === "1") return false;
  return rangeDayCount(since, until) <= 35;
}

export async function rebuildDailyMetricsFromEvents(
  since: string,
  until: string,
  options?: RebuildDailyMetricsOptions,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const allowed = Array.from(getAllowedDashboardClients());
  const useLeadCreatedDate = await hasLeadCreatedDateColumn();
  const useSource = await hasMetricsSourceColumn();
  for (const client of allowed) {
    let reset = supabase
      .from("dashboard_metrics_daily")
      .update({
        conversaciones: 0,
        mql: 0,
        sql: 0,
        citas: 0,
        firmas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("client", client)
      .gte("metric_date", since)
      .lte("metric_date", until);
    if (useSource) {
      reset = reset.eq("metrics_source", "timeline");
    }
    const { error } = await reset;
    if (error) throw new AppError(`Metrics reset failed: ${error.message}`, 500);
  }

  return aggregateKommoToDailyMetrics(since, until, options);
}

export async function aggregateKommoToDailyMetrics(
  since?: string,
  until?: string,
  options?: RebuildDailyMetricsOptions,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const allowed = Array.from(getAllowedDashboardClients());
  const useLeadCreatedDate = await hasLeadCreatedDateColumn();
  const allStatuses = await fetchKommoStatuses();
  const statusNameByKey = new Map<string, string>();
  for (const s of allStatuses) {
    if (s.pipeline_id != null) statusNameByKey.set(`${s.pipeline_id}:${s.id}`, s.name);
    statusNameByKey.set(String(s.id), s.name);
  }
  const pipelineIdByClient = new Map<string, number>();
  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    pipelineIdByClient.set(client, Number(pid));
  }

  const timelineEvents: TimelineEventRow[] = [];
  const leadCohort = new Map<number, LeadCohortMeta>();

  let offset = 0;
  while (true) {
    let query = supabase
      .from("kommo_lead_events")
      .select(
        "kommo_lead_id, event_date, client, pipeline_id, status_id, stage_name, lead_created_date, raw_payload, kommo_event_id",
      )
      .in("client", allowed)
      .not("kommo_event_id", "is", null)
      .order("event_date", { ascending: true })
      .range(offset, offset + KOMMO_PAGE_SIZE - 1);
    if (since) query = query.gte("event_date", since);
    if (until) query = query.lte("event_date", until);
    if (useLeadCreatedDate) {
      if (since) query = query.gte("lead_created_date", since);
      if (until) query = query.lte("lead_created_date", until);
    }

    const { data, error } = await query;
    if (error) throw new AppError(`Kommo load failed: ${error.message}`, 500);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const leadId = row.kommo_lead_id as number;
      const client = row.client as string;
      const created =
        (row.lead_created_date as string | null) ??
        leadCohort.get(leadId)?.createdDate;
      if (created && !leadCohort.has(leadId)) {
        leadCohort.set(leadId, { client, createdDate: created });
      }
      timelineEvents.push({
        kommo_lead_id: leadId,
        event_date: row.event_date as string,
        client,
        pipeline_id: row.pipeline_id as number | null,
        status_id: row.status_id as number | null,
        stage_name: row.stage_name as string | null,
        lead_created_date: row.lead_created_date as string | null,
        raw_payload: row.raw_payload,
      });
    }

    if (rows.length < KOMMO_PAGE_SIZE) break;
    offset += KOMMO_PAGE_SIZE;
  }

  const enrichFromApi = shouldEnrichCohortFromApi(since, until, options?.enrichCohortFromApi);
  if (enrichFromApi && since && until) {
    for (const [pipelineKey, client] of Object.entries(getKommoClientMap())) {
      const pipelineId = Number(pipelineKey);
      if (!Number.isFinite(pipelineId)) continue;
      try {
        let page = 1;
        while (true) {
          const leads = await fetchKommoLeadsPageByPipelineCreated(page, pipelineId, since, until);
          if (leads.length === 0) break;
          for (const lead of leads) {
            const created = resolveLeadCreatedDate(lead as KommoLead);
            if (!created) continue;
            leadCohort.set(lead.id, { client, createdDate: created });
          }
          if (leads.length < 250) break;
          page += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[kommo] cohort API omitido ${client} (${pipelineId}): ${message} — conversaciones desde lead_created_date en eventos`,
        );
      }
    }
  } else if (since && until && isKommoConfigured()) {
    console.log(
      `[kommo] Sin enriquecimiento API (rango ${rangeDayCount(since, until)} días). Cohorte solo desde kommo_lead_events.`,
    );
  }

  const grouped = moldDailyMetricsFromTimeline(
    timelineEvents,
    leadCohort,
    statusNameByKey,
    pipelineIdByClient,
    { monthStart: since, monthEnd: until },
  );

  // #region agent log
  fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
    body: JSON.stringify({
      sessionId: "a0037c",
      runId: "daily-mold-aggregate",
      hypothesisId: "H-daily-mold",
      location: "kommo.service.ts:aggregateKommoToDailyMetrics",
      message: "timeline molded to daily",
      data: { rows: grouped.size, events: timelineEvents.length, cohortLeads: leadCohort.size, since, until },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const useSource = await hasMetricsSourceColumn();
  const onConflict = await dailyMetricsOnConflict();
  let upserted = 0;
  for (const agg of grouped.values()) {
    let existingQuery = supabase
      .from("dashboard_metrics_daily")
      .select("gasto_total")
      .eq("metric_date", agg.date)
      .eq("client", agg.client);
    if (useSource) {
      existingQuery = existingQuery.eq("metrics_source", "timeline");
    }
    const { data: existing } = await existingQuery.maybeSingle();

    const row = await withMetricsSource(
      {
        metric_date: agg.date,
        client: agg.client,
        conversaciones: agg.conversaciones,
        mql: agg.mql,
        sql: agg.sql,
        citas: agg.citas,
        firmas: agg.firmas,
        gasto_total: existing?.gasto_total ?? null,
        mes: agg.date.slice(0, 7),
        updated_at: new Date().toISOString(),
      },
      "timeline",
    );
    const { error: upsertError } = await supabase.from("dashboard_metrics_daily").upsert(row, {
      onConflict,
    });
    if (upsertError) throw new AppError(upsertError.message, 500);
    upserted += 1;
  }

  return upserted;
}
