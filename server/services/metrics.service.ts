import type {
  DashboardSnapshotDto,
  MetaSpendRowDto,
  PipelineRowDto,
} from "../../shared/types/dashboard.js";
import { getAllowedDashboardClients, isSupabaseConfigured } from "../config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../config/kommoControlReference.js";
import {
  dailyMetricsOnConflict,
  hasMetricsSourceColumn,
  withMetricsSource,
} from "../lib/dashboardMetricsDb.js";
import { currentMonthRange } from "../lib/dateRanges.js";
import { AppError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { rebuildDailyMetricsFromEvents } from "./kommo.service.js";
import { getMetaSpendFromDb } from "./meta.service.js";
import { getStaticSnapshot } from "./staticFallback.js";
import { sseHub } from "./sseHub.js";

function weekStartIso(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function buildMetaPeriod(metaSpend: MetaSpendRowDto[]): DashboardSnapshotDto["metaSpendPeriod"] {
  const dates = metaSpend.map((r) => r.date).filter(Boolean).sort();
  const start = dates[0] ?? "";
  const end = dates.at(-1) ?? "";
  return {
    start,
    end,
    sourceLabel: "Meta Ads · Supabase",
      note: "Conversaciones: Kommo created_at (cohorte · America/Mexico_City). Gasto: Meta. MQL+: etapa final del día de creación.",
  };
}

function mergeDailyWithMetaSpend(
  metricsRows: PipelineRowDto[],
  metaSpend: MetaSpendRowDto[],
): PipelineRowDto[] {
  const byKey = new Map<string, PipelineRowDto>();

  for (const row of metricsRows) {
    byKey.set(`${row.FECHA}::${row.CLIENTE}`, { ...row });
  }

  for (const spend of metaSpend) {
    const key = `${spend.date}::${spend.client}`;
    const existing = byKey.get(key);
    if (existing) {
      existing["GASTO TOTAL"] = spend.spend;
      existing["COSTO POR CITA"] =
        existing.CITAS > 0 ? spend.spend / existing.CITAS : existing["COSTO POR CITA"] ?? null;
      continue;
    }
    byKey.set(key, {
      FECHA: spend.date,
      SEMANA: weekStartIso(spend.date),
      MES: spend.date.slice(0, 7),
      CLIENTE: spend.client,
      CONVERSACIONES: 0,
      MQL: 0,
      SQL: 0,
      CITAS: 0,
      FIRMAS: 0,
      "GASTO TOTAL": spend.spend,
      "COSTO POR CITA": null,
    });
  }

  return Array.from(byKey.values()).sort(
    (a, b) => a.FECHA.localeCompare(b.FECHA) || a.CLIENTE.localeCompare(b.CLIENTE),
  );
}

function collectAvailableDates(metaSpend: MetaSpendRowDto[], daily: PipelineRowDto[]): string[] {
  const dates = new Set<string>();
  metaSpend.forEach((r) => dates.add(r.date));
  daily.forEach((r) => {
    if (r.FECHA) dates.add(r.FECHA);
  });
  return Array.from(dates).sort();
}

/** Aplica gasto Meta sobre filas existentes (no toca embudo Kommo). */
export async function mergeMetaSpendIntoDaily(since: string, until: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const metaSpend = await getMetaSpendFromDb(since, until);
  const useSource = await hasMetricsSourceColumn();
  const onConflict = await dailyMetricsOnConflict();
  for (const row of metaSpend) {
    let existingQuery = supabase
      .from("dashboard_metrics_daily")
      .select("conversaciones, mql, sql, citas, firmas")
      .eq("metric_date", row.date)
      .eq("client", row.client);
    if (useSource) {
      existingQuery = existingQuery.eq("metrics_source", "timeline");
    }
    const { data: existing } = await existingQuery.maybeSingle();

    const conversaciones = existing?.conversaciones ?? 0;

    const payload = await withMetricsSource(
      {
        metric_date: row.date,
        client: row.client,
        conversaciones,
        mql: existing?.mql ?? 0,
        sql: existing?.sql ?? 0,
        citas: existing?.citas ?? 0,
        firmas: existing?.firmas ?? 0,
        gasto_total: row.spend,
        mes: row.date.slice(0, 7),
        updated_at: new Date().toISOString(),
      },
      "timeline",
    );
    await supabase.from("dashboard_metrics_daily").upsert(payload, { onConflict });
  }

  // #region agent log
  fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
    body: JSON.stringify({
      sessionId: "a0037c",
      runId: "conv-meta-rule",
      hypothesisId: "H1",
      location: "metrics.service.ts:mergeMetaSpendIntoDaily",
      message: "conversaciones source",
      data: { conversacionesSource: "kommo", rows: metaSpend.length, since, until },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return metaSpend.length;
}

export async function rebuildMetricsFromSources(since?: string, until?: string): Promise<number> {
  const range = since && until ? { since, until } : currentMonthRange();
  const kommoRows = await rebuildDailyMetricsFromEvents(range.since, range.until);
  const metaRows = await mergeMetaSpendIntoDaily(range.since, range.until);
  return kommoRows + metaRows;
}

async function loadMetricsDaily(): Promise<PipelineRowDto[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data: metrics, error } = await supabase
    .from("dashboard_metrics_daily")
    .select("*")
    .order("metric_date", { ascending: true });

  if (error) throw new AppError(`Metrics load failed: ${error.message}`, 500);

  const allowed = getAllowedDashboardClients();
  return (metrics ?? [])
    .filter((row) => allowed.has(row.client as string))
    .map((row) => ({
    FECHA: row.metric_date as string,
    SEMANA: weekStartIso(row.metric_date as string),
    MES: (row.mes as string) ?? (row.metric_date as string).slice(0, 7),
    CLIENTE: row.client as string,
    CONVERSACIONES: (row.conversaciones as number) ?? 0,
    MQL: (row.mql as number) ?? 0,
    SQL: (row.sql as number) ?? 0,
    CITAS: (row.citas as number) ?? 0,
    FIRMAS: (row.firmas as number) ?? 0,
    "GASTO TOTAL": row.gasto_total != null ? Number(row.gasto_total) : null,
    "COSTO POR CITA":
      (row.citas as number) > 0 && row.gasto_total != null
        ? Number(row.gasto_total) / (row.citas as number)
        : null,
    METRICS_SOURCE:
      row.metrics_source != null
        ? (row.metrics_source as "timeline" | "census")
        : "timeline",
  }));
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshotDto> {
  if (!isSupabaseConfigured()) {
    return getStaticSnapshot();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return getStaticSnapshot();

  const metaSpend = await getMetaSpendFromDb();
  if (metaSpend.length === 0) {
    const fallback = getStaticSnapshot();
    return fallback;
  }

  const metricsRows = await loadMetricsDaily();
  const daily = mergeDailyWithMetaSpend(metricsRows, metaSpend);
  const metaSpendPeriod = buildMetaPeriod(metaSpend);
  const availableDates = collectAvailableDates(metaSpend, daily);
  const kommoDates = metricsRows.map((r) => r.FECHA).filter(Boolean).sort();
  const rangeStart = kommoDates[0] ?? metaSpendPeriod.start;
  const rangeEnd = kommoDates.at(-1) ?? metaSpendPeriod.end;
  const defaultDateRange = {
    start: rangeStart || metaSpendPeriod.start,
    end: rangeEnd || metaSpendPeriod.end,
  };

  const allowed = Array.from(getAllowedDashboardClients());
  const sdrRows: Array<{
    event_date: string;
    client: string;
    responsible_name: string | null;
    citas: number;
    firmas: number;
  }> = [];
  let sdrOffset = 0;
  const sdrPage = 1000;
  while (true) {
    const { data: page, error: sdrErr } = await supabase
      .from("kommo_lead_events")
      .select("event_date, client, responsible_name, citas, firmas")
      .in("client", allowed)
      .order("event_date", { ascending: true })
      .range(sdrOffset, sdrOffset + sdrPage - 1);
    if (sdrErr) throw new AppError(`SDR load failed: ${sdrErr.message}`, 500);
    if (!page?.length) break;
    sdrRows.push(...(page as typeof sdrRows));
    if (page.length < sdrPage) break;
    sdrOffset += sdrPage;
  }

  const sdrHistory = sdrRows.map((r) => ({
    FECHA: r.event_date as string,
    SEMANA: weekStartIso(r.event_date as string),
    MES: (r.event_date as string).slice(0, 7),
    CLIENTE: r.client as string,
    SDR: (r.responsible_name as string) ?? "Sin asignar",
    CITAS: (r.citas as number) ?? 0,
    FIRMAS: (r.firmas as number) ?? 0,
  }));

  return {
    daily,
    metaSpend,
    metaSpendPeriod,
    availableDates,
    defaultDateRange,
    sdrHistory: sdrHistory.length > 0 ? sdrHistory : getStaticSnapshot().sdrHistory,
    latestDate: availableDates.at(-1) ?? null,
    syncedAt: new Date().toISOString(),
    controlReference: KOMMO_CONTROL_REFERENCE,
  };
}

export type RefreshMetricsMode = "full" | "meta_only";

/** Si no pasas rango, reconstruye solo el mes en curso (comportamiento del scheduler). */
export async function refreshAndBroadcast(
  metricRange?: { since: string; until: string },
  options?: { kommoMode?: RefreshMetricsMode },
): Promise<DashboardSnapshotDto> {
  const range = metricRange ?? currentMonthRange();
  if (options?.kommoMode === "meta_only") {
    await mergeMetaSpendIntoDaily(range.since, range.until);
  } else {
    await rebuildMetricsFromSources(range.since, range.until);
  }
  const snapshot = await getDashboardSnapshot();
  sseHub.broadcast("snapshot_refreshed", snapshot);
  return snapshot;
}
