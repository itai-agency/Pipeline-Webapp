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
};

/** Inferencia por nombre de etapa Kommo (puede afinarse con KOMMO_STATUS_MAP en .env). */
export function inferStageFromStatusName(statusName: string): StageCounts {
  const n = statusName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/perdid|lost|rechaz|descart|basura|spam|no califica/.test(n)) return EMPTY_STAGE;
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
    map[String(status.id)] = inferStageFromStatusName(status.name);
  }
  return map;
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
  statusMap: Record<string, StageCounts>,
): StageCounts {
  let stage: StageCounts;
  if (!statusId) {
    stage = CONVERSATION_STAGE;
  } else {
    const mapped = statusMap[String(statusId)];
    if (mapped) {
      stage = mapped;
    } else {
      const envOverride = parseEnvStatusMap()[String(statusId)];
      if (!envOverride) {
        stage = CONVERSATION_STAGE;
      } else {
        stage = {
          conversaciones: envOverride.conversaciones ?? 0,
          mql: envOverride.mql ?? 0,
          sql: envOverride.sql ?? 0,
          citas: envOverride.citas ?? 0,
          firmas: envOverride.firmas ?? 0,
        };
      }
    }
  }
  return toCumulativeStageCounts(stage);
}

export function getKommoApiBase(): string {
  if (!env.KOMMO_SUBDOMAIN) return "";
  return `https://${env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}
