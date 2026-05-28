import {
  classifyKommoStageTier,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoClientSnapshot,
  type KommoStageTier,
} from "../config/kommoStageMap.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

/** Suma columnas de etapa activa (como kommoData del HTML). */
export function stageColumnReached(snap: KommoClientSnapshot): {
  mql: number;
  sql: number;
  cita: number;
} {
  const { byTier } = snap;
  return {
    mql: byTier.mql + byTier.sql + byTier.cita + byTier.ofertado,
    sql: byTier.sql + byTier.cita + byTier.ofertado,
    cita: byTier.cita + byTier.ofertado,
  };
}

type CohortLead = { id: number; tier: KommoStageTier };

type TimelineEvent = { kommo_lead_id: number; status_id: number | null };

/**
 * Gregorio (validado runtime HOGARES mayo 2026):
 * reachedMql = activos en MQL+ + rechazados cuyo máximo tier ANTES del primer evento
 * "rechazado" fue MQL+.
 * Solo aplica supplement de rechazados cuando hay volumen alto (preRejectMql >= 20).
 */
export async function enrichSnapshotReachedFromTimeline(
  supabase: SupabaseClient,
  snap: KommoClientSnapshot,
  cohort: CohortLead[],
  statusTierById: Map<number, KommoStageTier>,
  cutoffDate: string,
): Promise<{ stageMql: number; preRejectMql: number; usedGregorio: boolean }> {
  const stage = stageColumnReached(snap);
  const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);

  const preRejectMax = new Map<number, number>();
  const chunk = 200;
  for (let i = 0; i < rejectedIds.length; i += chunk) {
    const ids = rejectedIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, status_id, event_date")
      .eq("client", snap.client)
      .in("kommo_lead_id", ids)
      .lte("event_date", cutoffDate)
      .not("kommo_event_id", "is", null)
      .order("event_date", { ascending: true });
    if (error) throw new Error(`Timeline load failed: ${error.message}`);

    const byLead = new Map<number, TimelineEvent[]>();
    for (const row of data ?? []) {
      const id = row.kommo_lead_id as number;
      const list = byLead.get(id) ?? [];
      list.push({ kommo_lead_id: id, status_id: row.status_id as number | null });
      byLead.set(id, list);
    }

    for (const [id, events] of byLead) {
      let max = -2;
      for (const ev of events) {
        const tier = statusTierById.get(ev.status_id ?? 0) ?? "entrada";
        if (tier === "rejected") break;
        if (TIER_RANK[tier] > max) max = TIER_RANK[tier];
      }
      preRejectMax.set(id, max);
    }
  }

  let preRejectMql = 0;
  let preRejectSql = 0;
  let preRejectCita = 0;
  for (const id of rejectedIds) {
    const max = preRejectMax.get(id) ?? -2;
    if (max >= TIER_RANK.mql) preRejectMql += 1;
    if (max >= TIER_RANK.sql) preRejectSql += 1;
    if (max >= TIER_RANK.cita) preRejectCita += 1;
  }

  const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
  const activeSql = cohort.filter((c) => c.tier !== "rejected" && tierReachedSql(c.tier)).length;
  const activeCita = cohort.filter((c) => c.tier !== "rejected" && tierReachedCita(c.tier)).length;

  /** Pipelines grandes con mucho rechazo histórico (HOGARES, INQ); no aplica a INSPIRA/GRUPO ELIJO. */
  const useGregorio = preRejectMql >= 20 && stage.mql >= 10 && preRejectMql > stage.mql;
  if (useGregorio) {
    snap.reachedMql = activeMql + preRejectMql;
    snap.reachedSql = activeSql + preRejectSql;
    snap.reachedCita = activeCita + preRejectCita;
  } else {
    snap.reachedMql = stage.mql;
    snap.reachedSql = stage.sql;
    snap.reachedCita = stage.cita;
  }

  return { stageMql: stage.mql, preRejectMql, usedGregorio: useGregorio };
}

export function buildStatusTierMap(
  statuses: Array<{ id: number; name: string; pipeline_id?: number }>,
  pipelineId: number,
): Map<number, KommoStageTier> {
  const map = new Map<number, KommoStageTier>();
  for (const s of statuses) {
    if (s.pipeline_id != null && s.pipeline_id !== pipelineId) continue;
    map.set(s.id, classifyKommoStageTier(s.name));
  }
  return map;
}
