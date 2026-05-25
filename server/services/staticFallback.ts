import type { DashboardSnapshotDto } from "../../shared/types/dashboard.js";
import { pipelineData } from "../../client/src/lib/pipelineData.js";
import { metaSpendData, metaSpendPeriod } from "../../client/src/lib/metaSpendData.js";
import { sdrHistoryData } from "../../client/src/lib/sdrHistoryData.js";

export function getStaticSnapshot(): DashboardSnapshotDto {
  const daily = pipelineData.daily.map((row) => {
    const r = row as {
      FECHA?: string | null;
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
    return {
      FECHA: r.FECHA ?? "",
      SEMANA: r.SEMANA ?? null,
      MES: r.MES ?? null,
      CLIENTE: r.CLIENTE,
      CONVERSACIONES: r.CONVERSACIONES,
      MQL: r.MQL,
      SQL: r.SQL,
      CITAS: r.CITAS,
      FIRMAS: r.FIRMAS,
      "GASTO TOTAL": r["GASTO TOTAL"] ?? null,
      "COSTO POR CITA": r["COSTO POR CITA"] ?? null,
    };
  });

  const metaSpend = metaSpendData.map((row) => ({
    date: row.date,
    client: row.client,
    accountName: row.accountName,
    accountId: row.accountId,
    spend: row.spend,
    source: row.source,
  }));
  const spendDates = metaSpend.map((r) => r.date).sort();
  const availableDates = Array.from(new Set([...daily.map((r) => r.FECHA).filter(Boolean), ...spendDates])).sort();
  const latestDate = availableDates.at(-1) ?? null;

  return {
    daily,
    metaSpend,
    metaSpendPeriod: {
      start: spendDates[0] ?? metaSpendPeriod.start,
      end: spendDates.at(-1) ?? metaSpendPeriod.end,
      sourceLabel: metaSpendPeriod.sourceLabel,
      note: metaSpendPeriod.note,
    },
    availableDates,
    defaultDateRange: {
      start: spendDates[0] ?? metaSpendPeriod.start,
      end: spendDates.at(-1) ?? metaSpendPeriod.end,
    },
    sdrHistory: sdrHistoryData.records.map((row) => ({
      FECHA: row.FECHA,
      SEMANA: row.SEMANA,
      MES: row.MES,
      CLIENTE: row.CLIENTE,
      SDR: row.SDR,
      CITAS: row.CITAS,
      FIRMAS: row.FIRMAS,
    })),
    latestDate,
    syncedAt: new Date().toISOString(),
  };
}
