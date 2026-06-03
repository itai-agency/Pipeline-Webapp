/**
 * Snapshot Kommo para TODOS los clientes del mapa (censo por pipeline).
 *
 * Uso:
 *   npm run sync:kommo-snapshot
 *   KOMMO_SNAPSHOT_DATE=2026-05-26 npm run sync:kommo-snapshot
 */
import { currentMonthRange, toAccountDateIso } from "../server/lib/dateRanges.js";
import { syncKommoSnapshotMetrics } from "../server/services/kommo.service.js";
import { monthRangeEndingOn } from "../server/lib/dateRanges.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";
import { isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { getKommoControlMetrics } from "../server/config/kommoControlReference.js";

const snapshotDate = process.env.KOMMO_SNAPSHOT_DATE ?? toAccountDateIso();
const month = currentMonthRange();

async function main(): Promise<void> {
  if (!isSupabaseConfigured() || !isKommoConfigured()) {
    console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KOMMO_SUBDOMAIN o KOMMO_ACCESS_TOKEN en .env.local");
    process.exit(1);
  }

  console.log(`=== Snapshot Kommo (todos los clientes) ===`);
  console.log(`Corte: ${snapshotDate} · Mes: ${month.since} → ${month.until}\n`);

  console.log(
    "Nota: no borra el mes. Para métricas por día use: npm run rebuild:kommo-daily\n",
  );

  const cohort = monthRangeEndingOn(snapshotDate);
  const { processed, snapshots } = await syncKommoSnapshotMetrics({
    snapshotDate,
    monthStart: cohort.since,
    monthEnd: cohort.until,
    replaceMonth: process.env.KOMMO_SNAPSHOT_REPLACE_MONTH === "true",
  });

  console.log("\n--- Resumen por cliente ---");
  for (const s of [...snapshots].sort((a, b) => a.client.localeCompare(b.client))) {
    const ref = getKommoControlMetrics(s.client);
    const refStr = ref
      ? `  → control: leads=${ref.leads} mql=${ref.reachedMql} sql=${ref.reachedSql} citas=${ref.reachedCita}`
      : "";
    console.log(
      `${s.client.padEnd(16)} API leads=${String(s.leads).padStart(4)}  mql=${String(s.reachedMql).padStart(3)}  sql=${String(s.reachedSql).padStart(3)}  citas=${String(s.reachedCita).padStart(3)}${refStr}`,
    );
  }

  console.log(
    `\nListo: auditoría de censo en ${snapshotDate} (${processed} clientes).`,
  );
  console.log("Para el dashboard diario: npm run rebuild:kommo-daily");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
