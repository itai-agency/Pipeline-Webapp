/**
 * Auditoría mayo 2026: HTML (fuente verdad) vs BD vs lo que muestra el dashboard.
 */
import "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import { getAllowedDashboardClients, isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { hasLeadCreatedDateColumn, hasMetricsSourceColumn } from "../server/lib/dashboardMetricsDb.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { buildKommoPipelineSnapshots } from "../server/services/kommo.service.js";

const SINCE = "2026-05-01";
const UNTIL = "2026-05-26";
const CUTOFF = KOMMO_CONTROL_REFERENCE.snapshotDate;

type EventRow = {
  event_date: string;
  conversations: number;
  mql: number;
  sql: number;
  citas: number;
  kommo_event_id: string | null;
  lead_created_date?: string | null;
};

async function fetchAllEvents(client: string, since: string, until: string): Promise<EventRow[]> {
  const supabase = getSupabaseAdmin()!;
  const useCreated = await hasLeadCreatedDateColumn();
  const all: EventRow[] = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select(
        useCreated
          ? "event_date, conversations, mql, sql, citas, kommo_event_id, lead_created_date"
          : "event_date, conversations, mql, sql, citas, kommo_event_id",
      )
      .eq("client", client)
      .gte("event_date", since)
      .lte("event_date", until)
      .order("event_date", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as EventRow[]));
    if (data.length < page) break;
    offset += page;
  }
  return all;
}

async function fetchDailyMetrics(
  client: string,
  since: string,
  until: string,
  source?: "timeline" | "census",
): Promise<
  Array<{ metric_date: string; conversaciones: number; mql: number; sql: number; citas: number }>
> {
  const supabase = getSupabaseAdmin()!;
  const useSource = await hasMetricsSourceColumn();
  const all: Array<{
    metric_date: string;
    conversaciones: number;
    mql: number;
    sql: number;
    citas: number;
  }> = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    let q = supabase
      .from("dashboard_metrics_daily")
      .select("metric_date, conversaciones, mql, sql, citas, metrics_source")
      .eq("client", client)
      .gte("metric_date", since)
      .lte("metric_date", until)
      .order("metric_date", { ascending: true })
      .range(offset, offset + page - 1);
    if (useSource && source) {
      q = q.eq("metrics_source", source);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (useSource && source && row.metrics_source !== source) continue;
      if (useSource && !source && row.metrics_source === "census") continue;
      all.push(row as typeof all[0]);
    }
    if (data.length < page) break;
    offset += page;
  }
  return all;
}

function sum(rows: Array<{ conversaciones?: number; mql?: number; conversations?: number }>) {
  return rows.reduce(
    (a, r) => ({
      conv: a.conv + (Number(r.conversaciones ?? r.conversations) || 0),
      mql: a.mql + (Number(r.mql) || 0),
    }),
    { conv: 0, mql: 0 },
  );
}

function inCreatedMonth(row: EventRow, since: string, until: string): boolean {
  if (!row.lead_created_date) return true;
  return row.lead_created_date >= since && row.lead_created_date <= until;
}

function fmtDelta(actual: number | null, expected: number, label: string): string {
  if (actual == null) return `${label}: n/d`;
  const d = actual - expected;
  const sign = d > 0 ? "+" : "";
  const ok = d === 0 ? "OK" : "≠";
  return `${label}: ${actual} (HTML ${expected}, ${sign}${d}) ${ok}`;
}

