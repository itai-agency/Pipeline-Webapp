/**
 * Backfill: historial real de Kommo (GET /api/v4/events, lead_status_changed).
 * Cada cambio de etapa → kommo_lead_events con event_date = día del movimiento.
 *
 * Uso:
 *   npm run backfill:kommo-year
 *   KOMMO_BACKFILL_YEAR=2026 npm run backfill:kommo-year
 *
 * Requiere migración 002_kommo_timeline_events.sql en Supabase.
 */
import { isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { yearMonthChunks, yearToDateRange } from "../server/lib/dateRanges.js";
import { purgeUnmappedKommoData } from "../server/services/kommo.service.js";
import { syncKommoStatusChangeEvents } from "../server/services/kommoTimeline.service.js";
import { rebuildMetricsFromSources } from "../server/services/metrics.service.js";

const year = Number(process.env.KOMMO_BACKFILL_YEAR) || new Date().getFullYear();
/** Reanudar desde un mes: KOMMO_BACKFILL_FROM_MONTH=2026-03 */
const fromMonth = process.env.KOMMO_BACKFILL_FROM_MONTH;
const skipPurge = process.argv.includes("--resume") || Boolean(fromMonth);
const yearRange = yearToDateRange(year);

async function main(): Promise<void> {
  console.log("=== Backfill Kommo (timeline / lead_status_changed) ===\n");
  console.log("Año:", year);
  console.log("Rango:", yearRange.since, "→", yearRange.until);
  console.log("Fuente: API /events (movimientos de etapa, no estado actual del lead)");
  console.log(
    "Requisito: migración 003 en Supabase (unique en kommo_event_id). Ver supabase/migrations/003_fix_kommo_event_id_unique.sql\n",
  );

  if (!isSupabaseConfigured()) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  if (!isKommoConfigured()) {
    console.error("Falta KOMMO_SUBDOMAIN o KOMMO_ACCESS_TOKEN en .env.local");
    process.exit(1);
  }

  const { events, metrics } = skipPurge
    ? { events: 0, metrics: 0 }
    : await purgeUnmappedKommoData();
  if (events > 0 || metrics > 0) {
    console.log(`Purge inicial: ${events} eventos, ${metrics} métricas huérfanas\n`);
  } else if (skipPurge) {
    console.log("Modo reanudar: sin purge (--resume o KOMMO_BACKFILL_FROM_MONTH)\n");
  }

  let totalProcessed = 0;
  let totalSkipped = 0;

  const runs = yearMonthChunks(year).filter((chunk) => !fromMonth || chunk.label >= fromMonth);
  if (fromMonth) {
    console.log(`Reanudando desde mes ${fromMonth} (${runs.length} meses restantes)\n`);
  }
  for (const chunk of runs) {
    console.log(`--- ${chunk.label}: ${chunk.since} → ${chunk.until} ---`);
    const { processed, skipped } = await syncKommoStatusChangeEvents({
      since: chunk.since,
      until: chunk.until,
    });
    totalProcessed += processed;
    totalSkipped += skipped;
    console.log(`Acumulado: ${totalProcessed} eventos, ${totalSkipped} omitidos\n`);
  }

  console.log("--- Reconstruir dashboard_metrics_daily ---");
  const metricsRows = await rebuildMetricsFromSources(yearRange.since, yearRange.until);
  console.log(`Filas métricas upserted (aprox.): ${metricsRows}`);
  console.log("\nListo. event_date = día en que el lead CAMBIÓ de etapa (API events).");
  console.log("Rebuild: npm run rebuild:kommo-daily -- --since", yearRange.since, "--until", yearRange.until);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
