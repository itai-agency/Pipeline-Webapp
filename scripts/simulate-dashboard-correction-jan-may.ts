/**
 * Simula corrección del dashboard con datos de auditoría (ene–may 2026).
 * Compara: dashboard actual | dashboard corregido | referencia Kommo (API + motivo).
 *
 * Uso: node --use-system-ca --import tsx scripts/simulate-dashboard-correction-jan-may.ts
 */
import "../server/config/env.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getKommoClientMap, isKommoConfigured } from "../server/config/env.js";
import {
  accumulateSnapshotTier,
  classifyKommoStageTier,
  newClientSnapshot,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoClientSnapshot,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { hasMetricsSourceColumn } from "../server/lib/dashboardMetricsDb.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import {
  buildStatusTierMap,
  enrichSnapshotReachedFromTimeline,
  stageColumnReached,
} from "../server/lib/kommoReachedMetrics.js";
import { buildKommoMonthlyCohortSnapshots } from "../server/services/kommo.service.js";
import { fetchKommoStatuses } from "../server/services/kommo.service.js";
import {
  loadLossReasonCatalog,
  loadTimelinesForLeads,
  computeMaxPreRejectTier,
  motivoTierFromName,
  motivoRank,
  TIER_RANK,
  type TimelineRow,
} from "./lib/rejectionAuditShared.js";

const MONTHS: Array<{ label: string; since: string; until: string }> = [
  { label: "2026-01", since: "2026-01-01", until: "2026-01-31" },
  { label: "2026-02", since: "2026-02-01", until: "2026-02-28" },
  { label: "2026-03", since: "2026-03-01", until: "2026-03-31" },
  { label: "2026-04", since: "2026-04-01", until: "2026-04-30" },
  { label: "2026-05", since: "2026-05-01", until: "2026-05-31" },
];

type MonthClientRow = {
  month: string;
  client: string;
  kommo_conv: number;
  kommo_activos_mql: number;
  kommo_reached_mql_audit: number;
  kommo_reached_sql_audit: number;
  kommo_reached_cita_audit: number;
  dashboard_actual_mql: number;
  dashboard_corrected_mql: number;
  dash_stored_conv: number;
  dash_stored_mql: number;
  delta_actual_vs_audit: number;
  delta_corrected_vs_audit: number;
  delta_corrected_vs_actual: number;
  conv_ok: boolean;
  worth_correcting: boolean;
};

function effectivePreRejectRank(
  timelineRank: number,
  lossReasonName: string | null,
): number {
  const mt = motivoTierFromName(lossReasonName);
  const mr = motivoRank(mt);
  if (mt === "mql" || mt === "sql" || mt === "cita") {
    return Math.max(timelineRank, mr);
  }
  return timelineRank;
}

