/**
 * Sincroniza el historial real de Kommo: GET /api/v4/events (lead_status_changed).
 * Cada cambio de etapa = una fila con event_date = día del movimiento.
 */
import { z } from "zod";
import { getKommoClientMap, isKommoConfigured } from "../config/env.js";
import {
  buildStatusMapFromKommo,
  getStageFromKommoStatus,
  type KommoStatusInfo,
} from "../config/kommoStageMap.js";
import { toUtcDateIso, toUtcUnixRange } from "../lib/dateRanges.js";
import { hasLeadCreatedDateColumn } from "../lib/dashboardMetricsDb.js";
import { AppError } from "../lib/errors.js";
import { kommoGet } from "../lib/kommoApi.js";
import { withNetworkRetry } from "../lib/retry.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { fetchKommoStatuses } from "./kommo.service.js";

const UPSERT_BATCH = 100;

const leadStatusChangeSchema = z.object({
  lead_status: z.object({
    id: z.coerce.number(),
    pipeline_id: z.coerce.number(),
  }),
});

const kommoEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  entity_id: z.coerce.number(),
  entity_type: z.string(),
  created_at: z.coerce.number(),
  value_after: z.array(z.record(z.string(), z.unknown())).optional(),
  value_before: z.array(z.record(z.string(), z.unknown())).optional(),
});

const eventsPageSchema = z.object({
  _embedded: z
    .object({
      events: z.array(kommoEventSchema).optional(),
    })
    .optional(),
});

export type KommoTimelineSyncParams = {
  since: string;
  until: string;
};

type TimelineRow = {
  kommo_event_id: string;
  kommo_lead_id: number;
  event_date: string;
  lead_created_date: string | null;
  client: string;
  pipeline_id: number;
  status_id: number;
  stage_name: string | null;
  responsible_user_id: null;
  responsible_name: null;
  conversations: number;
  mql: number;
  sql: number;
  citas: number;
  firmas: number;
  raw_payload: z.infer<typeof kommoEventSchema>;
  synced_at: string;
};

function eventDateFromUnix(ts: number): string {
  return toUtcDateIso(new Date(ts * 1000));
}

function parseLeadStatusAfter(
  valueAfter: Array<Record<string, unknown>> | undefined,
): { statusId: number; pipelineId: number } | null {
  if (!valueAfter?.length) return null;
  const parsed = leadStatusChangeSchema.safeParse(valueAfter[0]);
  if (!parsed.success) return null;
  return {
    statusId: parsed.data.lead_status.id,
    pipelineId: parsed.data.lead_status.pipeline_id,
  };
}

function resolveStatusName(
  statuses: KommoStatusInfo[],
  pipelineId: number,
  statusId: number,
): string | null {
  const match = statuses.find((s) => s.id === statusId && s.pipeline_id === pipelineId);
  return match?.name ?? statuses.find((s) => s.id === statusId)?.name ?? null;
}

async function fetchStatusChangeEventsPage(
  page: number,
  from: number,
  to: number,
): Promise<z.infer<typeof kommoEventSchema>[]> {
  return withNetworkRetry(`Kommo /events p${page}`, async () => {
    const data = await kommoGet<unknown>("/events", {
      params: {
        page,
        limit: 250,
        "filter[type]": "lead_status_changed",
        "filter[entity]": "lead",
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
      timeout: 120_000,
    });
    const parsed = eventsPageSchema.safeParse(data);
    if (!parsed.success) return [];
    return parsed.data._embedded?.events ?? [];
  });
}

function toIsoDateFromUnix(ts: number | null | undefined): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  return toUtcDateIso(new Date(ts * 1000));
}

async function fetchLeadCreatedDates(leadIds: number[]): Promise<Map<number, string | null>> {
  const byLead = new Map<number, string | null>();
  if (leadIds.length === 0) return byLead;

  const idsParam = leadIds.map((id) => `filter[id][]=${id}`).join("&");
  const data = await withNetworkRetry(`Kommo /leads batch x${leadIds.length}`, async () =>
    kommoGet<{ _embedded?: { leads?: Array<{ id?: number; created_at?: number }> } }>(`/leads?${idsParam}`, {
      params: { limit: 250 },
      timeout: 120_000,
    }),
  );

  const leads = data?._embedded?.leads ?? [];
  for (const lead of leads) {
    if (typeof lead.id !== "number") continue;
    byLead.set(lead.id, toIsoDateFromUnix(lead.created_at));
  }
  return byLead;
}

