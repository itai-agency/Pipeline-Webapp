/**
 * Valida: reached* = activos + rechazados (máx. tier pre-rechazo SOLO por timeline).
 * Compara dashboard actual (Gregorio con umbral) vs simulación siempre aplicada.
 *
 * Uso: node --use-system-ca --import tsx scripts/simulate-timeline-reached-jan-may.ts
 */
import "../server/config/env.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getKommoClientMap, isKommoConfigured } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import { buildStatusTierMap, stageColumnReached } from "../server/lib/kommoReachedMetrics.js";
import { buildKommoMonthlyCohortSnapshots, fetchKommoStatuses } from "../server/services/kommo.service.js";
import {
  loadTimelinesForLeads,
  computeMaxPreRejectTier,
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

type ReachedCounts = { mql: number; sql: number; cita: number };

type SimRow = {
  month: string;
  client: string;
  conv: number;
  activos_mql: number;
  pre_reject_mql: number;
  pre_reject_sin_eventos: number;
  sim_timeline_mql: number;
  sim_timeline_sql: number;
  sim_timeline_cita: number;
  dashboard_actual_mql: number;
  dashboard_actual_sql: number;
  dashboard_actual_cita: number;
  gregorio_applied: boolean;
  delta_sim_vs_actual_mql: number;
  control_mql: number | null;
  delta_sim_vs_control_mql: number | null;
};

async function fetchCohort(
  pipelineId: number,
  statusTierById: Map<number, KommoStageTier>,
  since: string,
  until: string,
): Promise<Array<{ id: number; tier: KommoStageTier }>> {
  const { from, to } = toAccountUnixRange(since, until);
  const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
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
    const rows = data._embedded?.leads ?? [];
    for (const l of rows) {
      const tier = statusTierById.get(l.status_id ?? 0) ?? "entrada";
      if (tier !== "firmado") cohort.push({ id: l.id, tier });
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }
  return cohort;
}

async function computeTimelineReached(
  client: string,
  cohort: Array<{ id: number; tier: KommoStageTier }>,
  statusTierById: Map<number, KommoStageTier>,
  monthEnd: string,
): Promise<{
  reached: ReachedCounts;
  preRejectMql: number;
  preRejectSinEventos: number;
  activosMql: number;
}> {
  const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);
  const timelines = await loadTimelinesForLeads(client, rejectedIds);

  let preMql = 0;
  let preSql = 0;
  let preCita = 0;
  let sinEventos = 0;

  for (const id of rejectedIds) {
    const events = timelines.get(id) ?? [];
    if (!events.length) {
      sinEventos += 1;
      continue;
    }
    const { maxRank } = computeMaxPreRejectTier(events as TimelineRow[], statusTierById);
    if (maxRank < 0) {
      sinEventos += 1;
      continue;
    }
    if (maxRank >= TIER_RANK.mql) preMql += 1;
    if (maxRank >= TIER_RANK.sql) preSql += 1;
    if (maxRank >= TIER_RANK.cita) preCita += 1;
  }

  const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
  const activeSql = cohort.filter((c) => c.tier !== "rejected" && tierReachedSql(c.tier)).length;
  const activeCita = cohort.filter((c) => c.tier !== "rejected" && tierReachedCita(c.tier)).length;

  return {
    reached: {
      mql: activeMql + preMql,
      sql: activeSql + preSql,
      cita: activeCita + preCita,
    },
    preRejectMql: preMql,
    preRejectSinEventos: sinEventos,
    activosMql: activeMql,
  };
}