async function buildAuditReferenceSnapshot(
  client: string,
  pipelineId: number,
  monthStart: string,
  monthEnd: string,
  statusTierById: Map<number, KommoStageTier>,
  lossReasons: Map<number, string>,
): Promise<{
  conv: number;
  activosMql: number;
  reachedMql: number;
  reachedSql: number;
  reachedCita: number;
}> {
  const { from, to } = toAccountUnixRange(monthStart, monthEnd);
  const cohort: Array<{
    id: number;
    tier: KommoStageTier;
    loss_reason_id: number | null;
  }> = [];

  let page = 1;
  while (true) {
    const data = await kommoGet<{
      _embedded?: {
        leads?: Array<{
          id: number;
          status_id?: number;
          loss_reason_id?: number | null;
        }>;
      };
    }>("/leads", {
      params: {
        page,
        limit: 250,
        "filter[pipeline_id]": pipelineId,
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
      timeout: 120_000,
    });
    const rows = data._embedded?.leads ?? [];
    for (const l of rows) {
      const tier = statusTierById.get(l.status_id ?? 0) ?? "entrada";
      if (tier === "firmado") continue;
      cohort.push({ id: l.id, tier, loss_reason_id: l.loss_reason_id ?? null });
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }

  let activosMql = 0;
  let activosSql = 0;
  let activosCita = 0;
  const rejected = cohort.filter((c) => c.tier === "rejected");
  const rejectedIds = rejected.map((c) => c.id);

  for (const c of cohort) {
    if (c.tier === "rejected") continue;
    if (tierReachedMql(c.tier)) activosMql += 1;
    if (tierReachedSql(c.tier)) activosSql += 1;
    if (tierReachedCita(c.tier)) activosCita += 1;
  }

  const timelines = await loadTimelinesForLeads(client, rejectedIds);
  let preMql = 0;
  let preSql = 0;
  let preCita = 0;

  for (const r of rejected) {
    const events = timelines.get(r.id) ?? [];
    const { maxRank } = computeMaxPreRejectTier(events as TimelineRow[], statusTierById);
    const motivo = r.loss_reason_id != null ? (lossReasons.get(r.loss_reason_id) ?? null) : null;
    const rank = effectivePreRejectRank(maxRank, motivo);
    if (rank >= TIER_RANK.mql) preMql += 1;
    if (rank >= TIER_RANK.sql) preSql += 1;
    if (rank >= TIER_RANK.cita) preCita += 1;
  }

  return {
    conv: cohort.length,
    activosMql,
    reachedMql: activosMql + preMql,
    reachedSql: activosSql + preSql,
    reachedCita: activosCita + preCita,
  };
}

async function buildCorrectedReachedSnapshot(
  snap: KommoClientSnapshot,
  cohort: Array<{ id: number; tier: KommoStageTier }>,
  client: string,
  monthEnd: string,
  statusTierById: Map<number, KommoStageTier>,
  lossReasons: Map<number, string>,
): Promise<{ reachedMql: number; reachedSql: number; reachedCita: number }> {
  const rejected = cohort.filter((c) => c.tier === "rejected");
  const rejectedIds = rejected.map((c) => c.id);

  const lossByLead = new Map<number, string | null>();
  for (let i = 0; i < rejectedIds.length; i += 250) {
    const chunk = rejectedIds.slice(i, i + 250);
    const params = chunk.map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet<{
      _embedded?: { leads?: Array<{ id?: number; loss_reason_id?: number | null }> };
    }>(`/leads?${params}`, { params: { limit: 250 }, timeout: 120_000 });
    for (const l of data._embedded?.leads ?? []) {
      if (typeof l.id !== "number") continue;
      const name = l.loss_reason_id != null ? (lossReasons.get(l.loss_reason_id) ?? null) : null;
      lossByLead.set(l.id, name);
    }
  }

  const timelines = await loadTimelinesForLeads(client, rejectedIds);
  let preMql = 0;
  let preSql = 0;
  let preCita = 0;

  for (const id of rejectedIds) {
    const events = timelines.get(id) ?? [];
    const { maxRank } = computeMaxPreRejectTier(events as TimelineRow[], statusTierById);
    const rank = effectivePreRejectRank(maxRank, lossByLead.get(id) ?? null);
    if (rank >= TIER_RANK.mql) preMql += 1;
    if (rank >= TIER_RANK.sql) preSql += 1;
    if (rank >= TIER_RANK.cita) preCita += 1;
  }

  const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
  const activeSql = cohort.filter((c) => c.tier !== "rejected" && tierReachedSql(c.tier)).length;
  const activeCita = cohort.filter((c) => c.tier !== "rejected" && tierReachedCita(c.tier)).length;

  return {
    reachedMql: activeMql + preMql,
    reachedSql: activeSql + preSql,
    reachedCita: activeCita + preCita,
  };
}

async function sumDashboardStored(
  client: string,
  since: string,
  until: string,
): Promise<{ conv: number; mql: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { conv: 0, mql: 0 };

  const useSource = await hasMetricsSourceColumn();
  let q = supabase
    .from("dashboard_metrics_daily")
    .select("conversaciones, mql")
    .eq("client", client)
    .gte("metric_date", since)
    .lte("metric_date", until);
  if (useSource) q = q.eq("metrics_source", "timeline");

  const { data } = await q;
  const rows = data ?? [];
  return {
    conv: rows.reduce((s, r) => s + ((r.conversaciones as number) ?? 0), 0),
    mql: rows.reduce((s, r) => s + ((r.mql as number) ?? 0), 0),
  };
}

async function main(): Promise<void> {
  if (!isKommoConfigured() || !getSupabaseAdmin()) {
    console.error("Kommo o Supabase no configurado");
    process.exit(1);
  }

  console.log("Simulación corrección dashboard · ene–may 2026\n");

  const lossReasons = await loadLossReasonCatalog();
  const allStatuses = await fetchKommoStatuses();
  const clientMap = getKommoClientMap();
  const rows: MonthClientRow[] = [];

  for (const { label, since, until } of MONTHS) {
    console.log(`\n── ${label} ──`);
    const actualSnaps = await buildKommoMonthlyCohortSnapshots(since, until);

    for (const [pidStr, client] of Object.entries(clientMap).sort((a, b) =>
      a[1].localeCompare(b[1]),
    )) {
      const pipelineId = Number(pidStr);
      const statusTierById = buildStatusTierMap(allStatuses, pipelineId);
      const actual = actualSnaps.find((s) => s.client === client);
      if (!actual) continue;

      const auditRef = await buildAuditReferenceSnapshot(
        client,
        pipelineId,
        since,
        until,
        statusTierById,
        lossReasons,
      );

      const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
      const { from, to } = toAccountUnixRange(since, until);
      let page = 1;
      while (true) {
        const data = await kommoGet<{
          _embedded?: { leads?: Array<{ id: number; status_id?: number }> };
        }>("/leads", {
          params: {
            page,
            limit: 250,
            "filter[pipeline_id]": pipelineId,
            "filter[created_at][from]": from,
            "filter[created_at][to]": to,
          },
          timeout: 120_000,
        });
        const batch = data._embedded?.leads ?? [];
        for (const l of batch) {
          const tier = statusTierById.get(l.status_id ?? 0) ?? "entrada";
          if (tier !== "firmado") cohort.push({ id: l.id, tier });
        }
        if (!batch.length || batch.length < 250) break;
        page += 1;
      }

      const corrected = await buildCorrectedReachedSnapshot(
        actual,
        cohort,
        client,
        until,
        statusTierById,
        lossReasons,
      );

      const stored = await sumDashboardStored(client, since, until);
      const stage = stageColumnReached(actual);

      const deltaActual = actual.reachedMql - auditRef.reachedMql;
      const deltaCorrected = corrected.reachedMql - auditRef.reachedMql;
      const deltaFix = corrected.reachedMql - actual.reachedMql;

      const row: MonthClientRow = {
        month: label,
        client,
        kommo_conv: auditRef.conv,
        kommo_activos_mql: stage.mql,
        kommo_reached_mql_audit: auditRef.reachedMql,
        kommo_reached_sql_audit: auditRef.reachedSql,
        kommo_reached_cita_audit: auditRef.reachedCita,
        dashboard_actual_mql: actual.reachedMql,
        dashboard_corrected_mql: corrected.reachedMql,
        dash_stored_conv: stored.conv,
        dash_stored_mql: stored.mql,
        delta_actual_vs_audit: deltaActual,
        delta_corrected_vs_audit: deltaCorrected,
        delta_corrected_vs_actual: deltaFix,
        conv_ok: stored.conv === auditRef.conv || Math.abs(stored.conv - auditRef.conv) <= 1,
        worth_correcting:
          Math.abs(deltaActual) > Math.abs(deltaCorrected) && Math.abs(deltaFix) >= 2,
      };
      rows.push(row);

      if (Math.abs(deltaActual) >= 3 || Math.abs(deltaFix) >= 2) {
        console.log(
          `  ${client.padEnd(16)} conv ${auditRef.conv} (dash Σ${stored.conv}) | ` +
            `MQL audit ${auditRef.reachedMql} actual ${actual.reachedMql} corr ${corrected.reachedMql} ` +
            `(Δ actual ${deltaActual >= 0 ? "+" : ""}${deltaActual}, post-fix ${deltaCorrected >= 0 ? "+" : ""}${deltaCorrected})`,
        );
      }
    }
  }

  const byMonth = new Map<string, MonthClientRow[]>();
  for (const r of rows) {
    const list = byMonth.get(r.month) ?? [];
    list.push(r);
    byMonth.set(r.month, list);
  }

  let totalActualGap = 0;
  let totalCorrectedGap = 0;
  let totalFixMql = 0;
  let cellsWorthFix = 0;
  let cellsTotal = 0;

  for (const r of rows) {
    totalActualGap += Math.abs(r.delta_actual_vs_audit);
    totalCorrectedGap += Math.abs(r.delta_corrected_vs_audit);
    totalFixMql += r.delta_corrected_vs_actual;
    cellsTotal += 1;
    if (r.worth_correcting) cellsWorthFix += 1;
  }

  const convMismatches = rows.filter((r) => !r.conv_ok);

  const recommendation =
    totalCorrectedGap < totalActualGap * 0.5
      ? "CONVENIENTE con reservas: la corrección por motivo acerca el dashboard a la referencia Kommo en MQL alcanzado."
      : totalFixMql <= 15
        ? "POCO CONVENIENTE: el ajuste mueve pocos MQL en ene–may; priorizar otras mejoras (LXC es problema de captura en Kommo, no de dashboard)."
        : "CONVENIENTE para MQL/SQL/CITA en clientes con Δ≥3; no corrige irregularidades LXC ni conv.";

  const report = {
    generated_at: new Date().toISOString(),
    period: "2026-01 → 2026-05",
    methodology: {
      kommo_conv: "Leads creados en el mes (API filter created_at)",
      kommo_reached_mql_audit:
        "Activos MQL+ + rechazados con max(timeline, motivo MQL/SQL/CITA)",
      dashboard_actual: "buildKommoMonthlyCohortSnapshots + enrichSnapshotReachedFromTimeline (Gregorio)",
      dashboard_corrected: "Misma cohorte; pre-rechazo con max(timeline, motivo MQL/SQL/CITA)",
      dash_stored: "Suma dashboard_metrics_daily (metrics_source=timeline si existe)",
    },
    totals: {
      sum_abs_gap_actual_vs_audit: totalActualGap,
      sum_abs_gap_corrected_vs_audit: totalCorrectedGap,
      sum_mql_gain_if_corrected: totalFixMql,
      cells_worth_correcting: cellsWorthFix,
      cells_total: cellsTotal,
      conv_mismatch_cells: convMismatches.length,
    },
    recommendation,
    rows,
    monthly_summary: [...byMonth.entries()].map(([month, list]) => ({
      month,
      kommo_conv: list.reduce((a, r) => a + r.kommo_conv, 0),
      audit_mql: list.reduce((a, r) => a + r.kommo_reached_mql_audit, 0),
      actual_mql: list.reduce((a, r) => a + r.dashboard_actual_mql, 0),
      corrected_mql: list.reduce((a, r) => a + r.dashboard_corrected_mql, 0),
      stored_mql: list.reduce((a, r) => a + r.dash_stored_mql, 0),
      stored_conv: list.reduce((a, r) => a + r.dash_stored_conv, 0),
    })),
  };

  const outDir = join(process.cwd(), "reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "simulate-dashboard-correction-jan-may-2026.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("RESUMEN GLOBAL (ene–may)");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`Gap |actual − audit| (suma abs por celda):  ${totalActualGap}`);
  console.log(`Gap |corregido − audit| (suma abs):         ${totalCorrectedGap}`);
  console.log(`MQL ganados si corrigieras (neto):          ${totalFixMql >= 0 ? "+" : ""}${totalFixMql}`);
  console.log(`Celdas donde conviene corregir (Δ≥2):      ${cellsWorthFix}/${cellsTotal}`);
  console.log(`\n→ ${recommendation}`);
  console.log(`\nJSON: ${jsonPath}`);

  console.log("\n── Por mes (MQL alcanzado agregado) ──");
  console.log("Mes      | Kommo audit | Dash actual | Dash corregido | Dash almacenado");
  for (const m of report.monthly_summary) {
    console.log(
      `${m.month} | ${String(m.audit_mql).padStart(11)} | ${String(m.actual_mql).padStart(11)} | ${String(m.corrected_mql).padStart(14)} | ${String(m.stored_mql).padStart(15)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
