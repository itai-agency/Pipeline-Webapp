/**
 * Simula impacto de reconstrucción por motivo MQL/SQL/CITA (sin persistir).
 *
 * Uso: node --use-system-ca --import tsx scripts/evaluate-motivo-reconstruction-impact.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  assertAuditReady,
  AUDIT_SINCE,
  AUDIT_UNTIL,
  REPORTS_DIR,
  runFullRejectionAudit,
  TIER_RANK,
  motivoRank,
  writeJsonReport,
  type LeadAuditRecord,
} from "./lib/rejectionAuditShared.js";
import {
  classifyKommoStageTier,
  tierReachedMql,
  tierReachedSql,
  tierReachedCita,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { getKommoClientMap, isKommoConfigured } from "../server/config/env.js";
import { toAccountUnixRange, toAccountDateIso } from "../server/lib/dateRanges.js";
import { kommoGet } from "../server/lib/kommoApi.js";

function monthKeyFromUnix(ts: number | null): string {
  if (ts == null) return "unknown";
  const iso = toAccountDateIso(new Date(ts * 1000));
  return iso.slice(0, 7);
}

function reconstructedRank(record: LeadAuditRecord): number {
  const timelineRank = record.timeline_max_rank;
  const motivo = motivoRank(record.motivo_tier);
  if (record.motivo_tier === "mql" || record.motivo_tier === "sql" || record.motivo_tier === "cita") {
    return Math.max(timelineRank, motivo);
  }
  return timelineRank;
}

function reachedFromRank(rank: number): { mql: boolean; sql: boolean; cita: boolean } {
  return {
    mql: rank >= TIER_RANK.mql,
    sql: rank >= TIER_RANK.sql,
    cita: rank >= TIER_RANK.cita,
  };
}

async function fetchCohortLeads(
  pipelineId: number,
  since: string,
  until: string,
): Promise<Array<{ id: number; tier: KommoStageTier; created_at: number | null }>> {
  const pipes = await kommoGet<{
    _embedded?: {
      pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }>;
    };
  }>("/leads/pipelines");
  const statusTier = new Map<number, KommoStageTier>();
  for (const s of pipes._embedded?.pipelines?.find((p) => p.id === pipelineId)?._embedded?.statuses ??
    []) {
    statusTier.set(s.id, classifyKommoStageTier(s.name));
  }

  const { from, to } = toAccountUnixRange(since, until);
  const leads: Array<{ id: number; tier: KommoStageTier; created_at: number | null }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{
      _embedded?: { leads?: Array<{ id: number; status_id?: number; created_at?: number }> };
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
      const tier = statusTier.get(l.status_id ?? 0) ?? "entrada";
      if (tier !== "firmado") {
        leads.push({ id: l.id, tier, created_at: l.created_at ?? null });
      }
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }
  return leads;
}

async function main(): Promise<void> {
  if (!isKommoConfigured()) {
    console.error("Kommo no configurado");
    process.exit(1);
  }

  const auditPath = join(REPORTS_DIR, "rejection-audit-ene-jun-2026.json");
  let records: LeadAuditRecord[];

  if (existsSync(auditPath)) {
    records = (JSON.parse(readFileSync(auditPath, "utf8")) as { all_records: LeadAuditRecord[] })
      .all_records;
    console.log(`Cargados ${records.length} registros`);
  } else {
    assertAuditReady();
    records = (await runFullRejectionAudit()).records;
  }

  const rejectedById = new Map(records.map((r) => [r.id, r]));
  const clientMap = getKommoClientMap();
  const byClientMonth: Record<
    string,
    Record<
      string,
      {
        active_mql: number;
        active_sql: number;
        active_cita: number;
        rej_mql_current: number;
        rej_sql_current: number;
        rej_cita_current: number;
        rej_mql_reconstructed: number;
        rej_sql_reconstructed: number;
        rej_cita_reconstructed: number;
        leads_affected: number;
      }
    >
  > = {};

  for (const [pidStr, client] of Object.entries(clientMap)) {
    const pipelineId = Number(pidStr);
    console.log(`Evaluando ${client}…`);
    const cohort = await fetchCohortLeads(pipelineId, AUDIT_SINCE, AUDIT_UNTIL);
    byClientMonth[client] = {};

    for (const lead of cohort) {
      const month = monthKeyFromUnix(lead.created_at);
      byClientMonth[client][month] ??= {
        active_mql: 0,
        active_sql: 0,
        active_cita: 0,
        rej_mql_current: 0,
        rej_sql_current: 0,
        rej_cita_current: 0,
        rej_mql_reconstructed: 0,
        rej_sql_reconstructed: 0,
        rej_cita_reconstructed: 0,
        leads_affected: 0,
      };
      const bucket = byClientMonth[client][month]!;

      if (lead.tier !== "rejected") {
        if (tierReachedMql(lead.tier)) bucket.active_mql += 1;
        if (tierReachedSql(lead.tier)) bucket.active_sql += 1;
        if (tierReachedCita(lead.tier)) bucket.active_cita += 1;
        continue;
      }

      const rec = rejectedById.get(lead.id);
      if (!rec) continue;

      const cur = reachedFromRank(rec.timeline_max_rank);
      const recon = reachedFromRank(reconstructedRank(rec));

      if (cur.mql) bucket.rej_mql_current += 1;
      if (cur.sql) bucket.rej_sql_current += 1;
      if (cur.cita) bucket.rej_cita_current += 1;
      if (recon.mql) bucket.rej_mql_reconstructed += 1;
      if (recon.sql) bucket.rej_sql_reconstructed += 1;
      if (recon.cita) bucket.rej_cita_reconstructed += 1;

      if (
        (rec.motivo_tier === "mql" || rec.motivo_tier === "sql" || rec.motivo_tier === "cita") &&
        reconstructedRank(rec) > rec.timeline_max_rank
      ) {
        bucket.leads_affected += 1;
      }
    }
  }

  const clientTotals = Object.entries(byClientMonth).map(([client, months]) => {
    const agg = {
      active_mql: 0,
      active_sql: 0,
      active_cita: 0,
      reached_mql_current: 0,
      reached_sql_current: 0,
      reached_cita_current: 0,
      reached_mql_reconstructed: 0,
      reached_sql_reconstructed: 0,
      reached_cita_reconstructed: 0,
      leads_affected: 0,
    };
    for (const m of Object.values(months)) {
      agg.active_mql += m.active_mql;
      agg.active_sql += m.active_sql;
      agg.active_cita += m.active_cita;
      agg.reached_mql_current += m.active_mql + m.rej_mql_current;
      agg.reached_sql_current += m.active_sql + m.rej_sql_current;
      agg.reached_cita_current += m.active_cita + m.rej_cita_current;
      agg.reached_mql_reconstructed += m.active_mql + m.rej_mql_reconstructed;
      agg.reached_sql_reconstructed += m.active_sql + m.rej_sql_reconstructed;
      agg.reached_cita_reconstructed += m.active_cita + m.rej_cita_reconstructed;
      agg.leads_affected += m.leads_affected;
    }
    const deltaMql = agg.reached_mql_reconstructed - agg.reached_mql_current;
    const material = deltaMql >= 5 || agg.leads_affected >= 10;
    return {
      client,
      ...agg,
      delta_mql: deltaMql,
      delta_sql: agg.reached_sql_reconstructed - agg.reached_sql_current,
      delta_cita: agg.reached_cita_reconstructed - agg.reached_cita_current,
      mejora_material: material,
      veredicto: material
        ? `Sí, +${deltaMql} MQL alcanzado (${agg.leads_affected} leads afectados)`
        : `No material (+${deltaMql} MQL, ${agg.leads_affected} leads)`,
    };
  });

  const global = {
    leads_affected: clientTotals.reduce((a, c) => a + c.leads_affected, 0),
    delta_mql: clientTotals.reduce((a, c) => a + c.delta_mql, 0),
    delta_sql: clientTotals.reduce((a, c) => a + c.delta_sql, 0),
    delta_cita: clientTotals.reduce((a, c) => a + c.delta_cita, 0),
    conv_unchanged: true,
    conclusion:
      clientTotals.reduce((a, c) => a + c.delta_mql, 0) <= 20
        ? "Impacto bajo: reconstrucción por motivo MQL/SQL/CITA no cambiaría materialmente los KPIs de embudo."
        : "Impacto moderado: revisar clientes con mejora_material=true antes de aplicar.",
  };

  writeJsonReport("reconstruction-impact-ene-jun-2026.json", {
    generated_at: new Date().toISOString(),
    cohort: { since: AUDIT_SINCE, until: AUDIT_UNTIL },
    global,
    by_client: clientTotals,
    by_client_month: byClientMonth,
  });

  console.log("\n=== Impacto reconstrucción (simulado) ===");
  console.log(JSON.stringify(global, null, 2));
  for (const c of clientTotals) {
    console.log(`  ${c.client}: ${c.veredicto}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
