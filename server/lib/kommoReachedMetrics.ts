import {
  classifyKommoStageTier,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoClientSnapshot,
  type KommoStageTier,
} from "../config/kommoStageMap.js";
import { isKommoReachedRejectedTimelineEnabled } from "../config/env.js";
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

export type ReachedEnrichmentMode = "timeline" | "gregorio_gated";

export type ReachedEnrichmentResult = {
  stageMql: number;
  preRejectMql: number;
  usedGregorio: boolean;
  mode: ReachedEnrichmentMode;
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

type TimelineEvent = {
  kommo_lead_id: number;
  status_id: number | null;
  event_date: string;
  raw_payload: { created_at?: number } | null;
};

function eventSortKey(ev: TimelineEvent): number {
  const fromPayload = ev.raw_payload?.created_at;
  if (fromPayload != null && Number.isFinite(fromPayload)) return fromPayload;
  return Math.floor(new Date(`${ev.event_date}T12:00:00`).getTime() / 1000);
}

function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => eventSortKey(a) - eventSortKey(b));
}

/**
 * Decide reached* a partir de activos, columna de etapa y pre-rechazo en timeline.
 * Rollback: KOMMO_REACHED_REJECTED_TIMELINE=false → umbral Gregorio legacy.
 */
export function resolveReachedEnrichment(params: {
  timelineMode: boolean;
  stage: { mql: number; sql: number; cita: number };
  activeMql: number;
  activeSql: number;
  activeCita: number;
  preRejectMql: number;
  preRejectSql: number;
  preRejectCita: number;
}): {
  reachedMql: number;
  reachedSql: number;
  reachedCita: number;
  usedGregorio: boolean;
  mode: ReachedEnrichmentMode;
} {
  const {
    timelineMode,
    stage,
    activeMql,
    activeSql,
    activeCita,
    preRejectMql,
    preRejectSql,
    preRejectCita,
  } = params;

  if (timelineMode) {
    return {
      reachedMql: activeMql + preRejectMql,
      reachedSql: activeSql + preRejectSql,
      reachedCita: activeCita + preRejectCita,
      usedGregorio: true,
      mode: "timeline",
    };
  }

  const useGregorio = preRejectMql >= 20 && stage.mql >= 10 && preRejectMql > stage.mql;
  if (useGregorio) {
    return {
      reachedMql: activeMql + preRejectMql,
      reachedSql: activeSql + preRejectSql,
      reachedCita: activeCita + preRejectCita,
      usedGregorio: true,
      mode: "gregorio_gated",
    };
  }

  return {
    reachedMql: stage.mql,
    reachedSql: stage.sql,
    reachedCita: stage.cita,
    usedGregorio: false,
    mode: "gregorio_gated",
  };
}

/**
 * reachedMql = activos en MQL+ + rechazados cuyo máximo tier ANTES del primer
 * evento "rechazado" fue MQL+ (timeline Supabase / eventos Kommo).
 */
export async function enrichSnapshotReachedFromTimeline(
  supabase: SupabaseClient,
  snap: KommoClientSnapshot,
  cohort: CohortLead[],
  statusTierById: Map<number, KommoStageTier>,
  cutoffDate: string,
): Promise<ReachedEnrichmentResult> {
  const stage = stageColumnReached(snap);
  const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);

  const preRejectMax = new Map<number, number>();
  const chunk = 200;
  for (let i = 0; i < rejectedIds.length; i += chunk) {
    const ids = rejectedIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, status_id, event_date, raw_payload")
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
      list.push({
        kommo_lead_id: id,
        status_id: row.status_id as number | null,
        event_date: row.event_date as string,
        raw_payload: row.raw_payload as TimelineEvent["raw_payload"],
      });
      byLead.set(id, list);
    }

    for (const [id, events] of byLead) {
      let max = -2;
      for (const ev of sortTimelineEvents(events)) {
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

  const resolved = resolveReachedEnrichment({
    timelineMode: isKommoReachedRejectedTimelineEnabled(),
    stage,
    activeMql,
    activeSql,
    activeCita,
    preRejectMql,
    preRejectSql,
    preRejectCita,
  });

  snap.reachedMql = resolved.reachedMql;
  snap.reachedSql = resolved.reachedSql;
  snap.reachedCita = resolved.reachedCita;

  return {
    stageMql: stage.mql,
    preRejectMql,
    usedGregorio: resolved.usedGregorio,
    mode: resolved.mode,
  };
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