function printClientBlock(params: {
  client: string;
  htmlLeads: number;
  htmlMql: number;
  censusLeads: number | null;
  censusMql: number | null;
  dashSum: { conv: number; mql: number };
  day26: { conv: number; mql: number };
  eventsAll: { conv: number; mql: number; rows: number };
  eventsCreatedMonth: { conv: number; mql: number; rows: number };
  excludedByCreatedMonth: number;
  apiLeads: number | null;
  eventDays: number;
  dashDays: number;
}): void {
  const p = params;
  console.log(`\n┌─ ${p.client} ${"─".repeat(Math.max(0, 58 - p.client.length))}`);
  console.log(`│  REFERENCIA HTML (corte ${CUTOFF})`);
  console.log(`│    Leads en pipeline: ${p.htmlLeads}`);
  console.log(`│    reachedMql:        ${p.htmlMql}`);
  console.log(`│`);
  console.log(`│  CENSO API guardado el ${UNTIL} (inventario estado actual)`);
  console.log(`│    ${fmtDelta(p.censusLeads, p.htmlLeads, "Leads")}`);
  console.log(`│    ${fmtDelta(p.censusMql, p.htmlMql, "MQL")}`);
  if (p.apiLeads != null && p.censusLeads != null && p.apiLeads !== p.censusLeads) {
    console.log(`│    API en vivo ahora: ${p.apiLeads} (BD census ${p.censusLeads})`);
  }
  console.log(`│`);
  console.log(`│  DASHBOARD — suma mayo 1–26 (timeline, solo leads creados en mayo)`);
  console.log(`│    Conversaciones: ${p.dashSum.conv}  ← esto ven los KPIs grandes`);
  console.log(`│    MQL:            ${p.dashSum.mql}`);
  console.log(`│    vs HTML leads:  ${p.dashSum.conv} vs ${p.htmlLeads} (no comparables: actividad vs inventario)`);
  console.log(`│`);
  console.log(`│  Solo día ${UNTIL} (timeline)`);
  console.log(`│    Conversaciones: ${p.day26.conv}   MQL: ${p.day26.mql}`);
  console.log(`│`);
  console.log(`│  EVENTOS en BD (movimientos de etapa en mayo)`);
  console.log(`│    Sin filtro creación:     ${p.eventsAll.rows} filas → conv ${p.eventsAll.conv}`);
  console.log(`│    Solo creados en mayo:    ${p.eventsCreatedMonth.rows} filas → conv ${p.eventsCreatedMonth.conv}`);
  if (p.excludedByCreatedMonth > 0) {
    console.log(`│    Excluidos (creados antes): ${p.excludedByCreatedMonth} filas`);
  }
  if (p.eventsCreatedMonth.conv !== p.dashSum.conv) {
    console.log(`│    ⚠ Eventos (creados mayo) ${p.eventsCreatedMonth.conv} ≠ Dashboard ${p.dashSum.conv}`);
    console.log(`│      → npm run rebuild:kommo-daily -- --since ${SINCE} --until ${UNTIL}`);
  } else {
    console.log(`│    ✓ Eventos y dashboard coinciden (${p.dashSum.conv})`);
  }
  console.log(`│    Días con datos: eventos ${p.eventDays} | métricas diarias ${p.dashDays}`);
  console.log(`└${"─".repeat(62)}`);
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Sin Supabase");
    process.exit(1);
  }

  const useSource = await hasMetricsSourceColumn();
  const useCreated = await hasLeadCreatedDateColumn();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  AUDITORÍA MAYO  ${SINCE} → ${UNTIL}`);
  console.log(`  Comparado con HTML del jefe (corte ${CUTOFF})`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\nMigraciones: metrics_source=${useSource ? "sí" : "no"} | lead_created_date=${useCreated ? "sí" : "no"}`);
  if (!useCreated) {
    console.log("  ⚠ Sin 005: el dashboard NO puede filtrar por mes de creación del lead.");
  } else {
    console.log("  Regla activa: solo cuentan leads con lead_created_date dentro de mayo.");
  }

  console.log("\n── Cómo leer esto ──");
  console.log("  • HTML leads     = inventario al 26/05 (cuántos leads hay en pipeline)");
  console.log("  • BD census      = mismo inventario vía API Kommo (suele ≠ HTML por filtros)");
  console.log("  • Dashboard Σ    = suma de MOVIMIENTOS de leads creados en mayo (no es inventario)");
  console.log("  • HTML reachedMql = embudo Gregorio (no es suma MQL del mes)");

  let apiCensus: Awaited<ReturnType<typeof buildKommoPipelineSnapshots>> | null = null;
  if (isKommoConfigured()) {
    try {
      apiCensus = await buildKommoPipelineSnapshots();
    } catch (e) {
      console.error("\nAPI Kommo censo en vivo falló:", e instanceof Error ? e.message : e);
    }
  }

  const clients = Array.from(getAllowedDashboardClients()).sort();
  const totals = { htmlLeads: 0, census: 0, dash: 0, eventsRaw: 0, eventsMay: 0 };

  for (const client of clients) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!html) continue;

    const events = await fetchAllEvents(client, SINCE, UNTIL);
    const timelineOnly = events.filter((e) => e.kommo_event_id != null);
    const createdMonth = timelineOnly.filter((e) => inCreatedMonth(e, SINCE, UNTIL));
    const excluded = timelineOnly.length - createdMonth.length;

    const daily = await fetchDailyMetrics(client, SINCE, UNTIL, useSource ? "timeline" : undefined);
    const day26 = daily.filter((r) => r.metric_date === UNTIL);

    let censusRow: { conversaciones: number; mql: number } | null = null;
    if (useSource) {
      const c = await fetchDailyMetrics(client, UNTIL, UNTIL, "census");
      if (c[0]) censusRow = { conversaciones: c[0].conversaciones, mql: c[0].mql };
    }

    const sEvAll = sum(timelineOnly);
    const sEvMay = sum(createdMonth);
    const sDash = sum(daily);
    const s26 = sum(day26);
    const api = apiCensus?.find((s) => s.client === client);

    totals.htmlLeads += html.leads;
    totals.census += censusRow?.conversaciones ?? 0;
    totals.dash += sDash.conv;
    totals.eventsRaw += sEvAll.conv;
    totals.eventsMay += sEvMay.conv;

    printClientBlock({
      client,
      htmlLeads: html.leads,
      htmlMql: html.reachedMql,
      censusLeads: censusRow?.conversaciones ?? null,
      censusMql: censusRow?.mql ?? null,
      dashSum: sDash,
      day26: s26,
      eventsAll: { ...sEvAll, rows: timelineOnly.length },
      eventsCreatedMonth: { ...sEvMay, rows: createdMonth.length },
      excludedByCreatedMonth: excluded,
      apiLeads: api?.leads ?? null,
      eventDays: new Set(timelineOnly.map((e) => e.event_date)).size,
      dashDays: daily.length,
    });
  }

  let htmlMatch = 0;
  let htmlTotal = 0;
  for (const client of clients) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!html) continue;
    htmlTotal += 1;
    const c = await fetchDailyMetrics(client, UNTIL, UNTIL, useSource ? "census" : undefined);
    const census = c[0];
    if (
      census &&
      census.conversaciones === html.leads &&
      census.mql === html.reachedMql &&
      census.sql === html.reachedSql &&
      census.citas === html.reachedCita
    ) {
      htmlMatch += 1;
    }
  }

  console.log("\n══ Censo API en BD vs HTML (solo auditoría; fuente operativa = Kommo API) ══");
  console.log(`  Clientes con leads+mql+sql+citas idénticos al HTML: ${htmlMatch}/${htmlTotal}`);
  if (htmlMatch < htmlTotal) {
    console.log("  → npm run sync:kommo-snapshot (cohorte created_at, sin copiar HTML)");
    console.log("  Δ en reachedMql es normal si el HTML usa historial manual (Gregorio).");
  } else {
    console.log("  ✓ Censo API coincide con HTML en esta fecha de corte.");
  }

  console.log("\n══ TOTALES (referencia) ══");
  console.log(`  HTML leads:              ${totals.htmlLeads}`);
  console.log(`  BD census:               ${totals.census}`);
  console.log(`  Dashboard Σ (timeline):  ${totals.dash}  (solo si fin ≠ corte HTML)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
