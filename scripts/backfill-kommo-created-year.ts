/**
 * Backfill local: leads creados en el año (filtro created_at en Kommo).
 * No sustituye el sync programado (updated_at); rellena huecos de leads sin movimiento reciente.
 *
 * Uso:
 *   npm run backfill:kommo-year
 *   KOMMO_BACKFILL_YEAR=2026 npm run backfill:kommo-year
 *   npm run backfill:kommo-year -- --whole-year
 *   npm run backfill:kommo-year -- --census
 *
 * Requiere .env.local con Kommo + Supabase (service role).
 */
import { isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { yearMonthChunks, yearToDateRange } from "../server/lib/dateRanges.js";
import { purgeUnmappedKommoData, syncKommoLeads } from "../server/services/kommo.service.js";
import { rebuildMetricsFromSources } from "../server/services/metrics.service.js";

const year = Number(process.env.KOMMO_BACKFILL_YEAR) || new Date().getFullYear();
const wholeYear = process.argv.includes("--whole-year");
const useCensus = process.argv.includes("--census");
const yearRange = yearToDateRange(year);

async function main(): Promise<void> {
  console.log("=== Backfill Kommo (created_at) ===\n");
  console.log("Año:", year);
  console.log(
    "Modo:",
    useCensus
      ? "censo pipeline (NO backfill diario — todo en event_date=hoy)"
      : wholeYear
        ? "rango anual created_at"
        : "mes a mes created_at",
  );
  if (useCensus) {
    console.error("\nError: --census no es backfill por día. Omite --census.\n");
    process.exit(1);
  }
  console.log("Rango anual:", yearRange.since, "→", yearRange.until, "\n");

  if (!isSupabaseConfigured()) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  if (!isKommoConfigured()) {
    console.error("Falta KOMMO_SUBDOMAIN o KOMMO_ACCESS_TOKEN en .env.local");
    process.exit(1);
  }

  const { events, metrics } = await purgeUnmappedKommoData();
  if (events > 0 || metrics > 0) {
    console.log(`Purge inicial: ${events} eventos, ${metrics} métricas huérfanas\n`);
  }

  let totalProcessed = 0;
  let totalSkipped = 0;

  {
    const runs = wholeYear
      ? [{ ...yearRange, label: String(year) }]
      : yearMonthChunks(year);

    for (let i = 0; i < runs.length; i += 1) {
      const chunk = runs[i]!;
      console.log(`--- ${chunk.label}: ${chunk.since} → ${chunk.until} ---`);
      const { processed, skipped } = await syncKommoLeads({
        since: chunk.since,
        until: chunk.until,
        dateFilter: "created_at",
        eventDateField: "created_at",
        skipPurge: true,
      });
      totalProcessed += processed;
      totalSkipped += skipped;
      console.log(`Acumulado: ${totalProcessed} procesados, ${totalSkipped} omitidos\n`);
    }
  }

  console.log("--- Reconstruir dashboard_metrics_daily ---");
  const metricsRows = await rebuildMetricsFromSources(yearRange.since, yearRange.until);
  console.log(`Filas métricas upserted (aprox.): ${metricsRows}`);
  console.log("\nListo. Cada lead queda en event_date = fecha de creación (created_at).");
  console.log("NO ejecutes sync:kommo-snapshot después (pisaba un solo día).");
  console.log("Si hace falta: npm run rebuild:kommo-daily");
  console.log(
    "\nNota: Kommo devuelve la etapa ACTUAL del lead, no la histórica. Rechazados cuentan conversación=1 ese día.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
