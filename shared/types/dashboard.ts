/** timeline = suma de cambios de etapa por día; census = inventario pipeline al corte */
export type MetricsSourceDto = "timeline" | "census";

export type PipelineRowDto = {
  FECHA: string;
  SEMANA?: string | null;
  MES?: string | null;
  CLIENTE: string;
  CONVERSACIONES: number;
  MQL: number;
  SQL: number;
  CITAS: number;
  FIRMAS: number;
  "GASTO TOTAL"?: number | null;
  "COSTO POR CITA"?: number | null;
  METRICS_SOURCE?: MetricsSourceDto;
};

export type MetaSpendRowDto = {
  date: string;
  client: string;
  accountName: string;
  accountId: string;
  spend: number;
  /** Leads Meta Insights (conversaciones diarias). */
  leads: number;
  source: string;
};

export type MetaSpendPeriodDto = {
  start: string;
  end: string;
  sourceLabel: string;
  note: string;
};

export type SdrHistoryRowDto = {
  FECHA: string;
  SEMANA: string;
  MES: string;
  CLIENTE: string;
  SDR: string;
  CITAS: number;
  FIRMAS: number;
};

export type DateRangeDto = {
  start: string;
  end: string;
};

/** Valores del HTML de referencia (index-1.html) por cliente. */
export type KommoControlClientDto = {
  leads: number;
  reachedMql: number;
  reachedSql: number;
  reachedCita: number;
  firmas: number;
};

export type KommoControlSnapshotDto = {
  snapshotDate: string;
  clients: Record<string, KommoControlClientDto>;
};

export type DashboardSnapshotDto = {
  daily: PipelineRowDto[];
  metaSpend: MetaSpendRowDto[];
  metaSpendPeriod: MetaSpendPeriodDto;
  /** Fechas con datos Meta sincronizados (calendario) */
  availableDates: string[];
  /** Rango por defecto alineado al sync Meta activo */
  defaultDateRange: DateRangeDto;
  sdrHistory: SdrHistoryRowDto[];
  latestDate: string | null;
  syncedAt: string;
  /** Fuente de verdad HTML para cuadrar KPIs en la fecha de corte. */
  controlReference: KommoControlSnapshotDto | null;
};

export type SseEventType =
  | "connected"
  | "snapshot_refreshed"
  | "meta_updated"
  | "kommo_updated"
  | "heartbeat";

export type SseMessageDto<T = unknown> = {
  type: SseEventType;
  payload?: T;
  timestamp: string;
};

export type SyncResultDto = {
  source: "meta" | "kommo" | "metrics";
  status: "success" | "error";
  recordsProcessed: number;
  message?: string;
};
