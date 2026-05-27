import { z } from "zod";
import { env, getAllowedDashboardClients, getKommoClientMap, isKommoConfigured } from "../config/env.js";
import {
  accumulateSnapshotTier,
  buildStatusMapFromKommo,
  classifyKommoStageTier,
  getStageFromKommoStatus,
  metricsFromClientSnapshot,
  newClientSnapshot,
  type KommoClientSnapshot,
  type KommoStatusInfo,
  type StageCounts,
} from "../config/kommoStageMap.js";
import { toLocalDateIso } from "../lib/dateRanges.js";
import { AppError } from "../lib/errors.js";
import { kommoGet } from "../lib/kommoApi.js";
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

function resolveClientFromLead(lead: KommoLead, clientMap: Record<string, string>): string | null {
  const pipelineKey = String(lead.pipeline_id ?? "");
  if (clientMap[pipelineKey]) return clientMap[pipelineKey];

  const nameUpper = (lead.name ?? "").toUpperCase();
  for (const client of Object.values(clientMap)) {
    if (nameUpper.includes(client)) return client;
  }

  return null;
}

async function fetchKommoStatuses(): Promise<KommoStatusInfo[]> {
  const data = await kommoGet<{ _embedded?: { pipelines?: unknown[] } }>("/leads/pipelines");
  const pipelines = z.array(pipelineSchema).parse(data._embedded?.pipelines ?? []);
  const statuses: KommoStatusInfo[] = [];
  for (const pipeline of pipelines) {
    for (const status of pipeline._embedded?.statuses ?? []) {
      statuses.push({
        id: status.id,
        name: status.name,
        pipeline_id: pipeline.id,
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
  /** Si se define, borra métricas Kommo del mes antes de escribir el snapshot. */
  monthStart?: string;
  monthEnd?: string;
};

/** Censo Kommo por pipeline (como index-1.html): un lead = una etapa; reached* para embudo. */
export async function buildKommoPipelineSnapshots(): Promise<KommoClientSnapshot[]> {
  const clientMap = getKommoClientMap();
  const statuses = await fetchKommoStatuses();
  const statusNameByKey = new Map<string, string>();
  for (const s of statuses) {
    statusNameByKey.set(`${s.pipeline_id}:${s.id}`, s.name);
    statusNameByKey.set(String(s.id), s.name);
  }

  const byClient = new Map<string, KommoClientSnapshot>();

  for (const [pipelineKey, client] of Object.entries(clientMap)) {
    const pipelineId = Number(pipelineKey);
    if (!Number.isFinite(pipelineId)) continue;

    let page = 1;
    while (true) {
      const leads = await fetchKommoLeadsPageByPipeline(page, pipelineId);
      if (leads.length === 0) break;

      for (const lead of leads) {
        const statusId = lead.status_id;
        const pid = lead.pipeline_id ?? pipelineId;
        const statusName =
          statusNameByKey.get(`${pid}:${statusId}`) ??
          statusNameByKey.get(String(statusId)) ??
          "Leads Entrantes";
        const tier = classifyKommoStageTier(statusName);
        const snap = byClient.get(client) ?? newClientSnapshot(client);
        accumulateSnapshotTier(snap, tier);
        byClient.set(client, snap);
      }

      if (leads.length < 250) break;
      page += 1;
    }
  }

  return Array.from(byClient.values());
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

  const snapshotDate = params.snapshotDate ?? toLocalDateIso();
  const snapshots = await buildKommoPipelineSnapshots();

  const gastoByClient = new Map<string, number>();
  if (params.monthStart && params.monthEnd) {
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
    const metrics = metricsFromClientSnapshot(snap);
    const preservedGasto = gastoByClient.get(snap.client);
    const { data: existing } = await supabase
      .from("dashboard_metrics_daily")
      .select("gasto_total")
      .eq("metric_date", snapshotDate)
      .eq("client", snap.client)
      .maybeSingle();

    const { error: upsertError } = await supabase.from("dashboard_metrics_daily").upsert(
      {
        metric_date: snapshotDate,
        client: snap.client,
        conversaciones: metrics.conversaciones,
        mql: metrics.mql,
        sql: metrics.sql,
        citas: metrics.citas,
        firmas: metrics.firmas,
        gasto_total: preservedGasto ?? existing?.gasto_total ?? null,
        mes: snapshotDate.slice(0, 7),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "metric_date,client" },
    );
    if (upsertError) throw new AppError(upsertError.message, 500);
    processed += 1;

    console.log(
      `[kommo] Snapshot ${snapshotDate} · ${snap.client}: leads=${snap.leads} mql=${snap.reachedMql} sql=${snap.reachedSql} citas=${snap.reachedCita} rechazados=${snap.byTier.rejected}`,
    );
  }

  return { processed, snapshots };
}

export async function aggregateKommoToDailyMetrics(since?: string, until?: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const allowed = Array.from(getAllowedDashboardClients());
  const grouped = new Map<
    string,
    { date: string; client: string; conversaciones: number; mql: number; sql: number; citas: number; firmas: number }
  >();

  let offset = 0;
  while (true) {
    let query = supabase
      .from("kommo_lead_events")
      .select("event_date, client, conversations, mql, sql, citas, firmas")
      .in("client", allowed)
      .order("event_date", { ascending: true })
      .range(offset, offset + KOMMO_PAGE_SIZE - 1);
    if (since) query = query.gte("event_date", since);
    if (until) query = query.lte("event_date", until);

    const { data, error } = await query;
    if (error) throw new AppError(`Kommo load failed: ${error.message}`, 500);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const key = `${row.event_date}::${row.client}`;
      const current = grouped.get(key) ?? {
        date: row.event_date as string,
        client: row.client as string,
        conversaciones: 0,
        mql: 0,
        sql: 0,
        citas: 0,
        firmas: 0,
      };
      current.conversaciones += (row.conversations as number) ?? 0;
      current.mql += (row.mql as number) ?? 0;
      current.sql += (row.sql as number) ?? 0;
      current.citas += (row.citas as number) ?? 0;
      current.firmas += (row.firmas as number) ?? 0;
      grouped.set(key, current);
    }

    if (rows.length < KOMMO_PAGE_SIZE) break;
    offset += KOMMO_PAGE_SIZE;
  }

  let upserted = 0;
  for (const agg of Array.from(grouped.values())) {
    const { data: existing } = await supabase
      .from("dashboard_metrics_daily")
      .select("gasto_total")
      .eq("metric_date", agg.date)
      .eq("client", agg.client)
      .maybeSingle();

    const { error: upsertError } = await supabase.from("dashboard_metrics_daily").upsert(
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
      { onConflict: "metric_date,client" },
    );
    if (upsertError) throw new AppError(upsertError.message, 500);
    upserted += 1;
  }

  return upserted;
}