async function upsertTimelineBatch(rows: TimelineRow[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  const useLeadCreatedDate = await hasLeadCreatedDateColumn();

  await withNetworkRetry(`Supabase upsert x${rows.length}`, async () => {
    const payload = useLeadCreatedDate
      ? rows
      : rows.map(({ lead_created_date: _leadCreatedDate, ...rest }) => rest);
    const { error } = await supabase.from("kommo_lead_events").upsert(payload, {
      onConflict: "kommo_event_id",
    });
    if (error) {
      const hint =
        error.message.includes("ON CONFLICT") || error.message.includes("unique or exclusion")
          ? " Ejecuta supabase/migrations/003_fix_kommo_event_id_unique.sql en Supabase."
          : "";
      throw new AppError(`Kommo timeline upsert failed: ${error.message}${hint}`, 500);
    }
  });
}

/** Importa movimientos de etapa desde la API de eventos de Kommo. */
export async function syncKommoStatusChangeEvents(
  params: KommoTimelineSyncParams,
): Promise<{ processed: number; skipped: number }> {
  if (!isKommoConfigured()) {
    throw new AppError("Kommo API is not configured", 503, "KOMMO_NOT_CONFIGURED");
  }
  if (!getSupabaseAdmin()) {
    throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const clientMap = getKommoClientMap();
  const pipelineToClient = new Map<number, string>();
  for (const [pid, client] of Object.entries(clientMap)) {
    pipelineToClient.set(Number(pid), client);
  }

  const statuses = await fetchKommoStatuses();
  const statusMap = buildStatusMapFromKommo(statuses);
  const { from, to } = toUtcUnixRange(params.since, params.until);

  let processed = 0;
  let skipped = 0;
  let page = 1;
  const pending: TimelineRow[] = [];
  const leadCreatedCache = new Map<number, string | null>();
  const useLeadCreatedDate = await hasLeadCreatedDateColumn();

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    for (let i = 0; i < batch.length; i += UPSERT_BATCH) {
      await upsertTimelineBatch(batch.slice(i, i + UPSERT_BATCH));
    }
  };

  while (true) {
    const events = await fetchStatusChangeEventsPage(page, from, to);
    if (events.length === 0) break;

    if (useLeadCreatedDate) {
      const uncachedLeadIds = Array.from(
        new Set(
          events
            .map((ev) => ev.entity_id)
            .filter((leadId) => Number.isFinite(leadId) && !leadCreatedCache.has(leadId)),
        ),
      );
      for (let i = 0; i < uncachedLeadIds.length; i += 200) {
        const batch = uncachedLeadIds.slice(i, i + 200);
        const createdMap = await fetchLeadCreatedDates(batch);
        for (const leadId of batch) {
          leadCreatedCache.set(leadId, createdMap.get(leadId) ?? null);
        }
      }
    }

    for (const ev of events) {
      if (ev.type !== "lead_status_changed" || ev.entity_type !== "lead") {
        skipped += 1;
        continue;
      }

      const after = parseLeadStatusAfter(ev.value_after);
      if (!after) {
        skipped += 1;
        continue;
      }

      const client = pipelineToClient.get(after.pipelineId);
      if (!client) {
        skipped += 1;
        continue;
      }

      const stage = getStageFromKommoStatus(after.statusId, after.pipelineId, statusMap);
      const stageName = resolveStatusName(statuses, after.pipelineId, after.statusId);
      const eventDate = eventDateFromUnix(ev.created_at);

      pending.push({
        kommo_event_id: ev.id,
        kommo_lead_id: ev.entity_id,
        event_date: eventDate,
        lead_created_date: useLeadCreatedDate ? (leadCreatedCache.get(ev.entity_id) ?? null) : null,
        client,
        pipeline_id: after.pipelineId,
        status_id: after.statusId,
        stage_name: stageName,
        responsible_user_id: null,
        responsible_name: null,
        conversations: stage.conversaciones,
        mql: stage.mql,
        sql: stage.sql,
        citas: stage.citas,
        firmas: stage.firmas,
        raw_payload: ev,
        synced_at: new Date().toISOString(),
      });
      processed += 1;

      if (pending.length >= UPSERT_BATCH) {
        await flush();
      }
    }

    await flush();

    if (events.length < 250) break;
    page += 1;
  }

  console.log(
    `[kommo] Timeline ${params.since}→${params.until}: ${processed} cambios de etapa, ${skipped} omitidos`,
  );

  return { processed, skipped };
}
