/**
 * Extrae cohorte de rechazados ene–jun 2026, clasifica irregularidades LXC,
 * sin especificar y candidatos de reconstrucción. Solo lectura.
 *
 * Uso: node --use-system-ca --import tsx scripts/audit-rejection-anomalies.ts
 */
import {
  assertAuditReady,
  runFullRejectionAudit,
  TIER_DISPLAY,
  writeJsonReport,
} from "./lib/rejectionAuditShared.js";

async function main(): Promise<void> {
  assertAuditReady();
  const { records, summary } = await runFullRejectionAudit();

  const lxcIrregular = records
    .filter((r) => r.bucket.includes("lxc_irregularity"))
    .map((r) => ({
      client: r.client,
      id: r.id,
      name: r.name,
      max_etapa: TIER_DISPLAY[r.timeline_max_tier === "sin_eventos" ? "entrada" : r.timeline_max_tier],
      motivo: r.motivo,
      fecha: r.fecha_rechazo,
    }));

  const sinEspec = records.filter((r) => r.bucket.includes("sin_especificar"));

  writeJsonReport("rejection-audit-ene-jun-2026.json", {
    summary,
    lxc_irregularities: lxcIrregular,
    sin_especificar: sinEspec.map((r) => ({
      client: r.client,
      id: r.id,
      name: r.name,
      fecha_creacion: r.fecha_creacion,
      fecha_rechazo: r.fecha_rechazo,
      etapa: "RECHAZADO",
      motivo: "sin especificar",
      timeline_event_count: r.timeline_event_count,
      solo_rechazado: r.solo_rechazado,
    })),
    reconstruction_candidates: records
      .filter((r) => r.bucket.includes("reconstruction_candidate"))
      .map((r) => ({
        client: r.client,
        id: r.id,
        name: r.name,
        motivo: r.motivo,
        motivo_tier: r.motivo_tier,
        timeline_max_tier: r.timeline_max_tier,
        timeline_max_rank: r.timeline_max_rank,
      })),
    all_records: records,
  });

  writeJsonReport("rejection-audit-summary.json", summary);

  console.log("\n=== Resumen ===");
  console.log(JSON.stringify(summary.totals, null, 2));
  console.log("\nEscrito: reports/rejection-audit-ene-jun-2026.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
