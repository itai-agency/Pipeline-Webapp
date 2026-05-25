import { useCallback, useEffect, useState } from "react";
import type { DashboardSnapshotDto } from "@shared/types/dashboard";
import { fetchDashboardSnapshot, subscribeDashboardSse } from "@/lib/api/dashboard";
import { getCurrentMonthRange } from "@/lib/dateRanges";
import { pipelineData } from "@/lib/pipelineData";
import { metaSpendData, metaSpendPeriod } from "@/lib/metaSpendData";
import { sdrHistoryData } from "@/lib/sdrHistoryData";
import type { PipelineRow } from "@/lib/pipelineData";
import type { MetaSpendRow } from "@/lib/metaSpendData";
import type { SdrHistoryRow } from "@/lib/sdrHistoryData";

function staticFallbackSnapshot(): DashboardSnapshotDto {
  const monthRange = getCurrentMonthRange();
  const daily = pipelineData.daily as PipelineRow[];
  const dates = daily.map((r) => r.FECHA).filter(Boolean).sort() as string[];
  return {
    daily: daily.map((row) => ({
      FECHA: row.FECHA ?? "",
      SEMANA: row.SEMANA ?? null,
      MES: row.MES ?? null,
      CLIENTE: row.CLIENTE,
      CONVERSACIONES: row.CONVERSACIONES,
      MQL: row.MQL,
      SQL: row.SQL,
      CITAS: row.CITAS,
      FIRMAS: row.FIRMAS,
      "GASTO TOTAL": row["GASTO TOTAL"] ?? null,
      "COSTO POR CITA": row["COSTO POR CITA"] ?? null,
    })),
    metaSpend: metaSpendData as MetaSpendRow[],
    metaSpendPeriod: {
      start: metaSpendPeriod.start,
      end: metaSpendPeriod.end,
      sourceLabel: metaSpendPeriod.sourceLabel,
      note: metaSpendPeriod.note,
    },
    sdrHistory: sdrHistoryData.records as unknown as SdrHistoryRow[],
    latestDate: dates.at(-1) ?? null,
    availableDates: dates,
    defaultDateRange: {
      start: monthRange.start,
      end: monthRange.end,
    },
    syncedAt: new Date().toISOString(),
  };
}

export type DashboardDataState = {
  snapshot: DashboardSnapshotDto;
  loading: boolean;
  error: string | null;
  live: boolean;
  refresh: () => Promise<void>;
};

export function useDashboardData(): DashboardDataState {
  const [snapshot, setSnapshot] = useState<DashboardSnapshotDto>(staticFallbackSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const applySnapshot = useCallback((next: DashboardSnapshotDto) => {
    setSnapshot(next);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardSnapshot();
      applySnapshot(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar dashboard";
      setError(message);
      applySnapshot(staticFallbackSnapshot());
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeDashboardSse({
      onConnected: (data) => {
        setLive(true);
        applySnapshot(data);
        setLoading(false);
      },
      onSnapshotRefreshed: applySnapshot,
      onMetaUpdated: () => {
        void refresh();
      },
      onKommoUpdated: () => {
        void refresh();
      },
      onError: () => setLive(false),
    });
    return unsubscribe;
  }, [applySnapshot, refresh]);

  return { snapshot, loading, error, live, refresh };
}
