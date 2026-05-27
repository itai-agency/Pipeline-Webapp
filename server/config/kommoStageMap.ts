import { env } from "./env.js";

export type StageCounts = {
  conversaciones: number;
  mql: number;
  sql: number;
  citas: number;
  firmas: number;
};

const EMPTY_STAGE: StageCounts = {
  conversaciones: 0,
  mql: 0,
  sql: 0,
  citas: 0,
  firmas: 0,
};

const CONVERSATION_STAGE: StageCounts = {
  conversaciones: 1,
  mql: 0,
  sql: 0,
  citas: 0,
  firmas: 0,
};

export type KommoStatusInfo = {
  id: number;
  name: string;
  pipeline_id?: number;
  /** 0 = en curso, 1 = ganado (excluir del censo), 2 = perdido */
  type?: number;
};

/** Etapa única por lead (snapshot Kommo — alineado al HTML de control). */
export type KommoStageTier = "rejected" | "entrada" | "mql" | "sql" | "cita" | "ofertado" | "firmado";

export type KommoClientSnapshot = {
  client: string;
  leads: number;
  reachedMql: number;
  reachedSql: number;
  reachedCita: number;
  reachedFirmas: number;
  byTier: Record<KommoStageTier, number>;
};

const TIER_ORDER: KommoStageTier[] = ["rejected", "entrada", "mql", "sql", "cita", "ofertado", "firmado"];

