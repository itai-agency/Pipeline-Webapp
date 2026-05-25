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
};

export type MetaSpendRowDto = {
  date: string;
  client: string;
  accountName: string;
  accountId: string;
  spend: number;
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
