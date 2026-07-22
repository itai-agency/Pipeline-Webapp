import { classifyKommoStageTier, type KommoStageTier } from "../config/kommoStageMap.js";
import type { RejectedByStageRowDto } from "../../shared/types/dashboard.js";

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

/** Evento de timeline Kommo (kommo_lead_events) necesario para el cálculo. */
export type RejectionTimelineEvent = {
  kommo_lead_id: number;
  client: string;
  status_id: number | null;
  event_date: string;
  stage_name: string | null;
  lead_created_date: string | null;
};

type StageKey = "MQL" | "SQL" | "CITAS" | "FIRMAS";

/**
 * Tarjeta destino según la etapa máxima alcanzada. Solo etapas visibles del
 * dashboard: entrada (y sin etapa previa) no se muestra; "ofertado" se pliega a
 * Citas porque no hay tarjeta propia (consistente con stageColumnReached).
 */
function bucketForRank(maxRank: number): StageKey | null {
  if (maxRank >= TIER_RANK.firmado) return "FIRMAS";
  if (maxRank >= TIER_RANK.cita) return "CITAS"; // incluye ofertado
  if (maxRank >= TIER_RANK.sql) return "SQL";
  if (maxRank >= TIER_RANK.mql) return "MQL";
  return null;
}

function eventSortKey(ev: RejectionTimelineEvent): number {
  return Math.floor(new Date(`${ev.event_date}T12:00:00`).getTime() / 1000);
}

/**
 * Agrupa leads rechazados por su etapa máxima ANTES del primer evento de
 * rechazo. Clasifica por stage_name (solo Supabase, sin API Kommo). Atribuye
 * cada lead a su fecha de creación (lead_created_date) para que el badge se
 * filtre por la misma cohorte que las tarjetas del embudo.
 */
export function computeRejectedByStage(
  events: RejectionTimelineEvent[],
): RejectedByStageRowDto[] {
  const byLead = new Map<number, RejectionTimelineEvent[]>();
  for (const ev of events) {
    const list = byLead.get(ev.kommo_lead_id) ?? [];
    list.push(ev);
    byLead.set(ev.kommo_lead_id, list);
  }

  const byKey = new Map<string, RejectedByStageRowDto>();
  for (const [, leadEvents] of byLead) {
    const sorted = [...leadEvents].sort((a, b) => eventSortKey(a) - eventSortKey(b));
    const isRejected = sorted.some(
      (e) => classifyKommoStageTier(e.stage_name ?? "") === "rejected",
    );
    if (!isRejected) continue;

    let maxRank = -2;
    for (const ev of sorted) {
      const tier = classifyKommoStageTier(ev.stage_name ?? "");
      if (tier === "rejected") break;
      if (TIER_RANK[tier] > maxRank) maxRank = TIER_RANK[tier];
    }

    const bucket = bucketForRank(maxRank);
    if (!bucket) continue; // se quedó en entrada o sin etapa previa registrada

    const client = leadEvents[0].client;
    const createdDate =
      sorted.find((e) => e.lead_created_date)?.lead_created_date ??
      sorted.find((e) => classifyKommoStageTier(e.stage_name ?? "") === "rejected")
        ?.event_date ??
      sorted[0].event_date;

    const key = `${createdDate}::${client}`;
    const row =
      byKey.get(key) ??
      ({ FECHA: createdDate, CLIENTE: client, MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0 } as RejectedByStageRowDto);
    row[bucket] += 1;
    byKey.set(key, row);
  }

  return Array.from(byKey.values()).sort(
    (a, b) => a.FECHA.localeCompare(b.FECHA) || a.CLIENTE.localeCompare(b.CLIENTE),
  );
}
