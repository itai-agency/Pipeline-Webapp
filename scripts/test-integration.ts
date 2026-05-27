/**
 * Prueba rápida: health → Meta sync → Kommo sync → snapshot
 * Uso: npx tsx scripts/test-integration.ts
 */
import { env, isKommoConfigured, isMetaConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { getDashboardSnapshot } from "../server/services/metrics.service.js";
import { syncKommoLeads } from "../server/services/kommo.service.js";
import { syncMetaSpend } from "../server/services/meta.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";
import { currentMonthRange } from "../server/lib/dateRanges.js";

const defaultRange = currentMonthRange();
const since = process.env.TEST_SINCE ?? defaultRange.since;
const until = process.env.TEST_UNTIL ?? defaultRange.until;

async function main(): Promise<void> {
  console.log("=== Integración Pipeline ===\n");
  console.log("Supabase:", isSupabaseConfigured() ? "OK" : "NO");
  console.log("Meta:", isMetaConfigured() ? "OK" : "NO");
  console.log("Kommo:", isKommoConfigured() ? "OK" : "NO");
  console.log("Rango:", since, "→", until, "\n");

  if (!isSupabaseConfigured()) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  if (isMetaConfigured()) {
    console.log("--- Sync Meta ---");
    try {
      const n = await syncMetaSpend({ since, until });
      console.log(`Meta: ${n} filas upserted`);
    } catch (err) {
      console.error("Meta sync falló:", err instanceof Error ? err.message : err);
    }
  }

  if (isKommoConfigured()) {
    console.log("\n--- Sync Kommo ---");
    try {
      const { processed, skipped } = await syncKommoLeads({ since, until });
      console.log(`Kommo: ${processed} leads procesados, ${skipped} omitidos`);
    } catch (err) {
      console.error("Kommo sync falló:", err instanceof Error ? err.message : err);
    }
  }

  console.log("\n--- Refresh métricas ---");
  await refreshAndBroadcast();

  console.log("\n--- Snapshot ---");
  const snapshot = await getDashboardSnapshot();
  console.log("Daily rows:", snapshot.daily.length);
  console.log("Meta spend rows:", snapshot.metaSpend.length);
  console.log("SDR history rows:", snapshot.sdrHistory.length);
  console.log("Latest date:", snapshot.latestDate);
  console.log("Synced at:", snapshot.syncedAt);

  if (snapshot.daily.length > 0) {
    console.log("\nMuestra (primer registro):", JSON.stringify(snapshot.daily[0], null, 2));
  }

  console.log("\n=== Listo ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
