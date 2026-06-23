/**
 * Procesa webhooks entrantes de Kommo (lead_status_changed).
 * Lee SOLO de Supabase para lead_created_date; no llama a la API de Kommo en el
 * request path (excepto fetchKommoStatuses, que tiene caché de 10 min).
 */
import { z } from "zod";
import { getKommoClientMap } from "../config/env.js";
import {
  buildStatusMapFromKommo,
  getStageFromKommoStatus,
  type KommoStatusInfo,
} from "../config/kommoStageMap.js";
import { toAccountDateIso } from "../lib/dateRanges.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { fetchKommoStatuses } from "./kommo.service.js";
import { refreshAndBroadcast } from "./metrics.service.js";

// ─── Caché de statuses para evitar llamadas repetidas a la API de Kommo ───────
let _cachedStatuses: KommoStatusInfo[] | null = null;
let _cacheExpiresAt = 0;
const STATUS_CACHE_TTL_MS = 10 * 60 * 1000;

async function getCachedStatuses(): Promise<KommoStatusInfo[]> {
  if (_cachedStatuses && Date.now() < _cacheExpiresAt) return _cachedStatuses;
  _cachedStatuses = await fetchKommoStatuses();
  _cacheExpiresAt = Date.now() + STATUS_CACHE_TTL_MS;
  return _cachedStatuses;
}

// ─── Schema del payload de webhook de Kommo ──────────────────────────────────
// Kommo puede enviar JSON o application/x-www-form-urlencoded.
// En form-encoded, `leads.status` llega como objeto con claves "0","1",…
// en lugar de un array. La transformación lo normaliza.

const leadStatusItemSchema = z.object({
  id: z.coerce.number(),
  status_id: z.coerce.number(),
  pipeline_id: z.coerce.number(),
  old_status_id: z.coerce.number().optional(),
  responsible_user_id: z.coerce.number().optional(),
});

const leadStatusContainerSchema = z
  .union([
    z.array(leadStatusItemSchema),
    z
      .record(z.string(), leadStatusItemSchema)
      .transform((obj) => Object.values(obj)),
  ])
  .optional();

const kommoWebhookBodySchema = z.object({
  leads: z
    .object({
      status: leadStatusContainerSchema,
      update: leadStatusContainerSchema,
    })
    .optional(),
  account: z
    .object({
      subdomain: z.string().optional(),
    })
    .optional(),
});

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * Upserta los cambios de etapa en kommo_lead_events y dispara un rebuild
 * de 4 meses en background para que firmas tardías se reflejen en su cohorte.
 */
export async function processKommoWebhookPayload(body: unknown): Promise<void> {
  const parsed = kommoWebhookBodySchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[webhook] Kommo payload inválido:", parsed.error.issues);
    return;
  }

  const statusChanges = [
    ...(parsed.data.leads?.status ?? []),
    ...(parsed.data.leads?.update ?? []),
  ];
  if (statusChanges.length === 0) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const clientMap = getKommoClientMap();
  const pipelineToClient = new Map<number, string>();
  for (const [pid, client] of Object.entries(clientMap)) {
    pipelineToClient.set(Number(pid), client);
  }

  const statuses = await getCachedStatuses();
  const statusMap = buildStatusMapFromKommo(statuses);
  const eventDate = toAccountDateIso(new Date());
  const syncedAt = new Date().toISOString();

  let upserted = 0;
  for (const change of statusChanges) {
    const client = pipelineToClient.get(change.pipeline_id);
    if (!client) continue;

    const stage = getStageFromKommoStatus(change.status_id, change.pipeline_id, statusMap);
    const stageName =
      statuses.find((s) => s.id === change.status_id && s.pipeline_id === change.pipeline_id)
        ?.name ??
      statuses.find((s) => s.id === change.status_id)?.name ??
      null;

    // lead_created_date: buscar en filas previas del lead (solo Supabase, sin API Kommo)
    const { data: existingRow } = await supabase
      .from("kommo_lead_events")
      .select("lead_created_date")
      .eq("kommo_lead_id", change.id)
      .not("lead_created_date", "is", null)
      .limit(1)
      .maybeSingle();

    const leadCreatedDate = (existingRow?.lead_created_date as string | null) ?? eventDate;

    const { error } = await supabase.from("kommo_lead_events").upsert(
      {
        // ID determinístico: 1 fila por (lead, status, día) → idempotente ante reintentos
        kommo_event_id: `wh-${change.id}-${change.status_id}-${eventDate}`,
        kommo_lead_id: change.id,
        event_date: eventDate,
        lead_created_date: leadCreatedDate,
        client,
        pipeline_id: change.pipeline_id,
        status_id: change.status_id,
        stage_name: stageName,
        responsible_user_id: null,
        responsible_name: null,
        conversations: stage.conversaciones,
        mql: stage.mql,
        sql: stage.sql,
        citas: stage.citas,
        firmas: stage.firmas,
        raw_payload: { source: "webhook", lead_id: change.id, ...change },
        synced_at: syncedAt,
      },
      { onConflict: "kommo_event_id" },
    );

    if (error) {
      console.error(`[webhook] Upsert kommo_lead_events falló lead ${change.id}:`, error.message);
      continue;
    }
    upserted++;
  }

  if (upserted === 0) return;

  console.log(`[webhook] Kommo: ${upserted} cambio(s) de etapa insertados. Disparando rebuild…`);

  // Rebuild 4-month rolling en background — no bloquea la respuesta HTTP a Kommo
  void refreshAndBroadcast().catch((err) =>
    console.error("[webhook] refreshAndBroadcast falló:", err),
  );
}