async function main(): Promise<void> {
  if (!isKommoConfigured() || !getSupabaseAdmin()) {
    console.error("Kommo o Supabase no configurado");
    process.exit(1);
  }

  console.log("Simulación timeline-only: activos + rechazados (máx. pre-rechazo)\n");

  const allStatuses = await fetchKommoStatuses();
  const clientMap = getKommoClientMap();
  const rows: SimRow[] = [];

  for (const { label, since, until } of MONTHS) {
    console.log(`── ${label} ──`);
    const actualSnaps = await buildKommoMonthlyCohortSnapshots(since, until);

    for (const [pidStr, client] of Object.entries(clientMap).sort((a, b) =>
      a[1].localeCompare(b[1]),
    )) {
      const pipelineId = Number(pidStr);
      const statusTierById = buildStatusTierMap(allStatuses, pipelineId);
      const actual = actualSnaps.find((s) => s.client === client);
      if (!actual) continue;

      const cohort = await fetchCohort(pipelineId, statusTierById, since, until);
      const { reached, preRejectMql, preRejectSinEventos, activosMql } =
        await computeTimelineReached(client, cohort, statusTierById, until);

      const stage = stageColumnReached(actual);
      const gregorioWouldApply =
        preRejectMql >= 20 && stage.mql >= 10 && preRejectMql > stage.mql;

      let controlMql: number | null = null;
      if (
        label === "2026-05" &&
        until === "2026-05-31" &&
        KOMMO_CONTROL_REFERENCE.clients[client]
      ) {
        controlMql = KOMMO_CONTROL_REFERENCE.clients[client].reachedMql;
      }

      const row: SimRow = {
        month: label,
        client,
        conv: cohort.length,
        activos_mql: activosMql,
        pre_reject_mql: preRejectMql,
        pre_reject_sin_eventos: preRejectSinEventos,
        sim_timeline_mql: reached.mql,
        sim_timeline_sql: reached.sql,
        sim_timeline_cita: reached.cita,
        dashboard_actual_mql: actual.reachedMql,
        dashboard_actual_sql: actual.reachedSql,
        dashboard_actual_cita: actual.reachedCita,
        gregorio_applied: gregorioWouldApply,
        delta_sim_vs_actual_mql: reached.mql - actual.reachedMql,
        control_mql: controlMql,
        delta_sim_vs_control_mql: controlMql != null ? reached.mql - controlMql : null,
      };
      rows.push(row);

      if (Math.abs(row.delta_sim_vs_actual_mql) >= 3) {
        console.log(
          `  ${client.padEnd(16)} conv ${row.conv} | sim MQL ${reached.mql} (act ${activosMql}+preRej ${preRejectMql}) ` +
            `vs dash ${actual.reachedMql} (Δ${row.delta_sim_vs_actual_mql >= 0 ? "+" : ""}${row.delta_sim_vs_actual_mql})` +
            `${gregorioWouldApply ? " [Gregorio sí]" : " [Gregorio NO]"}`,
        );
      }
    }
  }

  // Mayo 1–26 corte control HTML
  console.log("\n── Corte control mayo 1–26 (referencia HTML) ──");
  const maySnaps = await buildKommoMonthlyCohortSnapshots("2026-05-01", "2026-05-26");
  const mayControlRows: Array<{
    client: string;
    control: number;
    sim: number;
    actual: number;
    delta: number;
  }> = [];

  for (const [pidStr, client] of Object.entries(clientMap).sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const ref = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!ref) continue;
    const pipelineId = Number(pidStr);
    const statusTierById = buildStatusTierMap(allStatuses, pipelineId);
    const cohort = await fetchCohort(pipelineId, statusTierById, "2026-05-01", "2026-05-26");
    const { reached } = await computeTimelineReached(
      client,
      cohort,
      statusTierById,
      "2026-05-26",
    );
    const actual = maySnaps.find((s) => s.client === client);
    const delta = reached.mql - ref.reachedMql;
    mayControlRows.push({
      client,
      control: ref.reachedMql,
      sim: reached.mql,
      actual: actual?.reachedMql ?? 0,
      delta,
    });
    const mark = Math.abs(delta) <= 3 ? "✓" : "≠";
    console.log(
      `  ${mark} ${client.padEnd(16)} control ${ref.reachedMql} | sim timeline ${reached.mql} | dash ${actual?.reachedMql ?? "?"} | Δ sim-control ${delta >= 0 ? "+" : ""}${delta}`,
    );
  }

  const sumAbsActualGap = rows.reduce((a, r) => a + Math.abs(r.delta_sim_vs_actual_mql), 0);
  const sumNetFix = rows.reduce((a, r) => a + r.delta_sim_vs_actual_mql, 0);
  const gregorioMissed = rows.filter((r) => !r.gregorio_applied && r.delta_sim_vs_actual_mql >= 5);
  const mayControlAbsGap = mayControlRows.reduce((a, r) => a + Math.abs(r.delta), 0);

  const monthlyAgg = MONTHS.map(({ label }) => {
    const list = rows.filter((r) => r.month === label);
    return {
      month: label,
      conv: list.reduce((a, r) => a + r.conv, 0),
      sim_mql: list.reduce((a, r) => a + r.sim_timeline_mql, 0),
      actual_mql: list.reduce((a, r) => a + r.dashboard_actual_mql, 0),
      delta: list.reduce((a, r) => a + r.delta_sim_vs_actual_mql, 0),
    };
  });

  const verdict =
    mayControlAbsGap <= 30 && sumAbsActualGap > 100
      ? "VALIDADO: timeline-only cierra el gap con dashboard actual; revisar corte mayo vs control HTML."
      : mayControlAbsGap > 50
        ? "PARCIAL: timeline ayuda pero no cuadra del todo con referencia HTML — investigar definición de control."
        : "VALIDADO: aplicar siempre activos + rechazados (timeline) debería alinear el dashboard.";

  const report = {
    generated_at: new Date().toISOString(),
    period: "2026-01 → 2026-05",
    formula:
      "reachedMql = activos MQL+ + rechazados con max tier pre-rechazo >= MQL (solo eventos Supabase/Kommo)",
    totals: {
      sum_abs_gap_sim_vs_dashboard: sumAbsActualGap,
      sum_net_mql_gain: sumNetFix,
      cells_gregorio_not_applied: gregorioMissed.length,
      may_control_abs_gap_sum: mayControlAbsGap,
    },
    verdict,
    monthly_summary: monthlyAgg,
    may_control_corte_26: mayControlRows,
    rows,
  };

  const outDir = join(process.cwd(), "reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "simulate-timeline-reached-jan-may-2026.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("RESUMEN");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`Gap |sim − dashboard| (suma abs):     ${sumAbsActualGap}`);
  console.log(`MQL neto ganado vs dashboard actual: ${sumNetFix >= 0 ? "+" : ""}${sumNetFix}`);
  console.log(`Celdas sin Gregorio con Δ≥5:         ${gregorioMissed.length}`);
  console.log(`Gap |sim − control HTML| mayo 1–26:   ${mayControlAbsGap}`);
  console.log(`\n→ ${verdict}`);
  console.log(`\nJSON: ${path}`);

  console.log("\n── Por mes (MQL alcanzado) ──");
  console.log("Mes      | Sim timeline | Dash actual | Δ");
  for (const m of monthlyAgg) {
    console.log(
      `${m.month} | ${String(m.sim_mql).padStart(12)} | ${String(m.actual_mql).padStart(11)} | ${m.delta >= 0 ? "+" : ""}${m.delta}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