function normalizeStatusName(statusName: string): string {
  return statusName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Clasifica cada lead en una sola etapa (censo actual del pipeline). */
export function classifyKommoStageTier(statusName: string): KommoStageTier {
  const n = normalizeStatusName(statusName);
  if (/perdid|lost|rechaz|descart|basura|spam/.test(n)) return "rejected";
  if (/firma|contrato|ganad|won|cerrado gan|closed won|venta/.test(n)) return "firmado";
  if (/ofertado|oferta/.test(n)) return "ofertado";
  if (/cita|appointment|agenda|visita|showing/.test(n)) return "cita";
  if (/\bsql\b|oportunidad calificada|propuesta/.test(n)) return "sql";
  if (/\bmql\b|calificado|qualified/.test(n)) return "mql";
  return "entrada";
}

function tierReachedMql(tier: KommoStageTier): boolean {
  return tier === "mql" || tier === "sql" || tier === "cita" || tier === "ofertado" || tier === "firmado";
}

function tierReachedSql(tier: KommoStageTier): boolean {
  return tier === "sql" || tier === "cita" || tier === "ofertado" || tier === "firmado";
}

function tierReachedCita(tier: KommoStageTier): boolean {
  return tier === "cita" || tier === "ofertado" || tier === "firmado";
}

export function emptySnapshotByTier(): Record<KommoStageTier, number> {
  return Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<KommoStageTier, number>;
}

/** Métricas diarias desde snapshot (leads totales + reached* del embudo). */
export function metricsFromClientSnapshot(snapshot: KommoClientSnapshot): StageCounts {
  return {
    conversaciones: snapshot.leads,
    mql: snapshot.reachedMql,
    sql: snapshot.reachedSql,
    citas: snapshot.reachedCita,
    firmas: snapshot.reachedFirmas,
  };
}

export function accumulateSnapshotTier(
  acc: KommoClientSnapshot,
  tier: KommoStageTier,
): KommoClientSnapshot {
  acc.leads += 1;
  acc.byTier[tier] += 1;
  if (tierReachedMql(tier)) acc.reachedMql += 1;
  if (tierReachedSql(tier)) acc.reachedSql += 1;
  if (tierReachedCita(tier)) acc.reachedCita += 1;
  if (tier === "firmado") acc.reachedFirmas += 1;
  return acc;
}

export function newClientSnapshot(client: string): KommoClientSnapshot {
  return {
    client,
    leads: 0,
    reachedMql: 0,
    reachedSql: 0,
    reachedCita: 0,
    reachedFirmas: 0,
    byTier: emptySnapshotByTier(),
  };
}

/** Inferencia por nombre de etapa Kommo (puede afinarse con KOMMO_STATUS_MAP en .env). */
export function inferStageFromStatusName(statusName: string): StageCounts {
  const n = statusName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /** Volumen sí (como data control); embudo MQL/SQL no. */
  if (/perdid|lost|rechaz|descart|basura|spam/.test(n)) {
    return { conversaciones: 1, mql: 0, sql: 0, citas: 0, firmas: 0 };
  }
  if (/no califica/.test(n) && !/por calificar/.test(n)) return EMPTY_STAGE;
  if (/firma|contrato|ganad|won|cerrado gan|closed won|venta/.test(n)) {
    return { conversaciones: 0, mql: 0, sql: 0, citas: 0, firmas: 1 };
  }
  if (/cita|appointment|agenda|visita|showing/.test(n)) {
    return { conversaciones: 0, mql: 0, sql: 0, citas: 1, firmas: 0 };
  }
  if (/\bsql\b|oportunidad calificada|propuesta/.test(n)) {
    return { conversaciones: 0, mql: 0, sql: 1, citas: 0, firmas: 0 };
  }
  if (/\bmql\b|calificado|qualified/.test(n)) {
    return { conversaciones: 0, mql: 1, sql: 0, citas: 0, firmas: 0 };
  }
  return CONVERSATION_STAGE;
}

/** Embudo acumulativo: un lead en SQL cuenta también como MQL y conversación. */
export function toCumulativeStageCounts(stage: StageCounts): StageCounts {
  if (stage.firmas > 0) {
    return { conversaciones: 1, mql: 1, sql: 1, citas: 1, firmas: 1 };
  }
  if (stage.citas > 0) {
    return { conversaciones: 1, mql: 1, sql: 1, citas: 1, firmas: 0 };
  }
  if (stage.sql > 0) {
    return { conversaciones: 1, mql: 1, sql: 1, citas: 0, firmas: 0 };
  }
  if (stage.mql > 0) {
    return { conversaciones: 1, mql: 1, sql: 0, citas: 0, firmas: 0 };
  }
  if (stage.conversaciones > 0) {
    return { conversaciones: 1, mql: 0, sql: 0, citas: 0, firmas: 0 };
  }
  return EMPTY_STAGE;
}

export function buildStatusMapFromKommo(statuses: KommoStatusInfo[]): Record<string, StageCounts> {
  const map: Record<string, StageCounts> = {};
  for (const status of statuses) {
    const stage = inferStageFromStatusName(status.name);
    if (status.pipeline_id != null) {
      map[`${status.pipeline_id}:${status.id}`] = stage;
    }
    map[String(status.id)] = stage;
  }
  return map;
}

export function resolveStatusStage(
  statusId: number | undefined,
  pipelineId: number | undefined,
  statusMap: Record<string, StageCounts>,
): StageCounts {
  if (!statusId) return CONVERSATION_STAGE;
  if (pipelineId != null) {
    const scoped = statusMap[`${pipelineId}:${statusId}`];
    if (scoped) return scoped;
  }
  return statusMap[String(statusId)] ?? CONVERSATION_STAGE;
}

function parseEnvStatusMap(): Record<string, Partial<StageCounts>> {
  try {
    const raw = process.env.KOMMO_STATUS_MAP ?? "{}";
    return JSON.parse(raw) as Record<string, Partial<StageCounts>>;
  } catch {
    return {};
  }
}

export function getStageFromKommoStatus(
  statusId: number | undefined,
  pipelineId: number | undefined,
  statusMap: Record<string, StageCounts>,
): StageCounts {
  let stage: StageCounts;
  if (!statusId) {
    stage = CONVERSATION_STAGE;
  } else {
    const envOverride = parseEnvStatusMap()[String(statusId)];
    if (envOverride) {
      stage = {
        conversaciones: envOverride.conversaciones ?? 0,
        mql: envOverride.mql ?? 0,
        sql: envOverride.sql ?? 0,
        citas: envOverride.citas ?? 0,
        firmas: envOverride.firmas ?? 0,
      };
    } else {
      stage = resolveStatusStage(statusId, pipelineId, statusMap);
    }
  }
  return toCumulativeStageCounts(stage);
}

export function getKommoApiBase(): string {
  if (!env.KOMMO_SUBDOMAIN) return "";
  return `https://${env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}
