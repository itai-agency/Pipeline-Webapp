/**
 * Snapshot Kommo alineado al HTML de control (censo por pipeline, corte al día indicado).
 *
 * Uso:
 *   npm run sync:kommo-snapshot
 *   KOMMO_SNAPSHOT_DATE=2026-05-26 npm run sync:kommo-snapshot
 */
import { currentMonthRange, toLocalDateIso } from "../server/lib/dateRanges.js";
import { syncKommoSnapshotMetrics } from "../server/services/kommo.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";
import { isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";

const snapshotDate = process.env.KOMMO_SNAPSHOT_DATE ?? toLocalDateIso();
const month = currentMonthRange();

async function main(): Promise<void> {
  if (!isSupabaseConfigured() || !isKommoConfigured()) {
    console.error("Faltan variables Kommo o Supabase en .env.local");
    process.exit(1);
  }

  console.log(`Snapshot Kommo · corte ${snapshotDate} · mes ${month.since} → ${month.until}\n`);

  const { processed, snapshots } = await syncKommoSnapshotMetrics({
    snapshotDate,
    monthStart: month.since,
    monthEnd: month.until,
  });

  const dos = snapshots.find((s) => s.client === "DOS HOGARES");
  if (dos) {
    console.log(
      `\nDOS HOGARES (esperado ~99 leads, ~4 MQL reached, ~1 SQL): leads=${dos.leads} mql=${dos.reachedMql} sql=${dos.reachedSql} citas=${dos.reachedCita}`,
    );
  }

  await refreshAndBroadcast({ since: month.since, until: month.until });
  console.log(`\nListo: ${processed} clientes escritos en dashboard_metrics_daily`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
